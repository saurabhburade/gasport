import Link from "next/link";
import type { ReactNode } from "react";
import { AlchemyLogo, LifiLogo, NearIntentsLogo } from "@/assets/partner-logos";

type DashboardShellProps = {
  actions: ReactNode;
  children: ReactNode;
  navigation: {
    active: boolean;
    icon?: ReactNode;
    label: string;
    onClick: () => void;
  }[];
};

export function DashboardShell({
  actions,
  children,
  navigation,
}: DashboardShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/92 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1540px] items-center gap-2 px-4 py-3 sm:gap-5 sm:px-8 lg:px-12">
          <nav
            aria-label="Primary navigation"
            className="flex items-center gap-1 text-xs"
          >
            {navigation.map((item) => (
              <button
                aria-current={item.active ? "page" : undefined}
                className={`inline-flex h-8 items-center gap-2 rounded-full px-3.5 font-semibold transition-colors ${item.active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                key={item.label}
                onClick={item.onClick}
                type="button"
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto">{actions}</div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1540px] flex-1 px-4 sm:px-8 lg:px-12">
        {children}
      </div>

      <footer className="border-y border-border/60">
        <div className="mx-auto flex w-full max-w-[1540px] flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-muted-foreground sm:px-8 lg:px-12">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Non-custodial gas abstraction</span>
            <Link
              className="underline-offset-4 transition-colors hover:text-foreground hover:underline"
              href="/how-it-works"
            >
              How it works
            </Link>
            <Link
              className="underline-offset-4 transition-colors hover:text-foreground hover:underline"
              href="/terms"
            >
              Terms of Use
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <span>Powered by</span>
            <a
              aria-label="NEAR Intents SDK documentation"
              className="transition-opacity hover:opacity-70"
              href="https://docs.near-intents.org/integration/distribution-channels/1click-api/sdk"
              rel="noreferrer"
              target="_blank"
            >
              <NearIntentsLogo aria-hidden="true" className="h-3 w-auto" />
            </a>
            <a
              aria-label="LI.FI Intents"
              className="transition-opacity hover:opacity-70"
              href="https://li.fi/intents"
              rel="noreferrer"
              target="_blank"
            >
              <LifiLogo aria-hidden="true" className="h-4 w-auto" />
            </a>
            <a
              aria-label="Alchemy"
              className="transition-opacity hover:opacity-70"
              href="https://www.alchemy.com"
              rel="noreferrer"
              target="_blank"
            >
              <AlchemyLogo aria-hidden="true" className="h-4 w-auto" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
