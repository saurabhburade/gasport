"use client";

import { useAppKitAccount, useAppKitNetwork } from "@reown/appkit/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Address } from "viem";
import { useSignMessage } from "wagmi";
import { appKit } from "@/config/appkit";
import { siwxConfig } from "@/lib/siwx/client";
import { TermsSignDialog } from "./terms-sign-dialog";

type ConnectedIdentity = {
  address: Address;
  chainId: `eip155:${number}`;
  key: string;
};

function getConnectedIdentity(
  address: string | undefined,
  chainId: string | undefined,
  isConnected: boolean,
): ConnectedIdentity | null {
  if (!isConnected || !address || !chainId || !/^eip155:\d+$/.test(chainId)) {
    return null;
  }

  return {
    address: address as Address,
    chainId: chainId as `eip155:${number}`,
    key: `${chainId}:${address.toLowerCase()}`,
  };
}

export function WalletTermsGate() {
  const { address, isConnected } = useAppKitAccount();
  const { caipNetworkId } = useAppKitNetwork();
  const { signMessageAsync } = useSignMessage();
  const identity = useMemo(
    () => getConnectedIdentity(address, caipNetworkId, isConnected),
    [address, caipNetworkId, isConnected],
  );
  const currentKeyRef = useRef(identity?.key ?? null);
  const lastConnectedKeyRef = useRef<string | null>(null);
  const [promptIdentity, setPromptIdentity] =
    useState<ConnectedIdentity | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  currentKeyRef.current = identity?.key ?? null;

  useEffect(() => {
    if (!identity) {
      if (lastConnectedKeyRef.current) {
        void siwxConfig.setSessions([]).catch(() => undefined);
      }
      lastConnectedKeyRef.current = null;
      setPromptIdentity(null);
      setError(null);
      return;
    }

    lastConnectedKeyRef.current = identity.key;
    let cancelled = false;
    setPromptIdentity(null);
    setError(null);

    void siwxConfig
      .getSessions(identity.chainId, identity.address)
      .then(async (sessions) => {
        if (cancelled || sessions.length > 0) return;
        await appKit?.close();
        if (!cancelled) setPromptIdentity(identity);
      })
      .catch(() => {
        if (!cancelled) {
          setError(
            "Could not check your wallet agreement. Please try signing again.",
          );
          setPromptIdentity(identity);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [identity]);

  const cancel = useCallback(() => {
    if (pending) return;
    setPromptIdentity(null);
    setError(null);
    lastConnectedKeyRef.current = null;
    void siwxConfig
      .setSessions([])
      .catch(() => undefined)
      .then(() => appKit?.disconnect())
      .catch(() => undefined);
  }, [pending]);

  const sign = useCallback(async () => {
    if (!promptIdentity || pending) return;
    setPending(true);
    setError(null);

    try {
      const messageData = await siwxConfig.createMessage({
        accountAddress: promptIdentity.address,
        chainId: promptIdentity.chainId,
      });
      const message = messageData.toString();
      const signature = await signMessageAsync({
        account: promptIdentity.address,
        message,
      });
      if (currentKeyRef.current !== promptIdentity.key) {
        throw new Error(
          "The connected wallet changed. Reconnect and try again.",
        );
      }
      await siwxConfig.addSession({ data: messageData, message, signature });
      const sessions = await siwxConfig.getSessions(
        promptIdentity.chainId,
        promptIdentity.address,
      );
      if (sessions.length === 0) {
        throw new Error(
          "The signature was verified, but Gasport could not save your session. Please allow site cookies and try again.",
        );
      }
      setPromptIdentity(null);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message.includes("rejected")
          ? "You declined the signature request. Sign to continue or cancel the connection."
          : cause instanceof Error
            ? cause.message
            : "Could not sign the terms. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }, [pending, promptIdentity, signMessageAsync]);

  return (
    <TermsSignDialog
      error={error}
      onCancel={cancel}
      onSign={() => void sign()}
      open={promptIdentity !== null}
      pending={pending}
    />
  );
}
