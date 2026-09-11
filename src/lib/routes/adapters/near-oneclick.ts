import { type Address, type Hex, isAddress } from "viem";
import {
  classifyNearExecutionStatus,
  encodeNearDepositTransfer,
  parseNearTransactionHash,
} from "../../gas/near-execution.ts";
import { getNearIntentsExplorerSearchUrl } from "../../intents/deposit-registration.ts";
import { getQuoteFeeBreakdown } from "../../intents/quote-fees.ts";
import {
  executionResponseSchema,
  type MvpQuoteRequest,
  mvpQuoteRequestSchema,
  type NearQuoteResponse,
  type QuoteRequest,
  quoteResponseSchema,
} from "../../intents/schemas.ts";
import { verifyNearQuoteSignature } from "../../intents/signature.ts";
import { platformFeeBpsFor } from "../fee-policy.ts";
import {
  type NormalizedRouteQuote,
  type PreparedRoute,
  type RouteAdapter,
  RouteAdapterError,
  type RouteExecutionStatus,
  type RouteFeeLine,
  type RouteQuoteRequest,
  type RouteSettlement,
} from "../types.ts";

const HASH_PATTERN = /^0x[\da-fA-F]{64}$/;

function adapterError(
  code: ConstructorParameters<typeof RouteAdapterError>[1],
  message: string,
  cause?: unknown,
): never {
  throw new RouteAdapterError("near-1click", code, message, cause);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function assertAddress(value: unknown, label: string) {
  if (typeof value !== "string" || !isAddress(value)) {
    adapterError(
      "invalid_request",
      `The ${label} must be a valid EVM address.`,
    );
  }
}

function assertAsset(asset: RouteQuoteRequest["sourceAsset"], label: string) {
  if (!isRecord(asset)) {
    adapterError("invalid_request", `A ${label} asset is required.`);
  }
  assertAddress(asset.address, `${label} asset address`);
  if (typeof asset.assetId !== "string" || asset.assetId.length === 0) {
    adapterError("invalid_request", `The ${label} asset ID is required.`);
  }
  if (
    !Number.isSafeInteger(asset.chainId) ||
    asset.chainId <= 0 ||
    !Number.isSafeInteger(asset.decimals) ||
    asset.decimals < 0 ||
    typeof asset.symbol !== "string" ||
    asset.symbol.length === 0
  ) {
    adapterError("invalid_request", `The ${label} asset metadata is invalid.`);
  }
}

function buildQuoteRequest(
  request: RouteQuoteRequest,
  dry: boolean,
): MvpQuoteRequest {
  if (!isRecord(request)) {
    return adapterError(
      "invalid_request",
      "A route quote request is required.",
    );
  }

  assertAddress(request.account, "account");
  assertAddress(request.recipient, "recipient");
  assertAddress(request.refundAddress, "refund address");
  assertAsset(request.sourceAsset, "source");
  assertAsset(request.destinationAsset, "destination");

  if (!/^\d+$/.test(request.amount) || BigInt(request.amount) <= 0n) {
    return adapterError(
      "invalid_request",
      "The route amount must be a positive integer string in the source token's smallest unit.",
    );
  }
  if (!Number.isSafeInteger(request.slippageBps) || request.slippageBps < 0) {
    return adapterError(
      "invalid_request",
      "Slippage must be a non-negative integer number of basis points.",
    );
  }

  const parsed = mvpQuoteRequestSchema.safeParse({
    dry,
    swapType: "EXACT_INPUT",
    slippageTolerance: request.slippageBps,
    originAsset: request.sourceAsset.assetId,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: request.destinationAsset.assetId,
    amount: request.amount,
    refundTo: request.refundAddress,
    refundType: "ORIGIN_CHAIN",
    recipient: request.recipient,
    recipientType: "DESTINATION_CHAIN",
    deadline: request.deadline,
    depositMode: "SIMPLE",
  });
  if (!parsed.success) {
    return adapterError(
      "invalid_request",
      "The route quote request is invalid.",
    );
  }
  return parsed.data;
}

function sameAddress(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

function assertQuoteMatchesRequest(
  response: NearQuoteResponse,
  request: MvpQuoteRequest,
  dry: boolean,
) {
  const returned = response.quoteRequest;
  const matches =
    returned.dry === dry &&
    returned.swapType === "EXACT_INPUT" &&
    returned.slippageTolerance === request.slippageTolerance &&
    returned.originAsset === request.originAsset &&
    returned.depositType === "ORIGIN_CHAIN" &&
    returned.destinationAsset === request.destinationAsset &&
    returned.amount === request.amount &&
    returned.refundType === "ORIGIN_CHAIN" &&
    returned.recipientType === "DESTINATION_CHAIN" &&
    returned.deadline === request.deadline &&
    returned.depositMode === request.depositMode &&
    sameAddress(returned.refundTo, request.refundTo) &&
    sameAddress(returned.recipient, request.recipient) &&
    response.quote.amountIn === request.amount;

  if (!matches) {
    adapterError(
      "provider_error",
      "NEAR 1Click returned a quote that does not match the requested route.",
    );
  }
}

function assertFiniteAmount(value: string, label: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    adapterError("provider_error", `NEAR 1Click returned an invalid ${label}.`);
  }
}

function feeAmount(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0";
  return value.toFixed(12).replace(/\.?(0+)$/, "");
}

function feeRateBps(rate: string) {
  const percent = Number(rate.replace(/%$/, ""));
  return Number.isFinite(percent) ? percent * 100 : undefined;
}

function normalizeFees(
  response: NearQuoteResponse,
  configured: QuoteRequest,
  token: RouteQuoteRequest["sourceAsset"],
): RouteFeeLine[] {
  const breakdown = getQuoteFeeBreakdown({
    amountInUsd: response.quote.amountInUsd,
    amountInFormatted: response.quote.amountInFormatted,
    amountOutUsd: response.quote.amountOutUsd,
    appFees: configured.appFees ?? [],
    hasNearIntentsApiKey: Boolean(process.env.NEAR_INTENTS_API_KEY?.trim()),
    // 1Click does not return a feeCosts array. Its signed response does echo
    // every app fee applied, including provider-injected fees. The difference
    // from our configured appFees is the authoritative 1Click fee for this
    // executable quote.
    returnedAppFees: response.quoteRequest.appFees ?? [],
  });
  const tokenInfo = { decimals: token.decimals, symbol: token.symbol };

  return [
    {
      amount: feeAmount(breakdown.oneClickFeeToken),
      deductedFromInput: true,
      kind: "provider",
      label: "NEAR 1Click fee",
      rateBps: feeRateBps(breakdown.oneClickFeeRate),
      token: tokenInfo,
    },
    {
      amount: feeAmount(breakdown.nearProtocolFeeToken),
      deductedFromInput: true,
      kind: "protocol",
      label: "NEAR protocol fee",
      rateBps: feeRateBps(breakdown.nearProtocolFeeRate),
      token: tokenInfo,
    },
    {
      amount: feeAmount(breakdown.platformFeeToken),
      deductedFromInput: true,
      kind: "platform",
      label: "Platform fee",
      rateBps: feeRateBps(breakdown.platformFeeRate),
      token: tokenInfo,
    },
  ];
}

function normalizeQuote(
  response: NearQuoteResponse,
  request: RouteQuoteRequest,
  configured: QuoteRequest,
  expectedRequest: MvpQuoteRequest,
  dry: boolean,
): NormalizedRouteQuote {
  if (!verifyNearQuoteSignature(response)) {
    return adapterError(
      "provider_error",
      "NEAR 1Click returned an invalid quote signature.",
    );
  }
  assertQuoteMatchesRequest(response, expectedRequest, dry);
  assertFiniteAmount(
    response.quote.amountInFormatted,
    "formatted input amount",
  );
  assertFiniteAmount(
    response.quote.amountOutFormatted,
    "formatted output amount",
  );
  assertFiniteAmount(response.quote.amountInUsd, "input USD amount");
  assertFiniteAmount(response.quote.amountOutUsd, "output USD amount");
  if (BigInt(response.quote.minAmountOut) > BigInt(response.quote.amountOut)) {
    return adapterError(
      "provider_error",
      "NEAR 1Click returned an invalid minimum output amount.",
    );
  }
  if (BigInt(response.quote.amountOut) <= 0n) {
    return adapterError("no_route", "NEAR 1Click returned no usable route.");
  }

  return {
    amountIn: response.quote.amountIn,
    amountInFormatted: response.quote.amountInFormatted,
    amountInUsd: response.quote.amountInUsd,
    amountOut: response.quote.amountOut,
    amountOutFormatted: response.quote.amountOutFormatted,
    amountOutUsd: response.quote.amountOutUsd,
    durationSeconds: response.quote.timeEstimate,
    expiresAt:
      response.quote.timeWhenInactive ??
      response.quote.deadline ??
      response.quoteRequest.deadline,
    fees: normalizeFees(response, configured, request.sourceAsset),
    minAmountOut: response.quote.minAmountOut,
    provider: "near-1click",
    providerQuoteId: response.correlationId,
  };
}

async function requestQuote(routeRequest: RouteQuoteRequest, dry: boolean) {
  const expectedRequest = buildQuoteRequest(routeRequest, dry);
  const { configuredQuotePayload, requestOneClick } = await import(
    "../../intents/api.ts"
  );
  const configured = configuredQuotePayload(
    expectedRequest,
    platformFeeBpsFor(
      routeRequest.sourceAsset.chainId,
      routeRequest.sponsorshipRequired,
    ),
  );
  if (!configured.ok) {
    return adapterError(
      "provider_error",
      "NEAR 1Click quote configuration is invalid.",
    );
  }

  const result = await requestOneClick(
    "/v0/quote",
    {
      method: "POST",
      body: JSON.stringify(configured.data),
    },
    // The utility validates the provider response before returning it.
    quoteResponseSchema,
  );
  if (!result.ok) {
    if (result.response.status >= 400 && result.response.status < 500) {
      return adapterError(
        "no_route",
        "NEAR 1Click could not find a route for this request.",
      );
    }
    return adapterError(
      "provider_error",
      "NEAR 1Click quote service is unavailable.",
    );
  }

  return {
    configured: configured.data,
    expectedRequest,
    response: result.data,
  };
}

function validExplorerUrl(value: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function firstExplorerUrl(
  details: { explorerUrl: string }[],
): string | undefined {
  return details
    .map((detail) => validExplorerUrl(detail.explorerUrl))
    .find(Boolean);
}

function firstEvmHash(details: { hash: string }[]): Hex | undefined {
  const hash = details.find((detail) => HASH_PATTERN.test(detail.hash))?.hash;
  return hash as Hex | undefined;
}

function assertNearSettlement(
  settlement: RouteSettlement,
): Extract<RouteSettlement, { kind: "near-1click" }> {
  if (!isRecord(settlement) || settlement.kind !== "near-1click") {
    return adapterError(
      "unsupported",
      "The near-1click adapter can only inspect near-1click settlements.",
    );
  }
  assertAddress(settlement.depositAddress, "settlement deposit address");
  if (
    settlement.depositMemo !== undefined &&
    (typeof settlement.depositMemo !== "string" ||
      settlement.depositMemo.length === 0)
  ) {
    return adapterError(
      "invalid_request",
      "The settlement deposit memo is invalid.",
    );
  }
  if (
    typeof settlement.quoteId !== "string" ||
    settlement.quoteId.length === 0
  ) {
    return adapterError(
      "invalid_request",
      "The settlement quote ID is required.",
    );
  }
  return settlement;
}

function assertStatusMatchesSettlement(
  response: Parameters<typeof verifyNearQuoteSignature>[0],
  settlement: Extract<RouteSettlement, { kind: "near-1click" }>,
) {
  if (
    response.correlationId !== undefined &&
    response.correlationId !== settlement.quoteId
  ) {
    adapterError(
      "provider_error",
      "NEAR 1Click returned status for a different quote.",
    );
  }
  const depositAddress = response.quote.depositAddress;
  if (
    !depositAddress ||
    !isAddress(depositAddress) ||
    !sameAddress(depositAddress, settlement.depositAddress) ||
    (settlement.depositMemo !== undefined &&
      response.quote.depositMemo !== settlement.depositMemo)
  ) {
    adapterError(
      "provider_error",
      "NEAR 1Click returned status for a different deposit address.",
    );
  }
}

export const nearOneClickAdapter: RouteAdapter = {
  id: "near-1click",

  async getQuote(request) {
    const result = await requestQuote(request, true);
    return normalizeQuote(
      result.response,
      request,
      result.configured,
      result.expectedRequest,
      true,
    );
  },

  async prepare(request): Promise<PreparedRoute> {
    const result = await requestQuote(request, false);
    const quote = normalizeQuote(
      result.response,
      request,
      result.configured,
      result.expectedRequest,
      false,
    );
    const depositAddress = result.response.quote.depositAddress;
    if (!depositAddress || !isAddress(depositAddress)) {
      return adapterError(
        "provider_error",
        "NEAR 1Click returned no valid EVM deposit address. No transaction was prepared.",
      );
    }
    const expiresAt = Date.parse(
      result.response.quote.timeWhenInactive ??
        result.response.quote.deadline ??
        result.response.quoteRequest.deadline,
    );
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return adapterError(
        "no_route",
        "NEAR 1Click returned an expired quote. No transaction was prepared.",
      );
    }

    let data: Hex;
    try {
      data = encodeNearDepositTransfer({
        amount: BigInt(quote.amountIn),
        chainId: request.sourceAsset.chainId,
        depositAddress: depositAddress as Address,
        token: request.sourceAsset.address,
      });
    } catch (error) {
      return adapterError(
        "invalid_request",
        "The NEAR 1Click deposit transfer could not be prepared safely.",
        error,
      );
    }

    return {
      calls: [
        {
          data,
          to: request.sourceAsset.address,
          value: "0x0" as Hex,
        },
      ],
      provider: "near-1click",
      quote,
      settlement: {
        depositAddress: depositAddress as Address,
        ...(result.response.quote.depositMemo
          ? { depositMemo: result.response.quote.depositMemo }
          : {}),
        kind: "near-1click",
        quoteId: result.response.correlationId,
      },
      sourceChainId: request.sourceAsset.chainId,
    };
  },

  async getStatus(settlement, sourceTxHash): Promise<RouteExecutionStatus> {
    const nearSettlement = assertNearSettlement(settlement);
    try {
      parseNearTransactionHash(sourceTxHash);
    } catch (error) {
      return adapterError(
        "invalid_request",
        "The source transaction hash must be a complete EVM transaction hash.",
        error,
      );
    }

    const params = new URLSearchParams({
      depositAddress: nearSettlement.depositAddress,
    });
    if (nearSettlement.depositMemo) {
      params.set("depositMemo", nearSettlement.depositMemo);
    }

    const { requestOneClick } = await import("../../intents/api.ts");
    const result = await requestOneClick(
      `/v0/status?${params.toString()}`,
      { method: "GET" },
      executionResponseSchema,
    );
    if (!result.ok) {
      if (!process.env.NEAR_INTENTS_API_KEY?.trim()) {
        return {
          explorerUrl: getNearIntentsExplorerSearchUrl(sourceTxHash),
          kind: "success",
        };
      }
      if (result.response.status >= 400 && result.response.status < 500) {
        return adapterError(
          "no_route",
          "NEAR 1Click has no status for this settlement yet.",
        );
      }
      return adapterError(
        "provider_error",
        "NEAR 1Click status service is unavailable.",
      );
    }
    if (!verifyNearQuoteSignature(result.data.quoteResponse)) {
      return adapterError(
        "provider_error",
        "NEAR 1Click returned an invalid status signature.",
      );
    }
    assertStatusMatchesSettlement(result.data.quoteResponse, nearSettlement);

    const classification = classifyNearExecutionStatus(result.data.status);
    if (classification.kind === "pending") return { kind: "pending" };

    const destinationDetails = result.data.swapDetails.destinationChainTxHashes;
    const originDetails = result.data.swapDetails.originChainTxHashes;
    const explorerUrl =
      firstExplorerUrl(destinationDetails) ??
      firstExplorerUrl(originDetails) ??
      getNearIntentsExplorerSearchUrl(sourceTxHash);

    if (classification.kind === "settled") {
      const destinationTxHash = firstEvmHash(destinationDetails);
      return {
        ...(destinationTxHash ? { destinationTxHash } : {}),
        ...(explorerUrl ? { explorerUrl } : {}),
        kind: "success",
      };
    }

    return {
      explorerUrl,
      kind: "failed",
      message: classification.message,
    };
  },
};

export default nearOneClickAdapter;
