import type { Address } from "viem";
import { CHAIN_LIST } from "@/config/chains";
import { supportedTokens } from "@/config/tokens";
import type { RouteProviderId } from "@/lib/routes/types";
import type { GasFlowState } from "@/types/gas";

export const demoMode = process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE !== "false";
export const demoWalletAddress =
  "0x71b000000000000000000000000000000000c84e" as Address;
export const defaultToken =
  supportedTokens.find(
    (token) => token.chainId === 8453 && token.symbol === "USDC",
  ) ?? supportedTokens[0];
export const defaultDestination =
  CHAIN_LIST.find((chain) => chain.id === 42161) ?? CHAIN_LIST[0];
export const DEFAULT_SLIPPAGE_BPS = 100;
export const MAX_TOKEN_INPUT = "10000";
export const QUOTE_DEBOUNCE_MS = 450;

export const progressIndex: Partial<Record<GasFlowState, number>> = {
  switching_network: 0,
  wallet_signature: 0,
  submitting: 1,
  deposit_pending: 1,
  solver_executing: 2,
  completed: 3,
};

export const providerLabelById: Record<RouteProviderId, string> = {
  "near-1click": "NEAR 1Click",
  lifi: "LI.FI",
};

export const tokenIconBySymbol: Record<string, string> = {
  DAI: "/assets/tokens/dai.png",
  USDC: "/assets/tokens/usdc.png",
  USDT: "/assets/tokens/usdt.png",
  USDT0: "/assets/tokens/usdt.png",
};
