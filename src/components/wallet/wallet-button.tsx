"use client";

import { useAppKit, useAppKitAccount } from "@reown/appkit/react";
import { Button } from "@/components/ui/button";
import { appKitProjectId } from "@/config/appkit";

function formatWalletAddress(address?: string) {
  if (!address) return "Wallet connected";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

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

function ConfiguredWalletButton() {
  const { address, isConnected } = useAppKitAccount();
  const { open } = useAppKit();

  return (
    <Button
      className="rounded-full px-4 text-xs font-semibold"
      onClick={() => void open({ view: isConnected ? "Account" : "Connect" })}
      size="sm"
      variant={isConnected ? "secondary" : "default"}
    >
      {isConnected ? formatWalletAddress(address) : "Connect wallet"}
    </Button>
  );
}
