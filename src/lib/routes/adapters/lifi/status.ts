import type { Hex } from "viem";
import {
  RouteAdapterError,
  type RouteExecutionStatus,
  type RouteSettlement,
} from "../../types.ts";
import {
  invalidRequest,
  isPositiveInteger,
  isTransactionHash,
  providerError,
  requireRecord,
} from "./common.ts";
import { fetchProviderJson, statusUrl } from "./http.ts";

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

export async function getLifiStatus(
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
