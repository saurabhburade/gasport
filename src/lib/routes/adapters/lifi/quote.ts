import { type Address, isAddress } from "viem";
import { platformFeeBpsFor } from "../../fee-policy.ts";
import type {
  NormalizedRouteQuote,
  RouteFeeLine,
  RouteQuoteRequest,
} from "../../types.ts";
import {
  formatAmount,
  invalidRequest,
  isHexBytes,
  isHexQuantity,
  isNativeToken,
  isNonNegativeIntegerString,
  isPositiveInteger,
  isPositiveIntegerString,
  providerError,
  requireAddress,
  requireChainId,
  requireRecord,
  requireString,
} from "./common.ts";
import { BPS_DENOMINATOR } from "./constants.ts";
import { fetchProviderJson, quoteUrl } from "./http.ts";
import type {
  LifiFeeCost,
  LifiPlatformFee,
  LifiQuote,
  LifiToken,
} from "./types.ts";

function parseToken(value: unknown, message: string): LifiToken {
  const record = requireRecord(value, message);
  const address = requireAddress(record, "address", message);
  const chainId = requireChainId(record, "chainId", message);
  const symbol = requireString(record, "symbol", message);
  const decimals = record.decimals;
  if (
    typeof decimals !== "number" ||
    !Number.isSafeInteger(decimals) ||
    decimals < 0 ||
    decimals > 255
  ) {
    throw providerError(message);
  }
  return { address, chainId, decimals, symbol };
}

function parseFeeCost(value: unknown, message: string): LifiFeeCost {
  const record = requireRecord(value, message);
  const amount = record.amount;
  if (!isNonNegativeIntegerString(amount)) throw providerError(message);

  const included = record.included;
  if (included !== undefined && typeof included !== "boolean") {
    throw providerError(message);
  }

  const percentage = record.percentage;
  if (
    percentage !== undefined &&
    (typeof percentage !== "string" || !/^\d+(?:\.\d+)?$/.test(percentage))
  ) {
    throw providerError(message);
  }

  return {
    amount,
    ...(included === undefined ? {} : { included }),
    name:
      typeof record.name === "string" && record.name.length > 0
        ? record.name
        : "LI.FI fee",
    ...(percentage === undefined ? {} : { percentage }),
    token: parseToken(record.token, message),
  };
}

function parseFeeCosts(value: unknown, message: string): LifiFeeCost[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw providerError(message);
  return value.map((item) => parseFeeCost(item, message));
}

function parseLifiQuote(value: unknown): LifiQuote {
  const root = requireRecord(value, "LI.FI returned an invalid quote.");
  if (root.type !== "lifi") {
    throw providerError("LI.FI returned an unsupported quote type.");
  }

  const id = requireString(root, "id", "LI.FI returned an invalid quote.");
  const tool = requireString(
    root,
    "tool",
    "LI.FI returned an invalid route tool.",
  );
  const action = requireRecord(
    root.action,
    "LI.FI returned an invalid quote action.",
  );
  const fromChainId = requireChainId(
    action,
    "fromChainId",
    "LI.FI returned an invalid source chain.",
  );
  const toChainId = requireChainId(
    action,
    "toChainId",
    "LI.FI returned an invalid destination chain.",
  );
  const fromToken = parseToken(
    action.fromToken,
    "LI.FI returned an invalid source token.",
  );
  const toToken = parseToken(
    action.toToken,
    "LI.FI returned an invalid destination token.",
  );
  const fromAmount = action.fromAmount;
  if (!isPositiveIntegerString(fromAmount)) {
    throw providerError("LI.FI returned an invalid input amount.");
  }
  const slippage = action.slippage;
  if (
    typeof slippage !== "number" ||
    !Number.isFinite(slippage) ||
    slippage <= 0 ||
    slippage >= 1
  ) {
    throw providerError("LI.FI returned an invalid slippage value.");
  }

  const fromAddress = requireAddress(
    action,
    "fromAddress",
    "LI.FI returned an invalid sender address.",
  );
  const toAddress = requireAddress(
    action,
    "toAddress",
    "LI.FI returned an invalid recipient address.",
  );

  const estimate = requireRecord(
    root.estimate,
    "LI.FI returned an invalid estimate.",
  );
  const estimateFromAmount = estimate.fromAmount;
  const toAmount = estimate.toAmount;
  const toAmountMin = estimate.toAmountMin;
  if (
    !isPositiveIntegerString(estimateFromAmount) ||
    !isPositiveIntegerString(toAmount) ||
    !isPositiveIntegerString(toAmountMin)
  ) {
    throw providerError("LI.FI returned invalid quote amounts.");
  }

  const approvalAddressValue = estimate.approvalAddress;
  if (
    approvalAddressValue !== undefined &&
    (typeof approvalAddressValue !== "string" ||
      !isAddress(approvalAddressValue))
  ) {
    throw providerError("LI.FI returned an invalid approval address.");
  }
  const approvalAddress = approvalAddressValue as Address | undefined;

  const executionDuration = estimate.executionDuration;
  if (
    executionDuration !== undefined &&
    (typeof executionDuration !== "number" ||
      !Number.isFinite(executionDuration) ||
      executionDuration < 0)
  ) {
    throw providerError("LI.FI returned an invalid execution duration.");
  }

  const toAmountUsd = estimate.toAmountUSD;
  if (
    toAmountUsd !== undefined &&
    (typeof toAmountUsd !== "string" || !/^\d+(?:\.\d+)?$/.test(toAmountUsd))
  ) {
    throw providerError("LI.FI returned an invalid USD estimate.");
  }

  const fromAmountUsd = estimate.fromAmountUSD;
  if (
    fromAmountUsd !== undefined &&
    (typeof fromAmountUsd !== "string" ||
      !/^\d+(?:\.\d+)?$/.test(fromAmountUsd))
  ) {
    throw providerError("LI.FI returned an invalid input USD estimate.");
  }

  const skipApproval = estimate.skipApproval;
  if (skipApproval !== undefined && typeof skipApproval !== "boolean") {
    throw providerError("LI.FI returned an invalid approval requirement.");
  }

  const transactionRequest = requireRecord(
    root.transactionRequest,
    "LI.FI returned an invalid transaction request.",
  );
  const txChainId = requireChainId(
    transactionRequest,
    "chainId",
    "LI.FI returned an invalid transaction chain.",
  );
  const txTo = requireAddress(
    transactionRequest,
    "to",
    "LI.FI returned an invalid transaction target.",
  );
  if (isNativeToken(txTo)) {
    throw providerError("LI.FI returned an invalid transaction target.");
  }
  const txData = transactionRequest.data;
  const txValue = transactionRequest.value;
  if (!isHexBytes(txData) || !isHexQuantity(txValue)) {
    throw providerError("LI.FI returned invalid transaction data.");
  }

  const expiresAt = root.expiresAt;
  if (
    expiresAt !== undefined &&
    (typeof expiresAt !== "string" || Number.isNaN(Date.parse(expiresAt)))
  ) {
    throw providerError("LI.FI returned an invalid quote expiry.");
  }

  return {
    id,
    tool,
    ...(expiresAt === undefined ? {} : { expiresAt }),
    action: {
      fromChainId,
      toChainId,
      fromToken,
      toToken,
      fromAmount,
      slippage,
      fromAddress,
      toAddress,
    },
    estimate: {
      fromAmount: estimateFromAmount,
      toAmount,
      toAmountMin,
      ...(fromAmountUsd === undefined ? {} : { fromAmountUsd }),
      ...(approvalAddress === undefined ? {} : { approvalAddress }),
      ...(executionDuration === undefined ? {} : { executionDuration }),
      ...(toAmountUsd === undefined ? {} : { toAmountUsd }),
      ...(skipApproval === undefined ? {} : { skipApproval }),
      feeCosts: parseFeeCosts(
        estimate.feeCosts,
        "LI.FI returned invalid protocol fees.",
      ),
      gasCosts: parseFeeCosts(
        estimate.gasCosts,
        "LI.FI returned invalid gas costs.",
      ),
    },
    transactionRequest: {
      chainId: txChainId,
      to: txTo,
      data: txData,
      value: txValue,
    },
  };
}

function configuredPlatformFeeRecipient(): Address | undefined {
  const candidates = [
    ["PLATFORM_FEE_RECIPIENT", process.env.PLATFORM_FEE_RECIPIENT],
    ["SPONSORED_GAS_FEE_RECIPIENT", process.env.SPONSORED_GAS_FEE_RECIPIENT],
    ["NEAR_INTENTS_FEE_RECIPIENT", process.env.NEAR_INTENTS_FEE_RECIPIENT],
  ] as const;
  for (const [name, rawRecipient] of candidates) {
    const recipient = rawRecipient?.trim();
    if (!recipient) continue;
    if (!isAddress(recipient)) {
      throw invalidRequest(`${name} must be a valid EVM address.`);
    }
    return recipient;
  }
  return undefined;
}

function platformFeeFor(request: RouteQuoteRequest): LifiPlatformFee {
  const grossAmount = BigInt(request.amount);
  const rateBps = platformFeeBpsFor(
    request.sourceAsset.chainId,
    request.sponsorshipRequired,
  );
  const recipient = configuredPlatformFeeRecipient();
  if (!recipient) return { amount: 0n, providerAmount: grossAmount, rateBps };

  const amount =
    (grossAmount * BigInt(rateBps) + BPS_DENOMINATOR - 1n) / BPS_DENOMINATOR;
  const providerAmount = grossAmount - amount;
  if (providerAmount <= 0n) {
    throw invalidRequest("Amount is too small after the platform fee.");
  }
  return { amount, providerAmount, rateBps, recipient };
}

function feeLines(
  costs: LifiFeeCost[],
  kind: RouteFeeLine["kind"],
  defaultLabel: string,
): RouteFeeLine[] {
  return costs.map((cost) => ({
    amount: formatAmount(cost.amount, cost.token.decimals),
    deductedFromInput: cost.included === true,
    kind,
    label: cost.name || defaultLabel,
    ...(cost.percentage === undefined
      ? {}
      : { rateBps: Number(cost.percentage) * 10_000 }),
    token: { decimals: cost.token.decimals, symbol: cost.token.symbol },
  }));
}

function normalizeQuote(
  quote: LifiQuote,
  request: RouteQuoteRequest,
  platformFee: LifiPlatformFee,
): NormalizedRouteQuote {
  if (
    quote.action.fromChainId !== request.sourceAsset.chainId ||
    quote.action.toChainId !== request.destinationAsset.chainId ||
    quote.action.fromToken.address.toLowerCase() !==
      request.sourceAsset.address.toLowerCase() ||
    quote.action.fromToken.chainId !== request.sourceAsset.chainId ||
    quote.action.toToken.address.toLowerCase() !==
      request.destinationAsset.address.toLowerCase() ||
    quote.action.toToken.chainId !== request.destinationAsset.chainId ||
    quote.action.fromAmount !== platformFee.providerAmount.toString() ||
    quote.estimate.fromAmount !== platformFee.providerAmount.toString() ||
    quote.action.fromAddress.toLowerCase() !== request.account.toLowerCase() ||
    quote.action.toAddress.toLowerCase() !== request.recipient.toLowerCase()
  ) {
    throw providerError("LI.FI returned a quote for different route inputs.");
  }

  const requestedSlippage = request.slippageBps / 10_000;
  if (Math.abs(quote.action.slippage - requestedSlippage) > 0.000001) {
    throw providerError("LI.FI returned a quote with different slippage.");
  }
  if (BigInt(quote.estimate.toAmountMin) > BigInt(quote.estimate.toAmount)) {
    throw providerError("LI.FI returned an invalid minimum output amount.");
  }

  return {
    amountIn: request.amount,
    amountInFormatted: formatAmount(
      request.amount,
      request.sourceAsset.decimals,
    ),
    ...(quote.estimate.fromAmountUsd === undefined
      ? {}
      : { amountInUsd: quote.estimate.fromAmountUsd }),
    amountOut: quote.estimate.toAmount,
    amountOutFormatted: formatAmount(
      quote.estimate.toAmount,
      request.destinationAsset.decimals,
    ),
    ...(quote.estimate.toAmountUsd === undefined
      ? {}
      : { amountOutUsd: quote.estimate.toAmountUsd }),
    ...(quote.estimate.executionDuration === undefined
      ? {}
      : { durationSeconds: quote.estimate.executionDuration }),
    expiresAt: quote.expiresAt ?? request.deadline,
    fees: [
      ...(platformFee.amount === 0n
        ? []
        : [
            {
              amount: formatAmount(
                platformFee.amount.toString(),
                request.sourceAsset.decimals,
              ),
              deductedFromInput: true,
              kind: "platform" as const,
              label: "Platform fee",
              rateBps: platformFee.rateBps,
              token: {
                decimals: request.sourceAsset.decimals,
                symbol: request.sourceAsset.symbol,
              },
            },
          ]),
      ...feeLines(quote.estimate.feeCosts, "provider", "LI.FI fee"),
      ...feeLines(quote.estimate.gasCosts, "source-gas", "Source gas"),
    ],
    minAmountOut: quote.estimate.toAmountMin,
    provider: "lifi",
    providerQuoteId: quote.id,
  };
}

function validateRequest(request: RouteQuoteRequest) {
  if (!isAddress(request.account))
    throw invalidRequest("Invalid account address.");
  if (!isAddress(request.recipient)) {
    throw invalidRequest("Invalid recipient address.");
  }
  if (!isAddress(request.refundAddress)) {
    throw invalidRequest("Invalid refund address.");
  }
  if (!isPositiveIntegerString(request.amount)) {
    throw invalidRequest("Amount must be a positive integer string.");
  }
  if (!isPositiveInteger(request.sourceAsset.chainId)) {
    throw invalidRequest("Invalid source chain ID.");
  }
  if (!isPositiveInteger(request.destinationAsset.chainId)) {
    throw invalidRequest("Invalid destination chain ID.");
  }
  if (!isAddress(request.sourceAsset.address)) {
    throw invalidRequest("Invalid source token address.");
  }
  if (!isAddress(request.destinationAsset.address)) {
    throw invalidRequest("Invalid destination token address.");
  }
  if (
    !Number.isSafeInteger(request.sourceAsset.decimals) ||
    request.sourceAsset.decimals < 0 ||
    request.sourceAsset.decimals > 255 ||
    !Number.isSafeInteger(request.destinationAsset.decimals) ||
    request.destinationAsset.decimals < 0 ||
    request.destinationAsset.decimals > 255
  ) {
    throw invalidRequest("Token decimals are invalid.");
  }
  if (
    !Number.isSafeInteger(request.slippageBps) ||
    request.slippageBps <= 0 ||
    request.slippageBps >= 10_000
  ) {
    throw invalidRequest("Slippage must be between 0 and 10000 basis points.");
  }
  if (
    typeof request.deadline !== "string" ||
    Number.isNaN(Date.parse(request.deadline))
  ) {
    throw invalidRequest("Invalid route deadline.");
  }
}

export async function getLifiQuoteWithRaw(request: RouteQuoteRequest) {
  validateRequest(request);
  const platformFee = platformFeeFor(request);
  const raw = parseLifiQuote(
    await fetchProviderJson(
      quoteUrl(request, platformFee.providerAmount),
      "quote",
    ),
  );
  return {
    platformFee,
    raw,
    quote: normalizeQuote(raw, request, platformFee),
  };
}
