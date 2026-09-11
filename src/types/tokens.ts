import type { Address } from "viem";

export type Token = {
  address: Address;
  symbol: string;
  name: string;
  logoUri?: string;
  decimals: number;
  chainId: number;
  intentsAssetId: string;
};
