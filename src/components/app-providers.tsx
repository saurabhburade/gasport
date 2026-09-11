"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { type Config, cookieToInitialState, WagmiProvider } from "wagmi";
import { TooltipProvider } from "@/components/ui/tooltip";
import { appKit, wagmiAdapter } from "@/config/appkit";

const queryClient = new QueryClient();

export function AppProviders({
  children,
  cookies,
}: {
  children: ReactNode;
  cookies: string | null;
}) {
  if (!appKit || !wagmiAdapter) {
    return <TooltipProvider>{children}</TooltipProvider>;
  }

  const initialState = cookieToInitialState(
    wagmiAdapter.wagmiConfig as Config,
    cookies,
  );
  return (
    <WagmiProvider
      config={wagmiAdapter.wagmiConfig as Config}
      initialState={initialState}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>{children}</TooltipProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
