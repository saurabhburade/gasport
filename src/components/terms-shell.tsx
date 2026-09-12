"use client";

import { Fuel } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { useGasTheme } from "@/components/gas/workspace/use-gas-theme";
import { ThemeToggle } from "@/components/motion/theme-toggle";
import { WalletButton } from "@/components/wallet/wallet-button";

export function TermsShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isDark, toggleTheme } = useGasTheme();
  const [demoConnected, setDemoConnected] = useState(false);

  return (
    <DashboardShell
      actions={
        <div className="flex items-center gap-2">
          <ThemeToggle isDark={isDark} onToggle={toggleTheme} />
          <WalletButton
            isDemoConnected={demoConnected}
            onDemoConnect={() => setDemoConnected(true)}
          />
        </div>
      }
      navigation={[
        {
          active: true,
          icon: <Fuel aria-hidden="true" className="size-4" />,
          label: "Gasport",
          onClick: () => router.push("/"),
        },
      ]}
    >
      {children}
    </DashboardShell>
  );
}
