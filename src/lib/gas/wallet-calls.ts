import {
  type Address,
  decodeAbiParameters,
  encodeFunctionData,
  type Hex,
  numberToHex,
} from "viem";
import type { PreparedRoute, RouteCall } from "../routes/types";

const ERC20_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
] as const;
const USER_OPERATION_REVERT_REASON_TOPIC =
  "0x1c4fada7374c0a9ee8841fc38afe82932dc0f8e69012e927f061a8bae611a201";
const CUMULATIVE_SLIPPAGE_TOO_HIGH_SELECTOR = "0x275c273c";

export function encodeErc20Transfer(recipient: Address, amount: bigint) {
  return encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: "transfer",
    args: [recipient, amount],
  });
}

export const SPONSORED_SOURCE_CHAIN_IDS = [1, 10, 143, 8453, 42161] as const;

export function isSponsoredSourceChain(chainId: number) {
  return (SPONSORED_SOURCE_CHAIN_IDS as readonly number[]).includes(chainId);
}

export type WalletRpcProvider = {
  request(args: {
    method: string;
    params?: readonly unknown[];
  }): Promise<unknown>;
};

export type SourceGasFeeTransfer = {
  amount: bigint;
  recipient: Address;
  token: Address;
};

export function assertSponsorshipPreflight(
  responseOk: boolean,
  value: unknown,
) {
  const result =
    value && typeof value === "object"
      ? (value as { available?: unknown; error?: unknown })
      : undefined;
  if (responseOk && result?.available === true) return;
  if (typeof result?.error === "string" && result.error.trim()) {
    throw new Error(result.error);
  }
  throw new Error("Source-chain gas sponsorship is unavailable.");
}

export type WalletCallsRequest = {
  method: "wallet_sendCalls";
  params: readonly [
    {
      atomicRequired: true;
      calls: readonly RouteCall[];
      chainId: Hex;
      from: Address;
      version: "2.0.0";
      capabilities?: {
        paymasterService: { url: string };
      };
    },
  ];
};

type SponsoredWalletCallsRequest = {
  method: "wallet_sendCalls";
  params: readonly [
    WalletCallsRequest["params"][0] & {
      capabilities: { paymasterService: { url: string } };
    },
  ];
};

export class WalletCallsTerminalError extends Error {
  readonly transactionHash?: Hex;

  constructor(message: string, transactionHash?: Hex) {
    super(message);
    this.name = "WalletCallsTerminalError";
    this.transactionHash = transactionHash;
  }
}

function walletCallsFailureMessage(
  logs: readonly { data?: string; topics?: string[] }[],
  fallback: string,
) {
  for (const log of logs) {
    if (
      log.topics?.[0]?.toLowerCase() !== USER_OPERATION_REVERT_REASON_TOPIC ||
      typeof log.data !== "string" ||
      !/^0x[\da-f]*$/i.test(log.data)
    ) {
      continue;
    }
    try {
      const [, revertReason] = decodeAbiParameters(
        [{ type: "uint256" }, { type: "bytes" }],
        log.data as Hex,
      );
      if (
        revertReason.slice(0, 10).toLowerCase() ===
        CUMULATIVE_SLIPPAGE_TOO_HIGH_SELECTOR
      ) {
        return "Price moved beyond the minimum received amount. Refresh the quote and try again.";
      }
    } catch {
      // Ignore malformed wallet-provided logs and retain the safe fallback.
    }
  }
  return fallback;
}

export function getPaymasterProxyUrl({
  origin,
  configuredUrl,
}: {
  origin: string;
  configuredUrl?: string;
}) {
  const appOrigin = new URL(origin);
  if (appOrigin.protocol === "https:") {
    return new URL("/api/gas/sponsored", appOrigin).toString();
  }

  return (
    configuredUrl?.trim() || new URL("/api/gas/sponsored", appOrigin).toString()
  );
}

export function getSponsorshipPreflightUrl(
  paymasterUrl: string,
  chainId: number,
) {
  const url = new URL(paymasterUrl);
  url.searchParams.set("chainId", String(chainId));
  return url.toString();
}

/**
 * ngrok's free domains return an HTML browser-warning page for browser GETs
 * unless this header is present. The wallet's paymaster POST is server-side,
 * but our local availability check runs in the browser and needs the bypass.
 */
export function getSponsorshipPreflightHeaders({
  origin,
  paymasterUrl,
}: {
  origin: string;
  paymasterUrl: string;
}): Record<string, string> {
  const appOrigin = new URL(origin);
  const paymaster = new URL(paymasterUrl);
  const isLocalHttp =
    appOrigin.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(appOrigin.hostname);
  const isNgrok =
    paymaster.hostname.endsWith(".ngrok-free.dev") ||
    paymaster.hostname.endsWith(".ngrok.app") ||
    paymaster.hostname.endsWith(".ngrok.io");

  return isLocalHttp && isNgrok ? { "ngrok-skip-browser-warning": "1" } : {};
}

function validatePaymasterUrl(paymasterUrl: string) {
  let parsedPaymasterUrl: URL;
  try {
    parsedPaymasterUrl = new URL(paymasterUrl);
  } catch {
    throw new Error("The paymaster URL is invalid.");
  }
  if (parsedPaymasterUrl.protocol !== "https:") {
    throw new Error(
      "Coinbase Base Account requires an HTTPS paymaster URL. Configure NEXT_PUBLIC_PAYMASTER_PROXY_URL.",
    );
  }
}

function buildWalletCallsRequest({
  account,
  calls,
  chainId,
  paymasterUrl,
  sponsorshipRequired,
}: {
  account: Address;
  calls: readonly RouteCall[];
  chainId: number;
  paymasterUrl?: string;
  sponsorshipRequired: boolean;
}): WalletCallsRequest {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error("The source chain is invalid.");
  }
  if (calls.length === 0) {
    throw new Error("The prepared route contains no wallet calls.");
  }
  const capabilities = sponsorshipRequired
    ? (() => {
        if (!paymasterUrl) {
          throw new Error("A paymaster URL is required for sponsored calls.");
        }
        validatePaymasterUrl(paymasterUrl);
        return { paymasterService: { url: paymasterUrl } };
      })()
    : undefined;

  return {
    method: "wallet_sendCalls",
    params: [
      {
        version: "2.0.0",
        from: account,
        chainId: numberToHex(chainId),
        atomicRequired: true,
        calls,
        ...(capabilities ? { capabilities } : {}),
      },
    ],
  };
}

/**
 * Build one atomic wallet_sendCalls request for any prepared route.
 * The source-gas transfer is intentionally first so it is committed in the
 * same atomic batch as the adapter-provided route calls.
 */
export function createWalletCallsRequest({
  account,
  paymasterUrl,
  preparedRoute,
  sourceGasFee,
  sponsorshipRequired = false,
}: {
  account: Address;
  paymasterUrl?: string;
  preparedRoute: PreparedRoute;
  sourceGasFee?: SourceGasFeeTransfer;
  sponsorshipRequired?: boolean;
}): WalletCallsRequest {
  if (sourceGasFee && sourceGasFee.amount <= 0n) {
    throw new Error("The source gas fee amount must be positive.");
  }

  const calls: RouteCall[] = sourceGasFee
    ? [
        {
          to: sourceGasFee.token,
          value: "0x0",
          data: encodeErc20Transfer(
            sourceGasFee.recipient,
            sourceGasFee.amount,
          ),
        },
        ...preparedRoute.calls,
      ]
    : [...preparedRoute.calls];

  return buildWalletCallsRequest({
    account,
    calls,
    chainId: preparedRoute.sourceChainId,
    paymasterUrl,
    sponsorshipRequired,
  });
}

export const createPreparedRouteCallsRequest = createWalletCallsRequest;
export const createWalletSendCallsRequest = createWalletCallsRequest;
export const buildWalletSendCallsRequest = createWalletCallsRequest;

export function createSponsoredTransferRequest({
  account,
  token,
  recipient,
  amount,
  chainId,
  paymasterUrl,
}: {
  account: Address;
  token: Address;
  recipient: Address;
  amount: bigint;
  chainId: number;
  paymasterUrl: string;
}): SponsoredWalletCallsRequest {
  if (!isSponsoredSourceChain(chainId)) {
    throw new Error(
      `Chain ${chainId} is not supported for sponsored deposits.`,
    );
  }
  const request = buildWalletCallsRequest({
    account,
    calls: [
      {
        to: token,
        value: "0x0",
        data: encodeErc20Transfer(recipient, amount),
      },
    ],
    chainId,
    paymasterUrl,
    sponsorshipRequired: true,
  });
  return request as SponsoredWalletCallsRequest;
}

export function createSponsoredDepositRequest({
  account,
  token,
  depositAddress,
  depositAmount,
  feeRecipient,
  feeAmount,
  chainId,
  paymasterUrl,
}: {
  account: Address;
  token: Address;
  depositAddress: Address;
  depositAmount: bigint;
  feeRecipient: Address;
  feeAmount: bigint;
  chainId: number;
  paymasterUrl: string;
}): SponsoredWalletCallsRequest {
  if (depositAmount <= 0n || feeAmount <= 0n) {
    throw new Error("The deposit and source gas fee must both be positive.");
  }

  return buildWalletCallsRequest({
    account,
    calls: [
      {
        to: token,
        value: "0x0",
        data: encodeErc20Transfer(feeRecipient, feeAmount),
      },
      {
        to: token,
        value: "0x0",
        data: encodeErc20Transfer(depositAddress, depositAmount),
      },
    ],
    chainId,
    paymasterUrl,
    sponsorshipRequired: true,
  }) as SponsoredWalletCallsRequest;
}

export function parseWalletCallsStatus(
  value: unknown,
  { sponsorshipRequired = false }: { sponsorshipRequired?: boolean } = {},
) {
  if (!value || typeof value !== "object") {
    throw new Error("The wallet returned an invalid call status.");
  }
  const status = value as {
    receipts?: {
      logs?: { data?: string; topics?: string[] }[];
      status?: string;
      transactionHash?: string;
    }[];
    status?: number | string;
  };
  const receipt = status.receipts?.find(
    (item) =>
      typeof item.transactionHash === "string" &&
      /^0x[\da-fA-F]{64}$/.test(item.transactionHash),
  );
  const transactionHash = receipt?.transactionHash as Hex | undefined;
  const failed =
    (typeof status.status === "number" && status.status >= 300) ||
    status.status === "FAILED";
  const transactionLabel = sponsorshipRequired
    ? "sponsored deposit transaction"
    : "source transaction";
  if (failed) {
    throw new WalletCallsTerminalError(
      walletCallsFailureMessage(
        receipt?.logs ?? [],
        `The ${transactionLabel} failed.`,
      ),
      transactionHash,
    );
  }
  const succeeded =
    (typeof status.status === "number" &&
      status.status >= 200 &&
      status.status < 300) ||
    status.status === "CONFIRMED";
  if (succeeded && receipt?.transactionHash) {
    if (receipt.status === "0x0") {
      throw new WalletCallsTerminalError(
        `The ${transactionLabel} reverted.`,
        transactionHash,
      );
    }
    return {
      status: "success" as const,
      transactionHash: receipt.transactionHash as Hex,
    };
  }
  return { status: "pending" as const };
}

export function getWalletCallId(result: unknown) {
  if (typeof result === "string" && result.length > 0) return result;
  if (!result || typeof result !== "object") return undefined;
  const record = result as Record<string, unknown>;
  if (typeof record.id === "string" && record.id.length > 0) return record.id;
  if (typeof record.batchId === "string" && record.batchId.length > 0) {
    return record.batchId;
  }
  return undefined;
}

export function getWalletTransactionHash(result: unknown): Hex | undefined {
  if (typeof result === "string" && /^0x[\da-fA-F]{64}$/.test(result)) {
    return result as Hex;
  }
  if (!result || typeof result !== "object") return undefined;
  const record = result as Record<string, unknown>;
  const candidate = record.transactionHash ?? record.txHash;
  return typeof candidate === "string" && /^0x[\da-fA-F]{64}$/.test(candidate)
    ? (candidate as Hex)
    : undefined;
}
