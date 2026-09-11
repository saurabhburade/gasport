import type { Hex } from "viem";
import {
  encodeNearDepositTransfer,
  type NearExecutionInput,
} from "../../lib/gas/near-execution.ts";
import type {
  PreparedRoute,
  RouteExecutionStatus,
} from "../../lib/routes/types.ts";
import { HASH_PATTERN, SETTLEMENT_TIMEOUT_MS } from "./constants.ts";
import type { GasExecutionInput, RouteExecutionInput } from "./types.ts";

export function sleep(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function isPreparedRoute(
  input: GasExecutionInput,
): input is RouteExecutionInput {
  return (
    typeof input === "object" &&
    input !== null &&
    "calls" in input &&
    Array.isArray(input.calls) &&
    "provider" in input &&
    "settlement" in input
  );
}

export function nearInputToRoute(
  input: NearExecutionInput,
): RouteExecutionInput {
  return {
    calls: [
      {
        data: encodeNearDepositTransfer(input),
        to: input.token,
        value: "0x0" as Hex,
      },
    ],
    provider: "near-1click",
    quote: {
      amountIn: input.amount.toString(),
      amountInFormatted: input.amount.toString(),
      amountOut: input.amount.toString(),
      amountOutFormatted: input.amount.toString(),
      expiresAt: new Date(Date.now() + SETTLEMENT_TIMEOUT_MS).toISOString(),
      fees: [],
      minAmountOut: input.amount.toString(),
      provider: "near-1click",
      providerQuoteId: "legacy-near-execution",
    },
    settlement: {
      depositAddress: input.depositAddress,
      ...(input.depositMemo ? { depositMemo: input.depositMemo } : {}),
      kind: "near-1click",
      quoteId: "legacy-near-execution",
    },
    sourceChainId: input.chainId,
    ...(input.sourceGasFeeAmount !== undefined &&
    input.sourceGasFeeRecipient !== undefined
      ? {
          sourceGasFee: {
            amount: input.sourceGasFeeAmount,
            recipient: input.sourceGasFeeRecipient,
            token: input.token,
          },
          sponsorshipRequired: true,
        }
      : {}),
  };
}

export function settlementParams(
  params: URLSearchParams,
  settlement: PreparedRoute["settlement"],
) {
  params.set("settlement", JSON.stringify(settlement));
}

function asHash(value: unknown): Hex | undefined {
  return typeof value === "string" && HASH_PATTERN.test(value)
    ? (value as Hex)
    : undefined;
}

export function routeStatusResult(value: unknown): RouteExecutionStatus {
  if (!value || typeof value !== "object") {
    throw new Error("The route status response is invalid.");
  }
  const status = value as Partial<RouteExecutionStatus>;
  if (status.kind === "pending") return { kind: "pending" };
  if (status.kind === "failed") {
    throw new Error(status.message || "The route execution failed.");
  }
  if (status.kind === "success") {
    const destinationTxHash = asHash(status.destinationTxHash);
    return {
      kind: "success",
      ...(destinationTxHash ? { destinationTxHash } : {}),
      ...(typeof status.explorerUrl === "string"
        ? { explorerUrl: status.explorerUrl }
        : {}),
    };
  }
  throw new Error("The route status response is invalid.");
}
