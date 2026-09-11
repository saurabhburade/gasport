import type { Token } from "@/types/tokens";

export type GasFlowState =
  | "idle"
  | "wallet_required"
  | "quoted"
  | "confirming"
  | "switching_network"
  | "wallet_signature"
  | "submitting"
  | "deposit_pending"
  | "solver_executing"
  | "completed"
  | "failed";

export type GasQuote = {
  inputAmount: bigint;
  outputAmount: bigint;
  inputToken: Token;
  outputToken: Token;
  estimatedGasReceived: string;
  quoteId: string;
  expiresAt: number;
};
