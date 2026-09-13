import {
  CircleAlert,
  Copy,
  ExternalLink,
  Loader,
  RotateCcw,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import type { DestinationChain } from "@/config/chains";
import type { GasExecutionResult } from "@/hooks/use-gas-execution";
import type { GasFlowState, GasQuote } from "@/types/gas";
import { NativeGasMark } from "./asset-marks";
import { formatAddress, formatExecutionDuration } from "./common";
import {
  FeeBreakdownTooltip,
  NetworkDetail,
  QuoteDetail,
} from "./quote-details";
import type { MarketQuote } from "./types";

export function ConfirmationDialog({
  open,
  amount,
  completion,
  destination,
  flowState,
  recipient,
  receiveAmount,
  route,
  quote,
  sourceChain,
  onConfirm,
  onOpenChange,
  onReset,
  error,
  isPreparingDeposit,
  isRetrying,
  retryStartsFreshQuote,
  retryRequiresWallet,
  onRetry,
}: {
  open: boolean;
  amount: string;
  completion: GasExecutionResult | null;
  destination: DestinationChain;
  flowState: GasFlowState;
  recipient: string;
  receiveAmount?: string;
  route?: MarketQuote;
  quote: GasQuote | null;
  sourceChain: DestinationChain;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  onReset: () => void;
  error: string | null;
  isPreparingDeposit: boolean;
  isRetrying: boolean;
  retryStartsFreshQuote: boolean;
  retryRequiresWallet: boolean;
  onRetry: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const alertTransition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, duration: 0.3, bounce: 0 };
  const isProcessing =
    flowState !== "confirming" &&
    flowState !== "failed" &&
    flowState !== "completed";
  const transactionUrl = completion
    ? `${sourceChain.explorerUrl}/tx/${completion.txHash}`
    : undefined;
  const routeExplorerUrl = completion
    ? (completion.explorerUrl ??
      (completion.provider === "near-1click"
        ? `https://explorer.near-intents.org/?search=${encodeURIComponent(completion.txHash)}`
        : undefined))
    : undefined;
  const copyTransactionHash = () => {
    if (completion) void navigator.clipboard?.writeText(completion.txHash);
  };
  const processingLabel: Partial<Record<GasFlowState, string>> = {
    switching_network: "Switching source network",
    simulating: "Checking transaction on-chain",
    wallet_signature: "Awaiting authorization",
    submitting: "Submitting source-chain transaction",
    deposit_pending: "Waiting for source-chain confirmation",
    solver_executing: "Waiting for destination delivery",
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(680px,calc(100vh-2rem))] gap-3 overflow-y-auto sm:max-h-[min(620px,calc(100vh-2rem))] sm:max-w-[420px]">
        <div className="border-b pb-4 pr-10">
          <p className="text-base font-semibold tracking-[-0.035em]">
            Gas on {destination.name}
          </p>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 py-2 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted/40 ring-1 ring-foreground/10">
            <NativeGasMark chain={destination} />
          </span>
          <p className="text-3xl font-semibold tracking-[-0.05em] tabular-nums sm:text-4xl">
            {receiveAmount
              ? `${receiveAmount} ${destination.symbol}`
              : "Quote unavailable"}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <div className="rounded-2xl bg-muted/40 p-4 text-xs">
            <div className="space-y-1">
              <QuoteDetail
                label="You pay"
                value={
                  route
                    ? `${route.input} ${route.inputSymbol}`
                    : quote
                      ? `${amount} ${quote.inputToken.symbol}`
                      : "-"
                }
              />
              <NetworkDetail chain={sourceChain} label="From network" />
            </div>
            <div className="my-2 h-px bg-foreground/10" />
            <div className="space-y-1">
              <QuoteDetail
                label="Minimum received"
                value={
                  route ? `${route.minimumReceived} ${destination.symbol}` : "-"
                }
              />
              <NetworkDetail chain={destination} label="To network" />
              <QuoteDetail label="Recipient" value={formatAddress(recipient)} />
              <div className="flex min-h-7 items-center justify-between gap-4">
                <span className="flex items-center text-muted-foreground">
                  Execution Fee
                  {route && <FeeBreakdownTooltip route={route} />}
                </span>
                <span className="text-right text-xs tabular-nums">
                  {route?.networkFee ?? "-"}
                </span>
              </div>
              <QuoteDetail
                label="Estimated completion"
                value={formatExecutionDuration(route?.executionDurationSeconds)}
              />
            </div>
          </div>
          {flowState === "confirming" && !quote ? (
            <Alert className="border-0 bg-secondary py-3">
              <CircleAlert className="size-4" />
              <AlertTitle>Quote expired</AlertTitle>
              <AlertDescription>
                This quote is no longer valid. Close this dialog and refresh the
                quote before continuing.
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
        <AnimatePresence initial={false}>
          {flowState === "confirming" && error && (
            <motion.div
              animate={{
                filter: "blur(0px)",
                height: "auto",
                opacity: 1,
                y: 0,
              }}
              className="overflow-hidden"
              exit={{ filter: "blur(4px)", height: 0, opacity: 0, y: -6 }}
              initial={{ filter: "blur(4px)", height: 0, opacity: 0, y: 6 }}
              key="deposit-preparation-error"
              transition={alertTransition}
            >
              <Alert
                variant="destructive"
                className="border-0 bg-destructive/10 py-3"
              >
                <CircleAlert className="size-4" />
                <AlertTitle>Couldn&apos;t prepare deposit</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence initial={false} mode="popLayout">
          {flowState === "failed" && (
            <motion.div
              animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
              exit={{ filter: "blur(4px)", opacity: 0, y: -6 }}
              initial={{ filter: "blur(4px)", opacity: 0, y: 6 }}
              key="transaction-failed"
              transition={alertTransition}
            >
              <Alert
                variant="destructive"
                className="border-0 bg-destructive/10 py-3"
              >
                <CircleAlert className="size-4" />
                <AlertTitle className="min-w-0 break-words leading-4">
                  {error ?? "Transaction failed."}
                </AlertTitle>
              </Alert>
            </motion.div>
          )}
        </AnimatePresence>
        {flowState === "completed" && completion ? (
          <div className="space-y-3">
            <div className="space-y-3 rounded-2xl bg-muted/40 p-4 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Transaction hash</span>
                <span className="flex min-w-0 items-center gap-1.5 tabular-nums">
                  <span className="truncate" title={completion.txHash}>
                    {formatAddress(completion.txHash)}
                  </span>
                  <button
                    aria-label="Copy transaction hash"
                    className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    onClick={copyTransactionHash}
                    type="button"
                  >
                    <Copy className="size-4" />
                  </button>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 border-t border-foreground/10 pt-3">
                {transactionUrl && (
                  <a
                    className="flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-border px-3 text-center font-medium transition-colors hover:bg-secondary"
                    href={transactionUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {sourceChain.name} explorer
                    <ExternalLink className="size-3.5 shrink-0" />
                  </a>
                )}
                {routeExplorerUrl && (
                  <a
                    className="flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-border px-3 text-center font-medium transition-colors hover:bg-secondary"
                    href={routeExplorerUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {completion.provider === "near-1click"
                      ? "NEAR Intents Explorer"
                      : "LI.FI route explorer"}
                    <ExternalLink className="size-3.5 shrink-0" />
                  </a>
                )}
              </div>
            </div>
            <Button
              className="h-11 w-full rounded-full transition-transform active:scale-[0.96]"
              onClick={onReset}
            >
              <RotateCcw data-icon="inline-start" /> Start another
            </Button>
          </div>
        ) : flowState === "failed" ? (
          <Button
            className="h-11 w-full rounded-full"
            disabled={isRetrying}
            onClick={onRetry}
          >
            {isRetrying ? (
              <>
                <Loader className="animate-spin" data-icon="inline-start" />
                Retrying
              </>
            ) : retryRequiresWallet ? (
              "Connect wallet"
            ) : retryStartsFreshQuote ? (
              "Refresh quote"
            ) : (
              "Retry Transaction"
            )}
          </Button>
        ) : isProcessing ? (
          <div className="flex h-11 items-center justify-center gap-2 rounded-full bg-muted/40 px-4 text-sm font-medium">
            <Loader className="size-4 animate-spin" />
            {processingLabel[flowState] ?? "Processing transaction"}
          </div>
        ) : (
          <DialogFooter className="sticky bottom-0 z-10 mt-1 border-t border-border bg-popover pt-3 sm:static sm:m-0 sm:border-0 sm:bg-transparent sm:p-0">
            <Button
              disabled={isPreparingDeposit || !quote}
              onClick={onConfirm}
              className="w-full flex-1 rounded-full px-5 py-2.5 text-base transition-transform active:scale-[0.96] sm:px-4 sm:py-2 sm:text-sm"
            >
              {isPreparingDeposit ? (
                <>
                  <Loader className="animate-spin" data-icon="inline-start" />
                  Preparing deposit
                </>
              ) : (
                "Confirm transaction"
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
