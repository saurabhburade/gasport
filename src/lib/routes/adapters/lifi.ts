import {
  type Address,
  encodeFunctionData,
  formatUnits,
  type Hex,
  isAddress,
  numberToHex,
} from "viem";
import { platformFeeBpsFor } from "../fee-policy.ts";
import type {
  NormalizedRouteQuote,
  PreparedRoute,
  RouteAdapter,
  RouteCall,
  RouteExecutionStatus,
  RouteFeeLine,
  RouteQuoteRequest,
  RouteSettlement,
} from "../types.ts";
import { RouteAdapterError } from "../types.ts";

const LIFI_API_BASE_URL = "https://li.quest/v1";
const NATIVE_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000";
const BPS_DENOMINATOR = 10_000n;
const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
const ERC20_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

type JsonRecord = Record<string, unknown>;

type LifiToken = {
  address: Address;
  chainId: number;
  decimals: number;
  symbol: string;
};

type LifiFeeCost = {
  amount: string;
  included?: boolean;
  name: string;
  percentage?: string;
  token: LifiToken;
};

type LifiTransactionRequest = {
  chainId: number;
  data: Hex;
  to: Address;
  value: Hex;
};

type LifiQuote = {
  action: {
    fromAddress: Address;
    fromAmount: string;
    fromChainId: number;
    fromToken: LifiToken;
    slippage: number;
    toAddress: Address;
    toChainId: number;
    toToken: LifiToken;
  };
  estimate: {
    approvalAddress?: Address;
    executionDuration?: number;
    feeCosts: LifiFeeCost[];
    fromAmount: string;
    fromAmountUsd?: string;
    gasCosts: LifiFeeCost[];
    skipApproval?: boolean;
    toAmount: string;
    toAmountMin: string;
    toAmountUsd?: string;
  };
  expiresAt?: string;
  id: string;
  tool: string;
  transactionRequest: LifiTransactionRequest;
};

type LifiPlatformFee = {
  amount: bigint;
  providerAmount: bigint;
  rateBps: number;
  recipient?: Address;
};

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeIntegerString(value: unknown): value is string {
  return typeof value === "string" && /^(?:0|[1-9]\d*)$/.test(value);
}

function isPositiveIntegerString(value: unknown): value is string {
  return isNonNegativeIntegerString(value) && value !== "0";
}

function isHexBytes(value: unknown): value is Hex {
  return typeof value === "string" && /^0x(?:[\da-fA-F]{2})*$/.test(value);
}

function isHexQuantity(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[\da-fA-F]+$/.test(value);
}

function isTransactionHash(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[\da-fA-F]{64}$/.test(value);
}

function isNativeToken(address: string) {
  return address.toLowerCase() === NATIVE_TOKEN_ADDRESS;
}

function invalidRequest(message: string): RouteAdapterError {
  return new RouteAdapterError("lifi", "invalid_request", message);
}

function providerError(message: string, cause?: unknown): RouteAdapterError {
  return new RouteAdapterError("lifi", "provider_error", message, cause);
}

function requireRecord(value: unknown, message: string): JsonRecord {
  if (!isRecord(value)) throw providerError(message);
  return value;
}

function requireString(
  record: JsonRecord,
  key: string,
  message: string,
): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw providerError(message);
  }
  return value;
}

function requireAddress(
  record: JsonRecord,
  key: string,
  message: string,
): Address {
  const value = requireString(record, key, message);
  if (!isAddress(value)) throw providerError(message);
  return value;
}

function requireChainId(
  record: JsonRecord,
  key: string,
  message: string,
): number {
  const value = record[key];
  if (!isPositiveInteger(value)) throw providerError(message);
  return value;
}

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

function formatAmount(amount: string, decimals: number) {
  try {
    return formatUnits(BigInt(amount), decimals);
  } catch {
    throw providerError("LI.FI returned an unformattable amount.");
  }
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

function requestUrl(request: RouteQuoteRequest, amount: bigint) {
  const url = new URL(`${LIFI_API_BASE_URL}/quote`);
  url.searchParams.set("fromChain", String(request.sourceAsset.chainId));
  url.searchParams.set("toChain", String(request.destinationAsset.chainId));
  url.searchParams.set("fromToken", request.sourceAsset.address);
  url.searchParams.set("toToken", request.destinationAsset.address);
  url.searchParams.set("fromAmount", amount.toString());
  url.searchParams.set("fromAddress", request.account);
  url.searchParams.set("toAddress", request.recipient);
  url.searchParams.set("slippage", String(request.slippageBps / 10_000));
  return url;
}

function statusUrl(
  settlement: Extract<RouteSettlement, { kind: "lifi" }>,
  sourceTxHash: Hex,
) {
  const url = new URL(`${LIFI_API_BASE_URL}/status`);
  url.searchParams.set("txHash", sourceTxHash);
  url.searchParams.set("toChain", String(settlement.destinationChainId));
  url.searchParams.set("bridge", settlement.tool);
  return url;
}

function providerHeaders() {
  const headers = new Headers({ accept: "application/json" });
  const apiKey = process.env.LIFI_API_KEY;
  if (apiKey) headers.set("x-lifi-api-key", apiKey);
  return headers;
}

function isNoRouteResponse(status: number, body: unknown): boolean {
  if (status === 404) return true;
  if (status !== 400 && status !== 422) return false;
  if (!isRecord(body)) return false;
  const text = [body.code, body.error, body.message]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return /no route|route not found|no available route|could not find route/.test(
    text,
  );
}

async function fetchProviderJson(url: URL, operation: "quote" | "status") {
  let response: Response;
  try {
    response = await globalThis.fetch(url, {
      headers: providerHeaders(),
      cache: "no-store",
    });
  } catch (error) {
    throw providerError(`LI.FI ${operation} service is unavailable.`, error);
  }

  let body: unknown;
  try {
    body = JSON.parse(await response.text());
  } catch {
    if (!response.ok) throw providerError(`LI.FI ${operation} request failed.`);
    throw providerError(`LI.FI returned malformed ${operation} data.`);
  }
  if (!response.ok) {
    if (isNoRouteResponse(response.status, body)) {
      throw new RouteAdapterError("lifi", "no_route", "LI.FI found no route.");
    }
    throw providerError(`LI.FI ${operation} request failed.`);
  }
  return body;
}

function httpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeStatus(value: unknown): RouteExecutionStatus {
  const root = requireRecord(
    value,
    "LI.FI returned an invalid status response.",
  );
  const status = root.status;
  if (
    status !== "NOT_FOUND" &&
    status !== "PENDING" &&
    status !== "DONE" &&
    status !== "FAILED"
  ) {
    throw providerError("LI.FI returned an unknown transfer status.");
  }

  if (status === "NOT_FOUND" || status === "PENDING") {
    return { kind: "pending" };
  }

  const receiving = root.receiving;
  let destinationTxHash: Hex | undefined;
  let explorerUrl: string | undefined;
  if (receiving !== undefined) {
    const receivingRecord = requireRecord(
      receiving,
      "LI.FI returned an invalid destination transaction.",
    );
    const rawHash = receivingRecord.txHash;
    if (
      rawHash !== undefined &&
      rawHash !== null &&
      !isTransactionHash(rawHash)
    ) {
      throw providerError("LI.FI returned an invalid destination hash.");
    }
    const rawLink = receivingRecord.txLink;
    if (rawLink !== undefined && rawLink !== null && !httpUrl(rawLink)) {
      throw providerError(
        "LI.FI returned an invalid destination explorer URL.",
      );
    }
    destinationTxHash = rawHash === null ? undefined : rawHash;
    explorerUrl = rawLink === null ? undefined : rawLink;
  }

  const rawExplorerLink = root.lifiExplorerLink;
  if (
    rawExplorerLink !== undefined &&
    rawExplorerLink !== null &&
    !httpUrl(rawExplorerLink)
  ) {
    throw providerError("LI.FI returned an invalid explorer URL.");
  }
  if (explorerUrl === undefined && rawExplorerLink !== null) {
    explorerUrl = rawExplorerLink as string | undefined;
  }

  if (status === "FAILED") {
    return {
      kind: "failed",
      message: "LI.FI reported that the transfer failed.",
      ...(explorerUrl === undefined ? {} : { explorerUrl }),
    };
  }

  const substatus = root.substatus;
  if (substatus === "REFUNDED") {
    return {
      kind: "failed",
      message: "LI.FI reported that the transfer was refunded.",
      ...(explorerUrl === undefined ? {} : { explorerUrl }),
    };
  }
  if (
    substatus !== undefined &&
    substatus !== "COMPLETED" &&
    substatus !== "PARTIAL"
  ) {
    throw providerError("LI.FI returned an unknown completed status.");
  }

  return {
    kind: "success",
    ...(destinationTxHash === undefined ? {} : { destinationTxHash }),
    ...(explorerUrl === undefined ? {} : { explorerUrl }),
  };
}

export class LifiRouteAdapter implements RouteAdapter {
  readonly id = "lifi" as const;

  private async getQuoteWithRaw(request: RouteQuoteRequest) {
    validateRequest(request);
    const platformFee = platformFeeFor(request);
    const raw = parseLifiQuote(
      await fetchProviderJson(
        requestUrl(request, platformFee.providerAmount),
        "quote",
      ),
    );
    return {
      platformFee,
      raw,
      quote: normalizeQuote(raw, request, platformFee),
    };
  }

  async getQuote(request: RouteQuoteRequest): Promise<NormalizedRouteQuote> {
    return (await this.getQuoteWithRaw(request)).quote;
  }

  async prepare(request: RouteQuoteRequest): Promise<PreparedRoute> {
    const { platformFee, raw, quote } = await this.getQuoteWithRaw(request);
    const transactionRequest = raw.transactionRequest;
    if (transactionRequest.chainId !== request.sourceAsset.chainId) {
      throw providerError("LI.FI returned a transaction for the wrong chain.");
    }

    const calls: RouteCall[] = [];
    const sourceIsNative = isNativeToken(request.sourceAsset.address);
    if (platformFee.recipient && platformFee.amount > 0n) {
      calls.push(
        sourceIsNative
          ? {
              to: platformFee.recipient,
              data: "0x",
              value: numberToHex(platformFee.amount),
            }
          : {
              to: request.sourceAsset.address,
              data: encodeFunctionData({
                abi: ERC20_TRANSFER_ABI,
                functionName: "transfer",
                args: [platformFee.recipient, platformFee.amount],
              }),
              value: "0x0",
            },
      );
    }
    const approvalAddress = raw.estimate.approvalAddress;
    if (!sourceIsNative && approvalAddress && isNativeToken(approvalAddress)) {
      throw providerError("LI.FI returned an invalid approval target.");
    }
    if (
      !sourceIsNative &&
      approvalAddress &&
      !isNativeToken(approvalAddress) &&
      raw.estimate.skipApproval !== true
    ) {
      calls.push({
        to: request.sourceAsset.address,
        data: encodeFunctionData({
          abi: ERC20_APPROVE_ABI,
          functionName: "approve",
          args: [approvalAddress, platformFee.providerAmount],
        }),
        value: "0x0",
      });
    }
    calls.push({
      to: transactionRequest.to,
      data: transactionRequest.data,
      value: transactionRequest.value,
    });

    return {
      calls,
      provider: "lifi",
      quote,
      settlement: {
        kind: "lifi",
        destinationChainId: request.destinationAsset.chainId,
        tool: raw.tool,
      },
      sourceChainId: request.sourceAsset.chainId,
    };
  }

  async getStatus(
    settlement: RouteSettlement,
    sourceTxHash: Hex,
  ): Promise<RouteExecutionStatus> {
    if (
      settlement.kind !== "lifi" ||
      !isPositiveInteger(settlement.destinationChainId) ||
      typeof settlement.tool !== "string" ||
      settlement.tool.length === 0
    ) {
      throw invalidRequest("Invalid LI.FI settlement.");
    }
    if (!isTransactionHash(sourceTxHash)) {
      throw invalidRequest("Invalid source transaction hash.");
    }
    try {
      return normalizeStatus(
        await fetchProviderJson(statusUrl(settlement, sourceTxHash), "status"),
      );
    } catch (error) {
      if (error instanceof RouteAdapterError && error.code === "no_route") {
        return { kind: "pending" };
      }
      throw error;
    }
  }
}

export const lifiAdapter = new LifiRouteAdapter();
export default lifiAdapter;
