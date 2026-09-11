import { getAddress } from "viem";
import type { Token } from "@/types/tokens";
import { CHAIN_LIST } from "../../config/chains.ts";

const allowedTokenLogoHosts = new Set([
  "arbitrum.foundation",
  "assets.coingecko.com",
  "coin-images.coingecko.com",
  "ethereum-optimism.github.io",
  "ipfs.io",
  "raw.githubusercontent.com",
]);

const trustWalletBlockchainByChainId: Readonly<Record<number, string>> =
  Object.freeze(
    Object.fromEntries(
      CHAIN_LIST.flatMap((chain) =>
        chain.trustWalletSlug ? [[chain.id, chain.trustWalletSlug]] : [],
      ),
    ),
  );

export function trustWalletTokenLogoUri(
  token: Pick<Token, "address" | "chainId">,
) {
  const blockchain = trustWalletBlockchainByChainId[token.chainId];
  if (!blockchain) return undefined;

  return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${blockchain}/assets/${getAddress(token.address)}/logo.png`;
}

export function normalizeTokenLogoUri(value?: string) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (trimmed.startsWith("ipfs://")) {
    const path = trimmed.slice("ipfs://".length).replace(/^ipfs\//, "");
    return path ? `https://ipfs.io/ipfs/${path}` : undefined;
  }

  try {
    const url = new URL(trimmed);
    if (
      url.protocol !== "https:" ||
      !allowedTokenLogoHosts.has(url.hostname.toLowerCase())
    ) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}
