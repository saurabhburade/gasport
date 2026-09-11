"use client";

import { Button } from "@/components/ui/button";
import { appKitProjectId } from "@/config/appkit";

import { ConfiguredWalletButton } from "./configured-wallet-button";

export function WalletButton({
  isDemoConnected,
  onDemoConnect,
}: {
  isDemoConnected: boolean;
  onDemoConnect: () => void;
}) {
  if (appKitProjectId) return <ConfiguredWalletButton />;
  return (
    <Button
      onClick={onDemoConnect}
      className="rounded-full px-4 text-xs font-semibold"
      size="sm"
      variant={isDemoConnected ? "secondary" : "default"}
    >
      {isDemoConnected ? "0x71b…c84E" : "Connect wallet"}
    </Button>
  );
}
