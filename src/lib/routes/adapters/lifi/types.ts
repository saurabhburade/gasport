import type { Address, Hex } from "viem";

export type JsonRecord = Record<string, unknown>;

export type LifiToken = {
  address: Address;
  chainId: number;
  decimals: number;
  symbol: string;
};

export type LifiFeeCost = {
  amount: string;
  included?: boolean;
  name: string;
  percentage?: string;
  token: LifiToken;
};

export type LifiTransactionRequest = {
  chainId: number;
  data: Hex;
  to: Address;
  value: Hex;
};

export type LifiQuote = {
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

export type LifiPlatformFee = {
  amount: bigint;
  providerAmount: bigint;
  rateBps: number;
  recipient?: Address;
};
