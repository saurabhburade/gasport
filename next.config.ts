import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    maximumRedirects: 1,
    remotePatterns: [
      { protocol: "https", hostname: "arbitrum.foundation", pathname: "/**" },
      {
        protocol: "https",
        hostname: "assets.coingecko.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "coin-images.coingecko.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "ethereum-optimism.github.io",
        pathname: "/**",
      },
      { protocol: "https", hostname: "ipfs.io", pathname: "/ipfs/**" },
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
        pathname: "/trustwallet/assets/**",
      },
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
        pathname: "/lifinance/types/**",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
        pathname: "/u/232034195",
        search: "?v=4",
      },
    ],
  },
  reactCompiler: true,
  turbopack: {
    // Reown's Wagmi adapter statically reaches the optional Base Account branch.
    // This product disables Base Account/CDP and uses Coinbase Wallet via AppKit,
    // so its optional x402 peers must not become required browser dependencies.
    resolveAlias: {
      "@x402/core/client": "./src/lib/optional-x402-stub.ts",
      "@x402/evm": "./src/lib/optional-x402-stub.ts",
      "@x402/evm/exact/client": "./src/lib/optional-x402-stub.ts",
      "@x402/evm/upto/client": "./src/lib/optional-x402-stub.ts",
      "@x402/svm/exact/client": "./src/lib/optional-x402-stub.ts",
    },
  },
};

export default nextConfig;
