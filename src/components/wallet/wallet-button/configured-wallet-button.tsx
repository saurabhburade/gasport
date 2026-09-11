"use client";

import { useAppKit, useAppKitAccount } from "@reown/appkit/react";
import { Button } from "@/components/ui/button";

import { formatWalletAddress } from "./common";

export function ConfiguredWalletButton() {
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
