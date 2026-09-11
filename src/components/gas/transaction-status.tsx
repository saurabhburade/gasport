"use client";

import { Check, CircleAlert, ExternalLink, LoaderCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DestinationChain } from "@/config/chains";
import type { GasFlowState } from "@/types/gas";

function stateDetails(flowState: GasFlowState) {
  if (flowState === "completed") {
    return { label: "Swap settled", tone: "success" as const };
  }
  if (flowState === "failed") {
    return { label: "Swap needs attention", tone: "error" as const };
  }
  if (
    flowState === "solver_executing" ||
    flowState === "deposit_pending" ||
    flowState === "submitting" ||
    flowState === "wallet_signature" ||
    flowState === "switching_network"
  ) {
    return { label: "Swap in progress", tone: "active" as const };
  }
  return { label: "No active swap", tone: "idle" as const };
}

export function TransactionStatus({
  destination,
  flowState,
}: {
  destination: DestinationChain;
  flowState: GasFlowState;
}) {
  const status = stateDetails(flowState);
  return (
    <div className="w-full space-y-4">
      <Card className="w-full border-border bg-card">
        <CardHeader className="gap-1 px-5 pb-3 pt-5">
          <CardTitle className="text-xl tracking-[-0.03em]">
            Transaction status
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            NEAR Intents tracks the deposit through destination delivery.
          </p>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 px-4 py-4">
            <div>
              <p className="text-xs font-medium tracking-[0.1em] text-muted-foreground">
                Current swap
              </p>
              <p className="mt-1 text-sm font-medium">{status.label}</p>
            </div>
            <span
              className={`flex size-9 items-center justify-center rounded-full ${status.tone === "success" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : status.tone === "error" ? "bg-destructive/10 text-destructive" : "bg-background text-muted-foreground ring-1 ring-foreground/10"}`}
            >
              {status.tone === "success" ? (
                <Check className="size-4" strokeWidth={2.5} />
              ) : status.tone === "error" ? (
                <CircleAlert className="size-4" />
              ) : status.tone === "active" ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
            </span>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Destination network: {destination.name}
          </p>
        </CardContent>
      </Card>
      <a
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-border px-4 text-sm font-medium transition-colors hover:bg-secondary"
        href="https://explorer.near-intents.org/"
        rel="noreferrer"
        target="_blank"
      >
        View swaps in NEAR Intents Explorer <ExternalLink className="size-4" />
      </a>
    </div>
  );
}
