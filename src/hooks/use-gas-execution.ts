"use client";

import {
  useAppKitAccount,
  useAppKitNetwork,
  useAppKitProvider,
} from "@reown/appkit/react";
import { useCallback, useMemo, useRef, useState } from "react";
import type { Address, Hex } from "viem";
import { appKitNetworks } from "@/config/appkit";
import { executionErrorMessage } from "@/lib/gas/execution-errors";
import { resolveExecutionWallet } from "@/lib/gas/execution-wallet";
import {
  encodeNearDepositTransfer,
  type NearExecutionInput,
  validateNearExecutionInput,
} from "@/lib/gas/near-execution";
import {
  assertSponsorshipPreflight,
  createWalletSendCallsRequest,
  getPaymasterProxyUrl,
  getSponsorshipPreflightHeaders,
  getSponsorshipPreflightUrl,
  getWalletCallId,
  getWalletTransactionHash,
  parseWalletCallsStatus,
  type SourceGasFeeTransfer,
  WalletCallsTerminalError,
  type WalletRpcProvider,
} from "@/lib/gas/wallet-calls";
import type {
  PreparedRoute,
  RouteExecutionStatus,
  RouteProviderId,
} from "@/lib/routes/types";
import type { GasFlowState } from "@/types/gas";

const CONFIRMATION_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 2_000;
const SETTLEMENT_TIMEOUT_MS = 5 * 60_000;
const HASH_PATTERN = /^0x[\da-fA-F]{64}$/;

/** Optional metadata carried alongside a prepared route at execution time. */
export type RouteExecutionInput = PreparedRoute & {
  sourceGasFee?: SourceGasFeeTransfer;
  sponsorshipRequired?: boolean;
};

export type GasExecutionInput = RouteExecutionInput | NearExecutionInput;

export type GasExecutionResult = {
  chainId: number;
  completion: "intent" | "route";
  depositAddress?: Address;
  destinationTxHash?: Hex;
  explorerUrl?: string;
  provider: RouteProviderId;
  sourceCallId?: string;
  sourceChainId: number;
  sourceTxHash: Hex;
  /** Compatibility alias for the original NEAR-only result shape. */
  txHash: Hex;
};

type ExecutionStep = "send" | "confirm" | "monitor";

type ExecutionCheckpoint = {
  account?: Address;
  input: GasExecutionInput;
  route: RouteExecutionInput;
  sourceTxHash?: Hex;
  step: ExecutionStep;
  updatedAt: number;
  version: 1;
  walletCallId?: string;
};

function sleep(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function isPreparedRoute(
  input: GasExecutionInput,
): input is RouteExecutionInput {
  return (
    typeof input === "object" &&
    input !== null &&
    "calls" in input &&
    Array.isArray(input.calls) &&
    "provider" in input &&
    "settlement" in input
  );
}

function nearInputToRoute(input: NearExecutionInput): RouteExecutionInput {
  return {
    calls: [
      {
        data: encodeNearDepositTransfer(input),
        to: input.token,
        value: "0x0" as Hex,
      },
    ],
    provider: "near-1click",
    quote: {
      amountIn: input.amount.toString(),
      amountInFormatted: input.amount.toString(),
      amountOut: input.amount.toString(),
      amountOutFormatted: input.amount.toString(),
      expiresAt: new Date(Date.now() + SETTLEMENT_TIMEOUT_MS).toISOString(),
      fees: [],
      minAmountOut: input.amount.toString(),
      provider: "near-1click",
      providerQuoteId: "legacy-near-execution",
    },
    settlement: {
      depositAddress: input.depositAddress,
      ...(input.depositMemo ? { depositMemo: input.depositMemo } : {}),
      kind: "near-1click",
      quoteId: "legacy-near-execution",
    },
    sourceChainId: input.chainId,
    ...(input.sourceGasFeeAmount !== undefined &&
    input.sourceGasFeeRecipient !== undefined
      ? {
          sourceGasFee: {
            amount: input.sourceGasFeeAmount,
            recipient: input.sourceGasFeeRecipient,
            token: input.token,
          },
          sponsorshipRequired: true,
        }
      : {}),
  };
}

function settlementParams(
  params: URLSearchParams,
  settlement: PreparedRoute["settlement"],
) {
  params.set("settlement", JSON.stringify(settlement));
}

function asHash(value: unknown): Hex | undefined {
  return typeof value === "string" && HASH_PATTERN.test(value)
    ? (value as Hex)
    : undefined;
}

function routeStatusResult(value: unknown): RouteExecutionStatus {
  if (!value || typeof value !== "object") {
    throw new Error("The route status response is invalid.");
  }
  const status = value as Partial<RouteExecutionStatus>;
  if (status.kind === "pending") return { kind: "pending" };
  if (status.kind === "failed") {
    throw new Error(status.message || "The route execution failed.");
  }
  if (status.kind === "success") {
    const destinationTxHash = asHash(status.destinationTxHash);
    return {
      kind: "success",
      ...(destinationTxHash ? { destinationTxHash } : {}),
      ...(typeof status.explorerUrl === "string"
        ? { explorerUrl: status.explorerUrl }
        : {}),
    };
  }
  throw new Error("The route status response is invalid.");
}

export function useGasExecution() {
  const appKitAccount = useAppKitAccount({ namespace: "eip155" });
  const { walletProvider } = useAppKitProvider<WalletRpcProvider>("eip155");
  const { switchNetwork } = useAppKitNetwork();
  const connectedAddress = appKitAccount.address;
  const [checkpoint, setCheckpoint] = useState<ExecutionCheckpoint | null>(
    null,
  );
  const [flowState, setFlowState] = useState<GasFlowState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<GasExecutionResult | null>(null);
  const executionLock = useRef(false);
  const walletReady = Boolean(
    appKitAccount.isConnected && connectedAddress && walletProvider,
  );

  const updateCheckpoint = useCallback((next: ExecutionCheckpoint | null) => {
    setCheckpoint(next);
  }, []);

  const prepareWallet = useCallback(
    async (current: ExecutionCheckpoint) => {
      const { account, provider } = resolveExecutionWallet({
        address: connectedAddress,
        isConnected: appKitAccount.isConnected,
        provider: walletProvider,
      });
      if (
        current.account &&
        current.account.toLowerCase() !== account.toLowerCase()
      ) {
        throw new Error(
          "This pending route belongs to another wallet account.",
        );
      }

      const verifyProvider = async () => {
        const [accounts, chainId] = await Promise.all([
          provider.request({ method: "eth_accounts" }),
          provider.request({ method: "eth_chainId" }),
        ]);
        if (
          !Array.isArray(accounts) ||
          !accounts.some(
            (value) =>
              typeof value === "string" &&
              value.toLowerCase() === account.toLowerCase(),
          )
        ) {
          throw new Error("The wallet account changed. Reconfirm the route.");
        }
        if (typeof chainId !== "string" || !/^0x[\da-f]+$/i.test(chainId)) {
          throw new Error("The wallet returned an invalid network.");
        }
        const parsedChainId = Number.parseInt(chainId.slice(2), 16);
        if (!Number.isSafeInteger(parsedChainId) || parsedChainId <= 0) {
          throw new Error("The wallet returned an invalid network.");
        }
        return parsedChainId;
      };

      const providerChainId = await verifyProvider();
      if (providerChainId !== current.route.sourceChainId) {
        setFlowState("switching_network");
        const sourceNetwork = appKitNetworks.find(
          (network) => network.id === current.route.sourceChainId,
        );
        if (!sourceNetwork) {
          throw new Error("The route source network is not supported.");
        }
        await switchNetwork(sourceNetwork);
      }
      if ((await verifyProvider()) !== current.route.sourceChainId) {
        throw new Error(
          "The wallet is not connected to the route source network.",
        );
      }
      return { account, provider };
    },
    [
      appKitAccount.isConnected,
      connectedAddress,
      switchNetwork,
      walletProvider,
    ],
  );

  const waitForReceipt = useCallback(
    async (provider: WalletRpcProvider, hash: Hex) => {
      const deadline = Date.now() + CONFIRMATION_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const receipt = (await provider.request({
          method: "eth_getTransactionReceipt",
          params: [hash],
        })) as { status?: "0x0" | "0x1" } | null;
        if (receipt) {
          if (receipt.status === "0x0") {
            throw new WalletCallsTerminalError(
              "The source transaction reverted. Refresh the quote and try again.",
              hash,
            );
          }
          if (receipt.status !== "0x1") {
            throw new Error(
              "The wallet returned an invalid transaction receipt.",
            );
          }
          return;
        }
        await sleep(POLL_INTERVAL_MS);
      }
      throw new Error(
        "The source transaction is still pending. Retry will only check it again.",
      );
    },
    [],
  );

  const waitForWalletCalls = useCallback(
    async (
      provider: WalletRpcProvider,
      id: string,
      sponsorshipRequired: boolean,
    ) => {
      const deadline = Date.now() + CONFIRMATION_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const status = parseWalletCallsStatus(
          await provider.request({
            method: "wallet_getCallsStatus",
            params: [id],
          }),
          { sponsorshipRequired },
        );
        if (status.status === "success") return status.transactionHash;
        await sleep(POLL_INTERVAL_MS);
      }
      throw new Error(
        "The wallet call batch is still pending. Retry will only check it again.",
      );
    },
    [],
  );

  const sendRoute = useCallback(
    async (current: ExecutionCheckpoint) => {
      const { account, provider } = await prepareWallet(current);
      if (current.sourceTxHash || current.walletCallId) {
        const next = {
          ...current,
          account,
          step: "confirm" as const,
          updatedAt: Date.now(),
        };
        updateCheckpoint(next);
        return next;
      }

      const sponsorshipRequired =
        current.route.sponsorshipRequired ??
        current.route.sourceGasFee !== undefined;
      const paymasterUrl = sponsorshipRequired
        ? getPaymasterProxyUrl({
            origin: window.location.origin,
            configuredUrl: process.env.NEXT_PUBLIC_PAYMASTER_PROXY_URL,
          })
        : undefined;
      if (sponsorshipRequired) {
        if (!paymasterUrl) {
          throw new Error("Source-chain gas sponsorship is unavailable.");
        }
        const sponsorshipResponse = await fetch(
          getSponsorshipPreflightUrl(paymasterUrl, current.route.sourceChainId),
          {
            cache: "no-store",
            headers: getSponsorshipPreflightHeaders({
              origin: window.location.origin,
              paymasterUrl,
            }),
          },
        );
        const sponsorshipStatus = await sponsorshipResponse
          .json()
          .catch(() => undefined);
        assertSponsorshipPreflight(sponsorshipResponse.ok, sponsorshipStatus);
      }
      setFlowState("wallet_signature");
      const request = createWalletSendCallsRequest({
        account,
        paymasterUrl,
        preparedRoute: current.route,
        sourceGasFee: current.route.sourceGasFee,
        sponsorshipRequired,
      });
      const response = await provider.request(request);
      const sourceTxHash = getWalletTransactionHash(response);
      const walletCallId = sourceTxHash ? undefined : getWalletCallId(response);
      if (!sourceTxHash && !walletCallId) {
        throw new Error(
          "The wallet returned no transaction or call identifier.",
        );
      }
      const next = {
        ...current,
        account,
        ...(sourceTxHash ? { sourceTxHash } : {}),
        ...(walletCallId ? { walletCallId } : {}),
        step: "confirm" as const,
        updatedAt: Date.now(),
      };
      updateCheckpoint(next);
      return next;
    },
    [prepareWallet, updateCheckpoint],
  );

  const confirmRoute = useCallback(
    async (current: ExecutionCheckpoint) => {
      const { provider } = await prepareWallet(current);
      setFlowState("deposit_pending");
      const sponsorshipRequired =
        current.route.sponsorshipRequired ??
        current.route.sourceGasFee !== undefined;
      const sourceTxHash =
        current.sourceTxHash ??
        (current.walletCallId
          ? await waitForWalletCalls(
              provider,
              current.walletCallId,
              sponsorshipRequired,
            )
          : undefined);
      if (!sourceTxHash) {
        throw new Error("The source transaction hash is missing.");
      }
      await waitForReceipt(provider, sourceTxHash);
      const next = {
        ...current,
        sourceTxHash,
        step: "monitor" as const,
        updatedAt: Date.now(),
      };
      updateCheckpoint(next);
      return next;
    },
    [prepareWallet, updateCheckpoint, waitForReceipt, waitForWalletCalls],
  );

  const monitorRoute = useCallback(
    async (current: ExecutionCheckpoint) => {
      if (!current.sourceTxHash) {
        throw new Error("The source transaction hash is missing.");
      }
      setFlowState("solver_executing");
      const deadline = Date.now() + SETTLEMENT_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const params = new URLSearchParams({
          provider: current.route.provider,
          sourceTxHash: current.sourceTxHash,
        });
        settlementParams(params, current.route.settlement);

        let response: Response | undefined;
        try {
          response = await fetch(`/api/routes/status?${params}`, {
            signal: AbortSignal.timeout(10_000),
          });
        } catch {
          // A temporary network failure is safe to retry because the source
          // transaction reference is already checkpointed in React memory.
        }

        if (response?.ok) {
          const status = routeStatusResult(await response.json());
          if (status.kind === "success") {
            const settlement = current.route.settlement;
            setResult({
              chainId: current.route.sourceChainId,
              completion:
                current.route.provider === "near-1click" ? "intent" : "route",
              ...(settlement.kind === "near-1click"
                ? { depositAddress: settlement.depositAddress }
                : {}),
              ...(status.destinationTxHash
                ? { destinationTxHash: status.destinationTxHash }
                : {}),
              ...(status.explorerUrl
                ? { explorerUrl: status.explorerUrl }
                : {}),
              provider: current.route.provider,
              ...(current.walletCallId
                ? { sourceCallId: current.walletCallId }
                : {}),
              sourceChainId: current.route.sourceChainId,
              sourceTxHash: current.sourceTxHash,
              txHash: current.sourceTxHash,
            });
            updateCheckpoint(null);
            setFlowState("completed");
            return;
          }
        } else if (response && ![404, 502, 503].includes(response.status)) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? "Could not check the route status.");
        }

        if (Date.now() + POLL_INTERVAL_MS >= deadline) break;
        await sleep(POLL_INTERVAL_MS);
      }
      throw new Error(
        "The route is still processing. Retry will only continue tracking it.",
      );
    },
    [updateCheckpoint],
  );

  const run = useCallback(
    async (initial: ExecutionCheckpoint) => {
      if (executionLock.current) return;
      executionLock.current = true;
      let current: ExecutionCheckpoint | null = initial;
      setIsExecuting(true);
      setError(null);
      try {
        if (current.step === "send") current = await sendRoute(current);
        if (current?.step === "confirm") current = await confirmRoute(current);
        if (current?.step === "monitor") await monitorRoute(current);
      } catch (nextError) {
        if (nextError instanceof WalletCallsTerminalError) {
          updateCheckpoint(null);
        }
        setFlowState("failed");
        setError(executionErrorMessage(nextError));
      } finally {
        executionLock.current = false;
        setIsExecuting(false);
      }
    },
    [confirmRoute, monitorRoute, sendRoute, updateCheckpoint],
  );

  const start = useCallback(
    (input: GasExecutionInput) => {
      if (executionLock.current || isExecuting || checkpoint) return;
      try {
        if (!isPreparedRoute(input)) validateNearExecutionInput(input);
        else if (
          !Number.isSafeInteger(input.sourceChainId) ||
          input.sourceChainId <= 0 ||
          input.calls.length === 0
        ) {
          throw new Error("The prepared route is invalid.");
        }
      } catch (nextError) {
        setFlowState("failed");
        setError(executionErrorMessage(nextError));
        return;
      }
      const legacyNear = !isPreparedRoute(input);
      const route = legacyNear ? nearInputToRoute(input) : input;
      setResult(null);
      const initial: ExecutionCheckpoint = {
        input,
        route,
        step: "send",
        updatedAt: Date.now(),
        version: 1,
      };
      updateCheckpoint(initial);
      void run(initial);
    },
    [checkpoint, isExecuting, run, updateCheckpoint],
  );

  const retry = useCallback(() => {
    if (!checkpoint || executionLock.current || isExecuting) return;
    void run(checkpoint);
  }, [checkpoint, isExecuting, run]);

  const reset = useCallback(() => {
    updateCheckpoint(null);
    setResult(null);
    setError(null);
    setFlowState("idle");
  }, [updateCheckpoint]);

  return useMemo(
    () => ({
      checkpoint,
      error,
      flowState,
      isExecuting,
      isResumable: Boolean(checkpoint),
      result,
      reset,
      retry,
      start,
      walletReady,
    }),
    [
      checkpoint,
      error,
      flowState,
      isExecuting,
      reset,
      result,
      retry,
      start,
      walletReady,
    ],
  );
}
