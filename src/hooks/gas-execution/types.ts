import type { Address, Hex } from "viem";
import type { NearExecutionInput } from "../../lib/gas/near-execution.ts";
import type { SourceGasFeeTransfer } from "../../lib/gas/wallet-calls.ts";
import type { PreparedRoute, RouteProviderId } from "../../lib/routes/types.ts";

/** Optional metadata carried alongside a prepared route at execution time. */
export type RouteExecutionInput = PreparedRoute & {
  sourceGasFee?: SourceGasFeeTransfer;
  sponsorshipRequired?: boolean;
};

export type GasExecutionInput = RouteExecutionInput | NearExecutionInput;

export type GasExecutionResult = {
  chainId: number;
  completion: "intent" | "route";
  depositAddress?: Address;
  destinationTxHash?: Hex;
  explorerUrl?: string;
  provider: RouteProviderId;
  sourceCallId?: string;
  sourceChainId: number;
  sourceTxHash: Hex;
  /** Compatibility alias for the original NEAR-only result shape. */
  txHash: Hex;
};

export type ExecutionStep = "send" | "confirm" | "monitor";

export type ExecutionCheckpoint = {
  account?: Address;
  input: GasExecutionInput;
  route: RouteExecutionInput;
  sourceTxHash?: Hex;
  step: ExecutionStep;
  updatedAt: number;
  version: 1;
  walletCallId?: string;
};
