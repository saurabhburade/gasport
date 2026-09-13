import { type Hex, isAddress } from "viem";
import {
  classifyNearExecutionStatus,
  parseNearTransactionHash,
} from "../../../gas/near-execution.ts";
import { requestNearOneClick } from "../../../intents/browser-request.ts";
import { getNearIntentsExplorerSearchUrl } from "../../../intents/deposit-registration.ts";
import { executionResponseSchema } from "../../../intents/schemas.ts";
import { verifyNearQuoteSignature } from "../../../intents/signature.ts";
import type {
  NearClientConfig,
  RouteExecutionStatus,
  RouteSettlement,
} from "../../types.ts";
import {
  adapterError,
  assertAddress,
  isRecord,
  sameAddress,
} from "./common.ts";

const HASH_PATTERN = /^0x[\da-fA-F]{64}$/;

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

function firstExplorerUrl(details: { explorerUrl: string }[]) {
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

export async function getNearRouteStatus(
  settlement: RouteSettlement,
  sourceTxHash: Hex,
  config: NearClientConfig = {},
  signal?: AbortSignal,
): Promise<RouteExecutionStatus> {
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

  const result = await requestNearOneClick(
    config.apiUrl,
    `/v0/status?${params.toString()}`,
    { method: "GET" },
    executionResponseSchema,
    signal,
  );
  if (!result.ok) {
    if (result.status === 404) {
      return { kind: "pending" };
    }
    return adapterError(
      "provider_error",
      "NEAR 1Click status service is unavailable.",
    );
  }
  if (
    !(await verifyNearQuoteSignature(
      result.data.quoteResponse,
      config.managerPublicKey,
    ))
  ) {
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
}
