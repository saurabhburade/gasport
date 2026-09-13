import { decodeAbiParameters, type Hex } from "viem";
import {
  CUMULATIVE_SLIPPAGE_TOO_HIGH_SELECTOR,
  USER_OPERATION_REVERT_REASON_TOPIC,
} from "./constants.ts";

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
      if (revertReason.slice(0, 10).toLowerCase() === "0x08c379a0") {
        const [reason] = decodeAbiParameters(
          [{ type: "string" }],
          `0x${revertReason.slice(10)}`,
        );
        if (reason.toLowerCase() === "insufficient output") {
          return "The swap could not meet its minimum output. Refresh the quote and try again.";
        }
      }
    } catch {
      // Ignore malformed wallet-provided logs and retain the safe fallback.
    }
  }
  return fallback;
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
