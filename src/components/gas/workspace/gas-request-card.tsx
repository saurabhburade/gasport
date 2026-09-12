import { CircleAlert, Pencil } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { formatUnits } from "viem";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { DestinationChain } from "@/config/chains";
import type { NormalizedRouteQuote } from "@/lib/routes/types";
import type { Token } from "@/types/tokens";
import { NativeGasMark, TokenMark } from "./asset-marks";
import { formatAddress, formatBalance, formatUsd } from "./common";
import type { InlineAlert, MarketQuote } from "./types";
import type { QuoteStatus } from "./use-live-route-quote";

export function GasRequestCard({
  amount,
  connected,
  destination,
  destinationAddress,
  destinationBalanceFormatted,
  inlineAlert,
  inputLimit,
  liveQuote,
  marketQuote,
  onAmountChange,
  onEditDestinationAddress,
  onGetGas,
  onOpenDestinationPicker,
  onOpenTokenPicker,
  quoteStatus,
  reduceMotion,
  sourceBalanceFormatted,
  sourceChain,
  token,
}: {
  amount: string;
  connected: boolean;
  destination: DestinationChain;
  destinationAddress: string;
  destinationBalanceFormatted?: string;
  inlineAlert: InlineAlert;
  inputLimit: bigint;
  liveQuote: NormalizedRouteQuote | null;
  marketQuote?: MarketQuote;
  onAmountChange: (value: string) => void;
  onEditDestinationAddress: () => void;
  onGetGas: () => void;
  onOpenDestinationPicker: () => void;
  onOpenTokenPicker: () => void;
  quoteStatus: QuoteStatus;
  reduceMotion: boolean | null;
  sourceBalanceFormatted?: string;
  sourceChain: DestinationChain;
  token: Token;
}) {
  return (
    <Card
      size="sm"
      className="w-full gap-0 border-border bg-card py-0 shadow-none"
    >
      <CardContent className="flex flex-col px-3 py-3 sm:px-4 sm:py-4">
        <div className="rounded-2xl border-[0.75px] border-border/30 bg-muted/40 p-4 transition-colors focus-within:bg-muted/55">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Input
                id="amount"
                aria-label="Amount"
                autoComplete="off"
                className="h-auto min-w-0 rounded-none border-0 bg-transparent p-0 text-4xl font-semibold tracking-[-0.07em] shadow-none focus-visible:border-0 focus-visible:ring-0 aria-invalid:!border-0 aria-invalid:!ring-0 md:text-4xl"
                inputMode="decimal"
                max={formatUnits(inputLimit, token.decimals)}
                pattern="[0-9]*[.]?[0-9]*"
                placeholder="0.00"
                aria-invalid={quoteStatus === "invalid"}
                value={amount}
                onChange={(event) => onAmountChange(event.target.value)}
              />
            </div>
            <button
              type="button"
              aria-haspopup="dialog"
              className="flex min-h-11 max-w-fit shrink-0 items-center gap-2 rounded-full border-[0.75px] border-foreground/5 bg-foreground/[0.02] px-3 py-1.5 transition-opacity hover:opacity-80 dark:bg-secondary"
              onClick={onOpenTokenPicker}
            >
              <TokenMark token={token} />
              <span className="text-left">
                <span className="block text-sm font-semibold">
                  {token.symbol}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {sourceChain.name}
                </span>
              </span>
            </button>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            {quoteStatus === "loading" ? (
              <Skeleton className="h-4 w-12" />
            ) : (
              <span className="tabular-nums">
                {liveQuote?.amountInUsd
                  ? formatUsd(liveQuote.amountInUsd)
                  : formatUsd("0")}
              </span>
            )}
            <span className="ml-auto tabular-nums">
              Bal: {connected ? formatBalance(sourceBalanceFormatted) : "0.00"}
            </span>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border-[0.75px] border-border/30 bg-muted/40 p-4">
          <div className="flex items-center justify-between gap-3">
            {quoteStatus === "loading" ? (
              <Skeleton className="h-9 w-40" />
            ) : (
              <span className="min-w-0 flex-1 tabular-nums text-3xl font-semibold tracking-[-0.06em]">
                {marketQuote?.output ?? "0.00"}
              </span>
            )}
            <button
              type="button"
              aria-haspopup="dialog"
              className="flex min-h-11 max-w-fit shrink-0 items-center gap-2 rounded-full border-[0.75px] border-foreground/5 bg-foreground/[0.02] px-3 py-1.5 transition-colors hover:bg-accent dark:bg-secondary"
              onClick={onOpenDestinationPicker}
            >
              <NativeGasMark chain={destination} />
              <span className="text-left">
                <span className="block text-sm font-semibold">
                  {destination.symbol}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {destination.name}
                </span>
              </span>
            </button>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            {quoteStatus === "loading" ? (
              <Skeleton className="h-4 w-12" />
            ) : (
              <span className="tabular-nums">
                {liveQuote?.amountOutUsd
                  ? formatUsd(liveQuote.amountOutUsd)
                  : formatUsd("0")}
              </span>
            )}
            <span className="tabular-nums">
              Bal:{" "}
              {connected ? formatBalance(destinationBalanceFormatted) : "0.00"}
            </span>
          </div>
        </div>

        <div className="mt-3 flex min-h-13 items-center gap-3 rounded-2xl border-[0.75px] border-border/30 bg-muted/40 px-4 py-2.5">
          <span className="shrink-0 text-xs font-medium">
            Destination address
          </span>
          <span
            className="min-w-0 flex-1 truncate text-right text-[11px] text-muted-foreground"
            title={destinationAddress || undefined}
          >
            {formatAddress(destinationAddress)}
          </span>
          <Button
            aria-label="Edit destination address"
            className="rounded-full"
            onClick={onEditDestinationAddress}
            size="icon"
            type="button"
            variant="secondary"
          >
            <Pencil className="size-3.5" />
          </Button>
        </div>

        <AnimatePresence initial={false}>
          {inlineAlert ? (
            <motion.div
              animate={{
                height: "auto",
                marginTop: 12,
                opacity: 1,
                y: 0,
              }}
              className="overflow-hidden"
              exit={{ height: 0, marginTop: 0, opacity: 0, y: -4 }}
              initial={{
                height: 0,
                marginTop: 0,
                opacity: 0,
                y: reduceMotion ? 0 : 4,
              }}
              key={inlineAlert.key}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : {
                      height: {
                        duration: 0.3,
                        ease: [0.16, 1, 0.3, 1],
                      },
                      marginTop: {
                        duration: 0.3,
                        ease: [0.16, 1, 0.3, 1],
                      },
                      opacity: { duration: 0.18 },
                      y: {
                        duration: 0.24,
                        ease: [0.16, 1, 0.3, 1],
                      },
                    }
              }
            >
              <Alert
                className="gap-y-0.5 border-0 bg-destructive/10 py-2.5"
                variant="destructive"
              >
                <CircleAlert className="size-3.5" />
                <AlertTitle className="text-xs">{inlineAlert.title}</AlertTitle>
                <AlertDescription className="text-[11px] leading-4">
                  {inlineAlert.description}
                </AlertDescription>
              </Alert>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <Button
          aria-busy={quoteStatus === "loading"}
          className="mt-3 w-full rounded-full"
          disabled={quoteStatus === "loading" || quoteStatus === "invalid"}
          onClick={onGetGas}
          size="lg"
        >
          {connected ? "Get gas" : "Connect wallet"}
        </Button>
      </CardContent>
    </Card>
  );
}
