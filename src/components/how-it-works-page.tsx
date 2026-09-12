"use client";

import { useAppKit } from "@reown/appkit/react";
import { Fuel } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { useGasTheme } from "@/components/gas/workspace/use-gas-theme";
import { ThemeToggle } from "@/components/motion/theme-toggle";
import { WalletButton } from "@/components/wallet/wallet-button";
import { appKitProjectId } from "@/config/appkit";

export function HowItWorksPage() {
  const { open: openAppKit } = useAppKit();
  const [demoConnected, setDemoConnected] = useState(false);
  const { isDark, toggleTheme } = useGasTheme();

  const connect = () => {
    if (appKitProjectId) {
      void openAppKit({ view: "Connect" });
      return;
    }
    setDemoConnected(true);
  };

  return (
    <DashboardShell
      actions={
        <div className="flex items-center gap-2">
          <ThemeToggle isDark={isDark} onToggle={toggleTheme} />
          <WalletButton
            isDemoConnected={demoConnected}
            onDemoConnect={connect}
          />
        </div>
      }
      navigation={[
        {
          active: true,
          icon: <Fuel aria-hidden="true" className="size-4" />,
          label: "Gasport",
          onClick: () => window.location.assign("/"),
        },
      ]}
    >
      <main className="mx-auto w-full max-w-2xl px-6 py-12 text-sm leading-7 sm:py-20">
        <h1 className="text-balance text-3xl font-semibold tracking-tight">
          How it works
        </h1>
        <div className="mt-8 space-y-8 text-pretty">
          <p>
            Gasport turns tokens on one network into native gas on another. You
            choose what to spend, where the gas should go, and whether to
            approve the route shown to you.
          </p>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">Connect your wallet</h2>
            <p>
              Connect the wallet holding the tokens you want to use. If
              prompted, sign a free message to accept the{" "}
              <Link className="underline underline-offset-4" href="/terms">
                Terms of Use
              </Link>
              . This message does not move tokens or submit a transaction.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">
              Choose the token and destination
            </h2>
            <p>
              Enter an amount and select the token and network you are spending
              from. Then choose the network where you need gas. Gasport uses
              your connected wallet as the destination address by default, but
              you can enter another EVM address.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">Review the quote</h2>
            <p>
              Gasport finds a route and shows the gas you can expect to receive,
              the minimum received, and the fees. If your source wallet does not
              have enough native gas, an eligible transaction may use sponsored
              gas with a charge deducted from the tokens you enter. Otherwise,
              your wallet pays source-network gas separately.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">Approve and track</h2>
            <p>
              Select Get gas, check the networks, destination address, amount,
              and fees, then confirm the transaction in your wallet. Gasport
              shows progress from the source-network transaction to delivery on
              the destination network. You can use the explorer links to follow
              the transaction after submission. Check the destination carefully:
              a submitted blockchain transaction may not be reversible.
            </p>
          </section>
        </div>
      </main>
    </DashboardShell>
  );
}
