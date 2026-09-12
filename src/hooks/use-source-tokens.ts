"use client";

import { useMemo } from "react";
import { type Address, zeroAddress } from "viem";
import { useReadContracts } from "wagmi";
import { supportedTokens } from "@/config/tokens";
import { tokenKey } from "@/lib/tokens/source-catalog";

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

/** Locally saved, per-chain NEAR Intents ERC-20 catalog. */
export function useSourceTokens(address?: Address) {
  const tokens = useMemo(
    () =>
      [...supportedTokens].sort((first, second) => {
        const firstRank =
          preferredSymbolRank[first.symbol.toUpperCase()] ?? 100;
        const secondRank =
          preferredSymbolRank[second.symbol.toUpperCase()] ?? 100;
        return (
          firstRank - secondRank || first.symbol.localeCompare(second.symbol)
        );
      }),
    [],
  );

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
    catalogError: null,
    tokens,
  };
}
