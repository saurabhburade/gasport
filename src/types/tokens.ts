import type { Address } from "viem";

export type ChainlinkUsdFeed = Readonly<{
  address: string;
  heartbeatSeconds: number;
}>;

export type Token = {
  address: Address;
  symbol: string;
  name: string;
  logoUri?: string;
  decimals: number;
  chainId: number;
  intentsAssetId: string;
  chainlinkUsdFeed?: ChainlinkUsdFeed;
};
