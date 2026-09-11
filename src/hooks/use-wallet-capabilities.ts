"use client";

import { useEffect, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import type {
  WalletCapabilities,
  WalletChainCapabilities,
} from "@/types/wallet";

type CapabilityProvider = {
  request(args: {
    method: string;
    params?: readonly unknown[];
  }): Promise<unknown>;
};

type RawCapability = {
  supported?: unknown;
  status?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function asCapability(value: unknown): RawCapability {
  return asRecord(value) ?? {};
}

function chainKey(chainId: number) {
  return `0x${chainId.toString(16)}`;
}

function normalizeChainCapabilities(
  raw: unknown,
  chainId: number,
  authorizationSigner: boolean | "unknown",
): WalletChainCapabilities {
  const root = asRecord(raw) ?? {};
  const global = asRecord(root["0x0"]) ?? asRecord(root["0"]) ?? {};
  const chain =
    asRecord(root[chainKey(chainId)]) ?? asRecord(root[String(chainId)]) ?? {};
  const merged = { ...global, ...chain };
  const eip7702 = asCapability(merged.eip7702Auth);
  const paymasterService = asCapability(merged.paymasterService);
  const atomic = asCapability(merged.atomic);
  const passkey = asCapability(merged.passkey);

  return {
    chainId,
    eip7702:
      typeof eip7702.supported === "boolean" ? eip7702.supported : "unknown",
    eip5792: Object.keys(root).length > 0,
    smartAccount:
      eip7702.supported === true
        ? true
        : eip7702.supported === false
          ? false
          : "unknown",
    passkey:
      typeof passkey.supported === "boolean" ? passkey.supported : "unknown",
    paymasterService:
      typeof paymasterService.supported === "boolean"
        ? paymasterService.supported
        : "unknown",
    atomic:
      atomic.status === "supported" ||
      atomic.status === "ready" ||
      atomic.status === "unsupported"
        ? atomic.status
        : "unknown",
    authorizationSigner,
    source: "wallet_getCapabilities" as const,
  };
}

function disconnectedCapabilities(): WalletCapabilities {
  return {
    eip7702: "unknown",
    eip5792: "unknown",
    smartAccount: "unknown",
    passkey: "unknown",
    paymasterService: "unknown",
    atomic: "unknown",
    authorizationSigner: "unknown",
    source: "not_connected",
    reason:
      "Connect an EVM wallet before checking chain-specific capabilities.",
  };
}

export function useWalletCapabilities(): WalletCapabilities {
  const { address, chainId, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [capabilities, setCapabilities] = useState<WalletCapabilities>(() =>
    disconnectedCapabilities(),
  );

  useEffect(() => {
    let cancelled = false;

    if (!isConnected || !address || !chainId || !walletClient) {
      setCapabilities(disconnectedCapabilities());
      return () => {
        cancelled = true;
      };
    }

    const account = walletClient.account;
    const authorizationSigner =
      account &&
      typeof account === "object" &&
      "signAuthorization" in account &&
      typeof account.signAuthorization === "function"
        ? true
        : "unknown";

    void (async () => {
      try {
        const provider = walletClient as unknown as CapabilityProvider;
        const raw = await provider.request({
          method: "wallet_getCapabilities",
          params: [address, [chainKey(chainId)]],
        });
        const normalized = normalizeChainCapabilities(
          raw,
          chainId,
          authorizationSigner,
        );
        if (cancelled) return;
        setCapabilities({
          ...normalized,
          address,
          chainId,
          chains: { [chainId]: normalized },
        });
      } catch {
        if (cancelled) return;
        setCapabilities({
          ...disconnectedCapabilities(),
          address,
          chainId,
          source: "unavailable",
          reason:
            "This wallet did not return wallet_getCapabilities for the connected chain; live sponsorship is unavailable.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, chainId, isConnected, walletClient]);

  return capabilities;
}
