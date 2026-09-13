import type { Hex } from "viem";
import {
  encodeNearDepositTransfer,
  type NearExecutionInput,
} from "../../lib/gas/near-execution.ts";
import { SETTLEMENT_TIMEOUT_MS } from "./constants.ts";
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
