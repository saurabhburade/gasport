import { CircleHelp } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { feeRateLabel, formatTokenFee } from "./common";
import type { MarketQuote } from "./types";

export function FeeBreakdownTooltip({ route }: { route: MarketQuote }) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label="Show fee breakdown"
        className="relative inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors before:absolute before:-inset-0.5 before:content-[''] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <CircleHelp className="size-4" />
      </TooltipTrigger>
      <TooltipContent
        align="end"
        className="block w-80 max-w-[calc(100vw-2rem)] p-3"
      >
        <p className="font-medium">Fee breakdown</p>
        <p className="mt-0.5 text-[11px] text-background/60">
          Route by {route.providerLabel}
        </p>
        <div className="mt-3 space-y-1.5 border-t border-background/15 pt-2 font-mono tabular-nums">
          {route.fees.map((fee) => {
            const rate = feeRateLabel(fee.rateBps);
            return (
              <div
                className="flex items-center justify-between gap-4"
                key={`${fee.kind}-${fee.label}-${fee.amount}-${fee.token.symbol}`}
              >
                <span className="font-sans text-background/70">
                  {fee.label}
                  {rate ? ` (${rate})` : ""}
                  {"\u00a0"}
                </span>
                <span className="whitespace-nowrap">
                  {formatTokenFee(fee.amount)} {fee.token.symbol}
                </span>
              </div>
            );
          })}
          <div className="flex items-center justify-between gap-4">
            <span className="font-sans text-background/70">
              {route.sourceGasSponsored
                ? "Transaction sponsorship fee"
                : "Estimated source gas"}
              {"\u00a0"}
            </span>
            <span className="whitespace-nowrap">
              {route.sourceGasSponsored
                ? `${route.sourceGasFeeToken} ${route.inputSymbol}`
                : "Paid by wallet"}
            </span>
          </div>
          <p className="pt-1 font-sans text-[11px] text-background/60">
            {route.sourceGasSponsored
              ? "Fixed $1 charge: one USD stablecoin or $1 worth of another token, deducted from the input and paid in the sponsored batch."
              : "No stablecoin gas charge is deducted when the wallet has enough native gas."}
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
