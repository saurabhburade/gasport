#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getAddress } from "viem";

const tokenApiUrl = "https://1click.chaindefuser.com/v0/tokens";
const logoUriOverrides = {
  "base:0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf":
    "https://coin-images.coingecko.com/coins/images/40143/large/cbbtc.webp?1726136727",
  "eth:0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf":
    "https://coin-images.coingecko.com/coins/images/40143/large/cbbtc.webp?1726136727",
  "gnosis:0x420ca0f9b9b604ce0fd9c18ef134c705e5fa3430":
    "https://coin-images.coingecko.com/coins/images/54303/large/eure.jpg?1739167959",
  "gnosis:0x5cb9073902f2035222b9749f8fb0c9bfe5527108":
    "https://coin-images.coingecko.com/coins/images/39004/large/gbp.png?1719840784",
  "gnosis:0x2a22f9c3b484c3629090feed35f17ff8f88f76f0":
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png",
  "gnosis:0x4ecaba5870353805a9f068101a40e0f32ed605c6":
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png",
  "gnosis:0x6a023ccd1ff6f2045c3309768ead9e68f978f6e1":
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png",
};
const stablecoinCoingeckoIds = new Set([
  "dai",
  "falcon-finance",
  "monerium-eur-money-2",
  "monerium-gbp-emoney",
  "tether",
  "usd-coin",
  "usd1-wlfi",
  "usdt0",
]);
const stablecoinSymbols = new Set([
  "DAI",
  "EURe",
  "GBPe",
  "USDC",
  "USDT",
  "USDT0",
  "USD1",
  "USDf",
]);
const blueChipCoingeckoIds = new Set([
  "aave",
  "bitcoin",
  "chainlink",
  "coinbase-wrapped-btc",
  "ethereum",
  "uniswap",
  "wrapped-bitcoin",
]);
const blueChipSymbols = new Set(["AAVE", "cbBTC", "LINK", "UNI", "WBTC", "WETH"]);
const chainLists = {
  eth: { chainId: 1, trustWalletBlockchain: "ethereum" },
  arb: { chainId: 42161, trustWalletBlockchain: "arbitrum" },
  adi: { chainId: 36900 },
  aurora: { chainId: 1313161554, trustWalletBlockchain: "aurora" },
  base: { chainId: 8453, trustWalletBlockchain: "base" },
  bera: { chainId: 80094 },
  bsc: { chainId: 56, trustWalletBlockchain: "smartchain" },
  gnosis: { chainId: 100, trustWalletBlockchain: "xdai" },
  op: { chainId: 10, trustWalletBlockchain: "optimism" },
  plasma: { chainId: 9745, trustWalletBlockchain: "plasma" },
  pol: { chainId: 137, trustWalletBlockchain: "polygon" },
  avax: { chainId: 43114, trustWalletBlockchain: "avalanchec" },
  monad: { chainId: 143, trustWalletBlockchain: "monad" },
  xlayer: { chainId: 196 },
  scroll: { chainId: 534352, trustWalletBlockchain: "scroll" },
};
const evmAddress = /^0x[\da-fA-F]{40}$/;
const outputDirectory = resolve(import.meta.dirname, "../src/config/tokens");

function isToken(item) {
  return (
    item &&
    typeof item === "object" &&
    typeof item.assetId === "string" &&
    typeof item.blockchain === "string" &&
    typeof item.contractAddress === "string" &&
    evmAddress.test(item.contractAddress) &&
    typeof item.decimals === "number" &&
    Number.isInteger(item.decimals) &&
    item.decimals >= 0 &&
    typeof item.symbol === "string" &&
    item.symbol.trim()
  );
}

const response = await fetch(tokenApiUrl, { signal: AbortSignal.timeout(10_000) });
if (!response.ok) {
  throw new Error(`1Click token API returned ${response.status}.`);
}
const catalog = await response.json();
if (!Array.isArray(catalog)) {
  throw new Error("1Click token API returned an invalid token catalog.");
}

await mkdir(outputDirectory, { recursive: true });
for (const [blockchain, chain] of Object.entries(chainLists)) {
  const tokens = catalog
    .filter(
      (item) =>
        isToken(item) && item.blockchain.toLowerCase() === blockchain,
    )
    .filter(
      (item) =>
        (stablecoinCoingeckoIds.has(item.coingeckoId) &&
          stablecoinSymbols.has(item.symbol)) ||
        (blueChipCoingeckoIds.has(item.coingeckoId) &&
          blueChipSymbols.has(item.symbol)),
    )
    .map(
      ({ assetId, blockchain, contractAddress, decimals, symbol, coingeckoId }) => ({
        assetId,
        blockchain,
        contractAddress,
        decimals,
        symbol,
        ...(logoUriOverrides[
          `${blockchain.toLowerCase()}:${contractAddress.toLowerCase()}`
        ]
          ? {
              logoURI:
                logoUriOverrides[
                  `${blockchain.toLowerCase()}:${contractAddress.toLowerCase()}`
                ],
            }
          : chain.trustWalletBlockchain
          ? {
              logoURI: `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${chain.trustWalletBlockchain}/assets/${getAddress(contractAddress)}/logo.png`,
            }
          : {}),
        ...(typeof coingeckoId === "string" && coingeckoId
          ? { coingeckoId }
          : {}),
      }),
    )
    .sort(
      (left, right) =>
        left.symbol.localeCompare(right.symbol) ||
        left.contractAddress.localeCompare(right.contractAddress),
    );
  await writeFile(
    resolve(outputDirectory, `${chain.chainId}.json`),
    `${JSON.stringify(tokens, null, 2)}\n`,
  );
}
