import { formatUnits } from "viem";
import type { DestinationChain } from "@/config/chains";
import { hasInsufficientBalance } from "@/lib/amount-input";
import type { SourceGasEstimate } from "@/lib/gas/source-gas";
import type { GasFlowState, GasQuote } from "@/types/gas";
import type { Token } from "@/types/tokens";
import { formatBalance } from "./common";
import type { InlineAlert } from "./types";
import type { QuoteStatus } from "./use-live-route-quote";

export function workspaceAlert({
  connected,
  error,
  quote,
  quoteError,
  quoteStatus,
  sourceBalanceFormatted,
  sourceBalanceValue,
  sourceChain,
  sourceGasEstimate,
  state,
  token,
}: {
  connected: boolean;
  error: string | null;
  quote: GasQuote | null;
  quoteError: string | null;
  quoteStatus: QuoteStatus;
  sourceBalanceFormatted?: string;
  sourceBalanceValue?: bigint;
  sourceChain: DestinationChain;
  sourceGasEstimate: SourceGasEstimate | null;
  state: GasFlowState;
  token: Token;
}): InlineAlert {
  const requiredSourceAmount = quote
    ? quote.inputAmount + BigInt(sourceGasEstimate?.feeAmount ?? "0")
    : undefined;
  const insufficientBalance = hasInsufficientBalance({
    connected,
    requiredAmount: requiredSourceAmount,
    walletBalance: sourceBalanceValue,
  });
  const sourceGasUnavailable = Boolean(
    connected &&
      quoteStatus === "ready" &&
      sourceGasEstimate &&
      !sourceGasEstimate.executionAvailable,
  );
  const availableSourceGas = sourceGasEstimate
    ? formatBalance(
        formatUnits(
          BigInt(sourceGasEstimate.nativeBalanceWei),
          sourceChain.decimals,
        ),
      )
    : "—";
  const requiredSourceGas = sourceGasEstimate
    ? formatBalance(
        formatUnits(
          BigInt(sourceGasEstimate.requiredNativeWei),
          sourceChain.decimals,
        ),
      )
    : "—";

  if ((quoteStatus === "error" || quoteStatus === "invalid") && quoteError) {
    return {
      description: quoteError,
      key: "quote-error",
      title:
        quoteStatus === "invalid"
          ? "Maximum input exceeded"
          : "Quote unavailable",
    };
  }
  if (insufficientBalance) {
    return {
      description: `Available ${formatBalance(sourceBalanceFormatted)} ${token.symbol}; ${formatBalance(
        requiredSourceAmount === undefined
          ? undefined
          : formatUnits(requiredSourceAmount, token.decimals),
      )} ${token.symbol} required.`,
      key: "insufficient-balance",
      title: "Insufficient balance",
    };
  }
  if (sourceGasUnavailable) {
    return {
      description: `Available ${availableSourceGas} ${sourceChain.symbol}; ${requiredSourceGas} ${sourceChain.symbol} required. Add ${sourceChain.symbol} or enable gas sponsorship for ${sourceChain.name}.`,
      key: "insufficient-source-gas",
      title: `Insufficient ${sourceChain.symbol} for gas`,
    };
  }
  if (
    error &&
    (state === "wallet_required" || state === "idle" || state === "quoted")
  ) {
    return {
      description: error,
      key: "action-error",
      title: "Unable to continue",
    };
  }
  return null;
}
