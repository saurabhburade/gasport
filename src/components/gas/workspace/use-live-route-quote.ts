"use client";

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { type Address, formatUnits, parseUnits, zeroAddress } from "viem";
import type { DestinationChain } from "@/config/chains";
import type { SourceGasEstimate } from "@/lib/gas/source-gas";
import { calculateNetRouteAmount } from "@/lib/gas/source-gas-amount";
import type { NormalizedRouteQuote } from "@/lib/routes/types";
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
import type { MarketQuote, RouteQuoteApiResponse } from "./types";

export type QuoteStatus = "idle" | "loading" | "ready" | "error" | "invalid";

export function useLiveRouteQuote({
  amount,
  setWorkspaceError,
  destination,
  inputLimit,
  quoteUpdatesEnabled,
  quoteWalletAddress,
  recipientAddress,
  token,
}: {
  amount: string;
  setWorkspaceError: Dispatch<SetStateAction<string | null>>;
  destination: DestinationChain;
  inputLimit: bigint;
  quoteUpdatesEnabled: boolean;
  quoteWalletAddress: Address;
  recipientAddress?: Address;
  token: Token;
}) {
  const [liveQuote, setLiveQuote] = useState<NormalizedRouteQuote | null>(null);
  const [sourceGasEstimate, setSourceGasEstimate] =
    useState<SourceGasEstimate | null>(null);
  const [quoteStatus, setQuoteStatus] = useState<QuoteStatus>("idle");
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteRefreshKey, setQuoteRefreshKey] = useState(0);

  useEffect(() => {
    if (!quoteUpdatesEnabled) return;

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

    const controller = new AbortController();
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

    setQuoteStatus("loading");
    const timer = window.setTimeout(async () => {
      try {
        const gasResponse = await fetch("/api/gas/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            account: quoteWalletAddress,
            amount: inputAmount.toString(),
            chainId: token.chainId,
            quoteOnly: true,
            token: token.address,
          }),
        });
        const gasEstimate = (await gasResponse.json()) as SourceGasEstimate & {
          error?: string;
        };
        if (!gasResponse.ok) {
          throw new Error(
            gasEstimate.error ?? "Source gas estimate is unavailable.",
          );
        }
        const feeAmount = BigInt(gasEstimate.feeAmount);
        const quotedAmount = calculateNetRouteAmount({
          grossAmount: inputAmount,
          sponsorshipFee: feeAmount,
        });
        const response = await fetch(
          `/api/routes/quote?refresh=${quoteRefreshKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              ...routeQuoteRequest({
                account: quoteWalletAddress,
                amount: quotedAmount,
                destination,
                recipient: recipientAddress,
                sponsorshipRequired: gasEstimate.sponsorshipRequired,
                token,
              }),
              provider: "auto",
            }),
          },
        );
        const body = (await response.json()) as RouteQuoteApiResponse;
        if (!response.ok) {
          throw new Error(body.error ?? "Quote request failed.");
        }
        if (!body.selected) {
          throw new Error("No route provider returned a usable quote.");
        }
        if (marketQuoteExpiry(body.selected) <= Date.now()) {
          throw new Error("The route provider returned an expired quote.");
        }
        setSourceGasEstimate(gasEstimate);
        setLiveQuote(body.selected);
        setQuoteStatus("ready");
      } catch (requestError) {
        if (controller.signal.aborted) return;
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
      window.clearTimeout(timer);
    };
  }, [
    amount,
    destination,
    inputLimit,
    quoteRefreshKey,
    quoteUpdatesEnabled,
    quoteWalletAddress,
    recipientAddress,
    setWorkspaceError,
    token,
  ]);

  useEffect(() => {
    if (!quoteUpdatesEnabled || !liveQuote || quoteStatus !== "ready") return;
    const expiresAt = marketQuoteExpiry(liveQuote);
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      setLiveQuote(null);
      setQuoteRefreshKey((current) => current + 1);
      return;
    }
    const timer = window.setTimeout(() => {
      setLiveQuote(null);
      setQuoteRefreshKey((current) => current + 1);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [liveQuote, quoteStatus, quoteUpdatesEnabled]);

  useEffect(() => {
    if (!quoteUpdatesEnabled || quoteStatus !== "error") return;
    const timer = window.setTimeout(() => {
      setQuoteRefreshKey((current) => current + 1);
    }, 10_000);
    return () => window.clearTimeout(timer);
  }, [quoteStatus, quoteUpdatesEnabled]);

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

  return {
    liveQuote,
    marketQuote,
    quote,
    quoteError,
    quoteStatus,
    refreshQuote,
    setLiveQuote,
    sourceGasEstimate,
  };
}
