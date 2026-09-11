import { getQuoteFeeBreakdown } from "../../../intents/quote-fees.ts";
import {
  type MvpQuoteRequest,
  mvpQuoteRequestSchema,
  type NearQuoteResponse,
  type QuoteRequest,
  quoteResponseSchema,
} from "../../../intents/schemas.ts";
import { verifyNearQuoteSignature } from "../../../intents/signature.ts";
import { platformFeeBpsFor } from "../../fee-policy.ts";
import type {
  NormalizedRouteQuote,
  RouteFeeLine,
  RouteQuoteRequest,
} from "../../types.ts";
import {
  adapterError,
  assertAddress,
  isRecord,
  sameAddress,
} from "./common.ts";

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

export async function requestNearQuote(
  routeRequest: RouteQuoteRequest,
  dry: boolean,
) {
  const expectedRequest = buildQuoteRequest(routeRequest, dry);
  const { configuredQuotePayload, requestOneClick } = await import(
    "../../../intents/api.ts"
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
    { method: "POST", body: JSON.stringify(configured.data) },
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
    quote: normalizeQuote(
      result.data,
      routeRequest,
      configured.data,
      expectedRequest,
      dry,
    ),
    response: result.data,
  };
}
