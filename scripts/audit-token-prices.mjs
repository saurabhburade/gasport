#!/usr/bin/env node

/** Compare public USD price coverage for the checked-in source-token catalog. */
import { readFile, readdir } from "node:fs/promises";

const tokenDirectory = new URL("../src/config/tokens/", import.meta.url);
const chainDirectory = new URL("../src/config/chains/", import.meta.url);

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function mapLimited(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await task(items[index]);
      }
    }),
  );
  return results;
}

function validPrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : undefined;
}

function display(value) {
  return value === undefined ? "-" : Number(value).toPrecision(6);
}

const chains = await Promise.all(
  (await readdir(chainDirectory))
    .filter((name) => name.endsWith(".json"))
    .map((name) => readJson(new URL(name, chainDirectory))),
);
const chainIdByBlockchain = new Map(
  chains.map((chain) => [chain.nearBlockchain, chain.id]),
);
const tokens = (
  await Promise.all(
    (await readdir(tokenDirectory))
      .filter((name) => name.endsWith(".json"))
      .map((name) => readJson(new URL(name, tokenDirectory))),
  )
)
  .flat()
  .map((token) => ({
    ...token,
    chainId: chainIdByBlockchain.get(token.blockchain),
  }))
  .sort((a, b) => a.chainId - b.chainId || a.symbol.localeCompare(b.symbol));

const coinGeckoIds = [...new Set(tokens.map((token) => token.coingeckoId))].filter(
  Boolean,
);
const coinGeckoUrl = new URL("https://api.coingecko.com/api/v3/simple/price");
coinGeckoUrl.searchParams.set("ids", coinGeckoIds.join(","));
coinGeckoUrl.searchParams.set("vs_currencies", "usd");
coinGeckoUrl.searchParams.set("include_last_updated_at", "true");

const [nearResult, coinGeckoResult] = await Promise.allSettled([
  fetchJson("https://1click.chaindefuser.com/v0/tokens"),
  fetchJson(coinGeckoUrl),
]);
const nearById = new Map(
  (nearResult.status === "fulfilled" ? nearResult.value : []).map((item) => [
    item.assetId,
    item,
  ]),
);
const coinGecko =
  coinGeckoResult.status === "fulfilled" ? coinGeckoResult.value : {};

const results = await mapLimited(tokens, 4, async (token) => {
  const near = nearById.get(token.assetId);
  let lifi;
  let lifiError;
  if (token.chainId) {
    const url = new URL("https://li.quest/v1/token");
    url.searchParams.set("chain", String(token.chainId));
    url.searchParams.set("token", token.contractAddress);
    try {
      const result = await fetchJson(url);
      if (
        result.chainId !== token.chainId ||
        result.address?.toLowerCase() !== token.contractAddress.toLowerCase()
      ) {
        throw new Error("wrong token returned");
      }
      lifi = validPrice(result.priceUSD);
    } catch (error) {
      lifiError = error instanceof Error ? error.message : "request failed";
    }
  } else {
    lifiError = "unknown chain";
  }
  const nearPrice = validPrice(near?.price);
  const coinGeckoPrice = validPrice(coinGecko[token.coingeckoId]?.usd);
  const ageMinutes = near?.priceUpdatedAt
    ? Math.round((Date.now() - Date.parse(near.priceUpdatedAt)) / 60_000)
    : undefined;
  const otherPrices = [lifi, coinGeckoPrice].filter((value) => value !== undefined);
  const largestDifference =
    nearPrice && otherPrices.length
      ? Math.max(
          ...otherPrices.map((price) => (Math.abs(price - nearPrice) / nearPrice) * 100),
        )
      : undefined;
  return {
    token,
    nearPrice,
    ageMinutes,
    lifi,
    lifiError,
    coinGeckoPrice,
    largestDifference,
  };
});

const counts = {
  near: results.filter((item) => item.nearPrice !== undefined).length,
  nearFresh: results.filter(
    (item) => item.nearPrice !== undefined && item.ageMinutes >= 0 && item.ageMinutes <= 10,
  ).length,
  lifi: results.filter((item) => item.lifi !== undefined).length,
  coinGecko: results.filter((item) => item.coinGeckoPrice !== undefined).length,
};

console.log(`# Token price source audit - ${new Date().toISOString()}`);
console.log();
console.log(
  `${results.length} listed tokens; NEAR ${counts.near} (${counts.nearFresh} updated within 10 min), LI.FI ${counts.lifi}, CoinGecko ${counts.coinGecko}.`,
);
if (nearResult.status === "rejected") {
  console.log(`NEAR request failed: ${nearResult.reason}`);
}
if (coinGeckoResult.status === "rejected") {
  console.log(`CoinGecko request failed: ${coinGeckoResult.reason}`);
}
console.log();
console.log("| Chain | Token | NEAR USD (age min) | LI.FI USD | CoinGecko USD | Max difference vs NEAR | Note |");
console.log("| --- | --- | ---: | ---: | ---: | ---: | --- |");
for (const item of results) {
  const {
    token,
    nearPrice,
    ageMinutes,
    lifi,
    lifiError,
    coinGeckoPrice,
    largestDifference,
  } = item;
  const notes = [
    ageMinutes !== undefined && (ageMinutes < 0 || ageMinutes > 10)
      ? "stale NEAR"
      : undefined,
    largestDifference !== undefined && largestDifference > 2
      ? "price divergence >2%"
      : undefined,
    lifiError ? `LI.FI ${lifiError}` : undefined,
  ].filter(Boolean);
  console.log(
    `| ${token.chainId ?? token.blockchain} | ${token.symbol} | ${display(nearPrice)} (${ageMinutes ?? "-"}) | ${display(lifi)} | ${display(coinGeckoPrice)} | ${largestDifference === undefined ? "-" : `${largestDifference.toFixed(2)}%`} | ${notes.join(", ")} |`,
  );
}
