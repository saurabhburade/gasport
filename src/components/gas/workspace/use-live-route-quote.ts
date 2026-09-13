"use client";

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type Address, formatUnits, parseUnits, zeroAddress } from "viem";
import { CHAIN_LIST, type DestinationChain } from "@/config/chains";
import {
  type ClientSourceGasConfig,
  estimateSourceGasInBrowser,
} from "@/lib/gas/client-source-gas";
import { QuoteUpdateGate } from "@/lib/gas/quote-update-gate";
import type { SourceGasEstimate } from "@/lib/gas/source-gas";
import { calculateNetRouteAmount } from "@/lib/gas/source-gas-amount";
import { LifiRouteAdapter } from "@/lib/routes/adapters/lifi";
import { NearOneClickRouteAdapter } from "@/lib/routes/adapters/near-oneclick";
import type {
  NearClientConfig,
  NormalizedRouteQuote,
} from "@/lib/routes/types";
import type { GasQuote } from "@/types/gas";
import type { Token } from "@/types/tokens";
import {
  formatReceive,
  formatTokenFee,
  formatUsd,
  marketQuoteExpiry,
  routeQuoteRequest,
} from "./common";
import { providerLabelById, QUOTE_DEBOUNCE_MS } from "./constants";
import type { MarketQuote } from "./types";

export type QuoteStatus = "idle" | "loading" | "ready" | "error" | "invalid";

export function useLiveRouteQuote({
  amount,
  setWorkspaceError,
  destination,
  inputLimit,
  quoteUpdatesEnabled,
  quoteWalletAddress,
  recipientAddress,
  nearClientConfig,
  sourceGasConfig,
  token,
}: {
  amount: string;
  setWorkspaceError: Dispatch<SetStateAction<string | null>>;
  destination: DestinationChain;
  inputLimit: bigint;
  quoteUpdatesEnabled: boolean;
  quoteWalletAddress: Address;
  recipientAddress?: Address;
  nearClientConfig: NearClientConfig;
  sourceGasConfig: ClientSourceGasConfig;
  token: Token;
}) {
  const [liveQuote, setLiveQuote] = useState<NormalizedRouteQuote | null>(null);
  const [sourceGasEstimate, setSourceGasEstimate] =
    useState<SourceGasEstimate | null>(null);
  const [quoteStatus, setQuoteStatus] = useState<QuoteStatus>("idle");
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteRefreshKey, setQuoteRefreshKey] = useState(0);
  const quoteGate = useRef(new QuoteUpdateGate()).current;

  useEffect(() => {
    if (quoteUpdatesEnabled) quoteGate.resume();
    else quoteGate.pause();
  }, [quoteGate, quoteUpdatesEnabled]);

  useEffect(() => {
    // A manual refresh must request fresh provider quotes even if inputs match.
    void quoteRefreshKey;
    if (!quoteUpdatesEnabled || !quoteGate.canUpdate) return;

    let inputAmount: bigint;
    try {
      inputAmount = parseUnits(amount.trim(), token.decimals);
      if (inputAmount <= BigInt(0)) throw new Error("invalid amount");
    } catch {
      setLiveQuote(null);
      setSourceGasEstimate(null);
      setQuoteStatus("idle");
      setQuoteError(null);
      return;
    }

    setLiveQuote(null);
    setSourceGasEstimate(null);
    setWorkspaceError(null);
    setQuoteError(null);
    if (inputAmount > inputLimit) {
      setQuoteStatus("invalid");
      setQuoteError(`Maximum input is 10,000 ${token.symbol}.`);
      return;
    }

    if (!recipientAddress) {
      setQuoteStatus("idle");
      return;
    }

    const controller = new AbortController();
    quoteGate.track(controller);
    setQuoteStatus("loading");
    const timer = window.setTimeout(async () => {
      try {
        const sourceChain = CHAIN_LIST.find(
          (chain) => chain.id === token.chainId,
        );
        if (!sourceChain) throw new Error("Unsupported source chain.");
        const gasEstimate = await estimateSourceGasInBrowser({
          account: quoteWalletAddress,
          amount: inputAmount,
          chain: sourceChain,
          config: sourceGasConfig,
          signal: controller.signal,
          token,
        });
        if (!quoteGate.accepts(controller)) return;
        const feeAmount = BigInt(gasEstimate.feeAmount);
        const quotedAmount = calculateNetRouteAmount({
          grossAmount: inputAmount,
          sponsorshipFee: feeAmount,
        });
        const quoteRequest = routeQuoteRequest({
          account: quoteWalletAddress,
          amount: quotedAmount,
          destination,
          recipient: recipientAddress,
          sponsorshipRequired: gasEstimate.sponsorshipRequired,
          token,
        });
        const results = await Promise.allSettled([
          new LifiRouteAdapter(sourceGasConfig.platformFeeRecipient).getQuote(
            quoteRequest,
            AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
          ),
          new NearOneClickRouteAdapter(nearClientConfig).getQuote(
            quoteRequest,
            AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
          ),
        ]);
        if (!quoteGate.accepts(controller)) return;
        const quotes = results.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : [],
        );
        quotes.sort((first, second) => {
          const amountDifference =
            BigInt(second.amountOut) - BigInt(first.amountOut);
          if (amountDifference !== 0n) return amountDifference > 0n ? 1 : -1;
          return (
            (first.durationSeconds ?? Infinity) -
            (second.durationSeconds ?? Infinity)
          );
        });
        const selected = quotes[0];
        if (!selected) {
          const failure = results.find(
            (result) => result.status === "rejected",
          );
          throw failure?.reason instanceof Error
            ? failure.reason
            : new Error("No route provider returned a usable quote.");
        }
        if (marketQuoteExpiry(selected) <= Date.now()) {
          throw new Error("The route provider returned an expired quote.");
        }
        setSourceGasEstimate(gasEstimate);
        setLiveQuote(selected);
        setQuoteStatus("ready");
      } catch (requestError) {
        if (!quoteGate.accepts(controller)) return;
        setLiveQuote(null);
        setSourceGasEstimate(null);
        setQuoteStatus("error");
        setQuoteError(
          requestError instanceof Error
            ? requestError.message
            : "Live quote is unavailable.",
        );
      }
    }, QUOTE_DEBOUNCE_MS);

    return () => {
      controller.abort();
      quoteGate.release(controller);
      window.clearTimeout(timer);
    };
  }, [
    amount,
    destination,
    inputLimit,
    nearClientConfig,
    quoteGate,
    quoteRefreshKey,
    quoteUpdatesEnabled,
    quoteWalletAddress,
    recipientAddress,
    setWorkspaceError,
    sourceGasConfig,
    token,
  ]);

  useEffect(() => {
    if (
      !quoteUpdatesEnabled ||
      !quoteGate.canUpdate ||
      !liveQuote ||
      quoteStatus !== "ready"
    )
      return;
    const expiresAt = marketQuoteExpiry(liveQuote);
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      setLiveQuote(null);
      setQuoteRefreshKey((current) => current + 1);
      return;
    }
    const timer = window.setTimeout(() => {
      if (!quoteGate.canUpdate) return;
      setLiveQuote(null);
      setQuoteRefreshKey((current) => current + 1);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [liveQuote, quoteGate, quoteStatus, quoteUpdatesEnabled]);

  useEffect(() => {
    if (!quoteUpdatesEnabled || !quoteGate.canUpdate || quoteStatus !== "error")
      return;
    const timer = window.setTimeout(() => {
      if (!quoteGate.canUpdate) return;
      setQuoteRefreshKey((current) => current + 1);
    }, 10_000);
    return () => window.clearTimeout(timer);
  }, [quoteGate, quoteStatus, quoteUpdatesEnabled]);

  const quote = useMemo<GasQuote | null>(() => {
    if (!liveQuote || !destination.intentsAssetId) return null;
    return {
      inputAmount: BigInt(liveQuote.amountIn),
      outputAmount: BigInt(liveQuote.amountOut),
      inputToken: token,
      outputToken: {
        address: zeroAddress,
        symbol: destination.symbol,
        name: `${destination.name} gas`,
        decimals: destination.decimals,
        chainId: destination.id,
        intentsAssetId: destination.intentsAssetId,
      },
      estimatedGasReceived: liveQuote.amountOutFormatted,
      quoteId: liveQuote.providerQuoteId,
      expiresAt: marketQuoteExpiry(liveQuote),
    };
  }, [destination, liveQuote, token]);

  const marketQuote = useMemo<MarketQuote | undefined>(() => {
    if (!quote || !liveQuote || !sourceGasEstimate) return undefined;
    const inputUsd = Number(liveQuote.amountInFormatted);
    const outputUsd = Number(liveQuote.amountOutUsd);
    const routeCostUsd =
      Number.isFinite(inputUsd) && Number.isFinite(outputUsd)
        ? Math.max(0, inputUsd - outputUsd)
        : 0;
    return {
      fees: liveQuote.fees,
      input: formatUnits(
        BigInt(liveQuote.amountIn) + BigInt(sourceGasEstimate.feeAmount),
        token.decimals,
      ),
      inputSymbol: token.symbol,
      minimumReceived: formatReceive(
        formatUnits(BigInt(liveQuote.minAmountOut), quote.outputToken.decimals),
      ),
      networkFee: formatUsd(
        (routeCostUsd + Number(sourceGasEstimate.feeUsd)).toString(),
      ),
      output: formatReceive(liveQuote.amountOutFormatted),
      providerLabel: providerLabelById[liveQuote.provider],
      sourceGasFeeToken: formatTokenFee(sourceGasEstimate.feeAmountFormatted),
      sourceGasSponsored: sourceGasEstimate.sponsorshipRequired,
      executionDurationSeconds: liveQuote.durationSeconds,
    };
  }, [liveQuote, quote, sourceGasEstimate, token]);

  const refreshQuote = useCallback(() => {
    setQuoteRefreshKey((current) => current + 1);
  }, []);

  const pauseQuoteUpdates = useCallback(() => {
    quoteGate.pause();
  }, [quoteGate]);

  return {
    liveQuote,
    marketQuote,
    quote,
    quoteError,
    quoteStatus,
    pauseQuoteUpdates,
    refreshQuote,
    setLiveQuote,
    sourceGasEstimate,
  };
}
