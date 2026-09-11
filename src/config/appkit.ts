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
        enableCoinbase: true,
        enableBaseAccount: true,
        coinbasePreference: "smartWalletOnly",
        features: { analytics: false },
      })
    : undefined;
