"use client";

import { useEffect, useMemo, useState } from "react";
import { type Address, zeroAddress } from "viem";
import { useReadContracts } from "wagmi";
import { supportedTokens } from "@/config/tokens";
import {
  type IntentsTokenCatalogItem,
  sourceTokensFromCatalog,
  tokenKey,
} from "@/lib/tokens/source-catalog";

const erc20BalanceAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
] as const;

const preferredSymbolRank: Readonly<Record<string, number>> = {
  USDC: 0,
  USDT: 1,
  USDT0: 2,
  DAI: 3,
  WETH: 4,
};

/** Live NEAR Intents EVM assets, with a small verified offline fallback. */
export function useSourceTokens(address?: Address) {
  const [tokens, setTokens] = useState(supportedTokens);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/intents/tokens", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("The token catalog is unavailable.");
        const body: unknown = await response.json();
        if (!Array.isArray(body)) {
          throw new Error("The token catalog response is invalid.");
        }
        const catalogTokens = sourceTokensFromCatalog(
          body as IntentsTokenCatalogItem[],
        ).sort((first, second) => {
          const firstRank =
            preferredSymbolRank[first.symbol.toUpperCase()] ?? 100;
          const secondRank =
            preferredSymbolRank[second.symbol.toUpperCase()] ?? 100;
          return (
            firstRank - secondRank || first.symbol.localeCompare(second.symbol)
          );
        });
        if (catalogTokens.length === 0) {
          throw new Error("The token catalog has no supported EVM assets.");
        }
        setTokens(catalogTokens);
        setCatalogError(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setCatalogError(
          error instanceof Error
            ? error.message
            : "The token catalog is unavailable.",
        );
      });
    return () => controller.abort();
  }, []);

  const contracts = useMemo(
    () =>
      tokens.map((token) => ({
        address: token.address,
        abi: erc20BalanceAbi,
        chainId: token.chainId,
        functionName: "balanceOf" as const,
        args: [address ?? zeroAddress] as const,
      })),
    [address, tokens],
  );
  const balances = useReadContracts({
    allowFailure: true,
    contracts,
    query: {
      enabled: Boolean(address) && contracts.length > 0,
      refetchInterval: 15_000,
      refetchOnWindowFocus: true,
      staleTime: 10_000,
    },
  });
  const balanceByTokenKey = useMemo(() => {
    const values: Record<string, bigint> = {};
    for (const [index, token] of tokens.entries()) {
      const result = balances.data?.[index];
      if (result?.status === "success" && typeof result.result === "bigint") {
        values[tokenKey(token)] = result.result;
      }
    }
    return values;
  }, [balances.data, tokens]);

  return {
    balanceByTokenKey,
    balancesPending: Boolean(address) && balances.isPending,
    catalogError,
    tokens,
  };
}
