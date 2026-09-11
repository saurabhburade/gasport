"use client";

import { ExternalLink, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function TransactionHistory({ address }: { address?: string }) {
  const explorerUrl = address
    ? `https://explorer.near-intents.org/?search=${encodeURIComponent(address)}`
    : "https://explorer.near-intents.org/";

  return (
    <Card className="w-full border-border bg-card">
      <CardHeader className="gap-1 px-5 pb-3 pt-5">
        <CardTitle className="text-xl tracking-[-0.03em]">Swaps</CardTitle>
        <p className="text-sm text-muted-foreground">
          NEAR Intents indexes swaps after it detects the source-chain deposit.
        </p>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-muted/40 px-5 py-10 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-background ring-1 ring-foreground/10">
            <Wallet className="size-5 text-muted-foreground" />
          </span>
          <p className="max-w-sm text-sm text-muted-foreground">
            {address
              ? "Open the NEAR Intents Explorer to search for current and completed swaps."
              : "Connect a wallet, then open the NEAR Intents Explorer to view swaps."}
          </p>
          <a
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-medium transition-colors hover:bg-secondary"
            href={explorerUrl}
            rel="noreferrer"
            target="_blank"
          >
            Open NEAR Intents Explorer <ExternalLink className="size-4" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
