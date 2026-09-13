import { isAddress } from "viem";
import type { ChainlinkUsdFeed, Token } from "@/types/tokens";
import { CHAIN_LIST } from "../../config/chains.ts";

export const chainIdByBlockchain: Readonly<Record<string, number>> =
  Object.freeze(
    Object.fromEntries(
      CHAIN_LIST.map((chain) => [chain.nearBlockchain, chain.id]),
    ),
  );

const tokenNameBySymbol: Readonly<Record<string, string>> = {
  DAI: "Dai Stablecoin",
  USDC: "USD Coin",
  USDT: "Tether USD",
  USDT0: "Tether USD₀",
  WBTC: "Wrapped Bitcoin",
  WETH: "Wrapped Ether",
};

export type IntentsTokenCatalogItem = {
  assetId?: unknown;
  blockchain?: unknown;
  contractAddress?: unknown;
  decimals?: unknown;
  logoURI?: unknown;
  name?: unknown;
  symbol?: unknown;
  chainlinkUsdFeed?: unknown;
};

function parseChainlinkUsdFeed(value: unknown): ChainlinkUsdFeed | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (!("address" in value) || !("heartbeatSeconds" in value)) {
    return undefined;
  }
  if (
    typeof value.address !== "string" ||
    !isAddress(value.address) ||
    typeof value.heartbeatSeconds !== "number" ||
    !Number.isInteger(value.heartbeatSeconds) ||
    value.heartbeatSeconds <= 0
  ) {
    return undefined;
  }
  return {
    address: value.address,
    heartbeatSeconds: value.heartbeatSeconds,
  };
}

export type TokenListMetadataItem = {
  address?: unknown;
  chainId?: unknown;
  logoURI?: unknown;
  name?: unknown;
  symbol?: unknown;
};

type EnrichedCatalogItem<T> = Omit<T, "logoURI" | "name"> & {
  logoURI?: string;
  name?: string;
};

export function tokenKey(token: Pick<Token, "address" | "chainId">) {
  return `${token.chainId}:${token.address.toLowerCase()}`;
}

export function enrichIntentsCatalog<T extends IntentsTokenCatalogItem>(
  catalog: readonly T[],
  metadata: readonly TokenListMetadataItem[],
): EnrichedCatalogItem<T>[] {
  const metadataByKey = new Map<string, TokenListMetadataItem>();

  for (const item of metadata) {
    if (
      typeof item.chainId !== "number" ||
      typeof item.address !== "string" ||
      !isAddress(item.address)
    ) {
      continue;
    }
    metadataByKey.set(`${item.chainId}:${item.address.toLowerCase()}`, item);
  }

  return catalog.map((item) => {
    const { logoURI, name, ...catalogItem } = item;
    const existingMetadata = {
      ...(typeof name === "string" && name.trim() ? { name: name.trim() } : {}),
      ...(typeof logoURI === "string" && logoURI.trim()
        ? { logoURI: logoURI.trim() }
        : {}),
    };
    if (
      typeof item.blockchain !== "string" ||
      typeof item.contractAddress !== "string"
    ) {
      return { ...catalogItem, ...existingMetadata };
    }
    const chainId = chainIdByBlockchain[item.blockchain.toLowerCase()];
    if (!chainId) return { ...catalogItem, ...existingMetadata };
    const match = metadataByKey.get(
      `${chainId}:${item.contractAddress.toLowerCase()}`,
    );
    if (!match) return { ...catalogItem, ...existingMetadata };

    return {
      ...catalogItem,
      ...existingMetadata,
      ...(typeof match.name === "string" && match.name.trim()
        ? { name: match.name.trim() }
        : {}),
      ...(typeof match.logoURI === "string" && match.logoURI.trim()
        ? { logoURI: match.logoURI.trim() }
        : {}),
    };
  });
}

export function sourceTokensFromCatalog(
  catalog: readonly IntentsTokenCatalogItem[],
) {
  const tokens = new Map<string, Token>();

  for (const item of catalog) {
    if (
      typeof item.blockchain !== "string" ||
      typeof item.contractAddress !== "string" ||
      typeof item.assetId !== "string" ||
      typeof item.symbol !== "string" ||
      typeof item.decimals !== "number" ||
      !Number.isInteger(item.decimals) ||
      item.decimals < 0 ||
      !isAddress(item.contractAddress)
    ) {
      continue;
    }

    const chainId = chainIdByBlockchain[item.blockchain.toLowerCase()];
    const symbol = item.symbol.trim();
    if (!chainId || !symbol || !item.assetId) continue;
    const chainlinkUsdFeed = parseChainlinkUsdFeed(item.chainlinkUsdFeed);

    const token: Token = {
      address: item.contractAddress,
      symbol,
      name:
        typeof item.name === "string" && item.name.trim()
          ? item.name.trim()
          : (tokenNameBySymbol[symbol.toUpperCase()] ?? symbol),
      ...(typeof item.logoURI === "string" && item.logoURI.trim()
        ? { logoUri: item.logoURI.trim() }
        : {}),
      decimals: item.decimals,
      chainId,
      intentsAssetId: item.assetId,
      ...(chainlinkUsdFeed ? { chainlinkUsdFeed } : {}),
    };
    tokens.set(tokenKey(token), token);
  }

  return [...tokens.values()];
}
