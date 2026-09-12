import {
  adi,
  arbitrum,
  aurora,
  avalanche,
  base,
  berachain,
  bsc,
  gnosis,
  mainnet,
  monad,
  optimism,
  plasma,
  polygon,
  scroll,
  xLayer,
} from "@reown/appkit/networks";

export const siwxNetworks = [
  mainnet,
  arbitrum,
  adi,
  aurora,
  base,
  berachain,
  bsc,
  gnosis,
  optimism,
  plasma,
  polygon,
  avalanche,
  monad,
  xLayer,
  scroll,
] as const;

export function getSiwxNetwork(chainId: number) {
  return siwxNetworks.find((network) => network.id === chainId);
}
