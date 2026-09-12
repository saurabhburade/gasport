"use client";

import {
  adi,
  arbitrum,
  aurora,
  avalanche,
  base,
  berachain,
  bsc,
  gnosis,
  mainnet,
  monad,
  optimism,
  plasma,
  polygon,
  scroll,
  xLayer,
} from "@reown/appkit/networks";
import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";

export const appKitProjectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? "";
export const appKitNetworks = [
  mainnet,
  arbitrum,
  adi,
  aurora,
  base,
  berachain,
  bsc,
  gnosis,
  optimism,
  plasma,
  polygon,
  avalanche,
  monad,
  xLayer,
  scroll,
] as [
  typeof mainnet,
  typeof arbitrum,
  typeof adi,
  typeof aurora,
  typeof base,
  typeof berachain,
  typeof bsc,
  typeof gnosis,
  typeof optimism,
  typeof plasma,
  typeof polygon,
  typeof avalanche,
  typeof monad,
  typeof xLayer,
  typeof scroll,
];
export const wagmiAdapter = appKitProjectId
  ? new WagmiAdapter({
      networks: appKitNetworks,
      projectId: appKitProjectId,
      ssr: true,
    })
  : undefined;

export const appKit =
  appKitProjectId && wagmiAdapter
    ? createAppKit({
        adapters: [wagmiAdapter],
        projectId: appKitProjectId,
        networks: appKitNetworks,
        defaultNetwork: mainnet,
        metadata: {
          name: "Gasport",
          description: "Turn the tokens you have into the gas you need.",
          url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
          icons: ["https://avatars.githubusercontent.com/u/179229932"],
        },
        termsConditionsUrl: process.env.NEXT_PUBLIC_APP_URL
          ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/terms`
          : undefined,
        enableCoinbase: true,
        enableBaseAccount: true,
        coinbasePreference: "smartWalletOnly",
        features: {
          analytics: false,
          email: false,
          socials: false,
          swaps: false,
        },
        themeVariables: {
          "--apkt-accent": "var(--primary)",
          "--apkt-border-radius-master": "2px",
          "--apkt-font-family":
            "var(--font-inter), Arial, Helvetica, sans-serif",
        },
      })
    : undefined;

// Reown project settings can override local feature flags during initialization.
// Keep email, social logins, and Swap hidden even when the remote project enables them.
if (appKit) {
  void appKit.ready().then(() => {
    if (typeof window !== "undefined") {
      appKit.setTermsConditionsUrl(`${window.location.origin}/terms`);
    }
    appKit.updateRemoteFeatures({ email: false, socials: false, swaps: false });
  });
}
