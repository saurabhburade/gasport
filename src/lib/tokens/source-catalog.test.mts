import assert from "node:assert/strict";
import test from "node:test";
import {
  chainIdByBlockchain,
  enrichIntentsCatalog,
  sourceTokensFromCatalog,
  tokenKey,
} from "./source-catalog.ts";

test("maps every documented NEAR Intents EVM network alias", () => {
  assert.deepEqual(chainIdByBlockchain, {
    eth: 1,
    arb: 42161,
    adi: 36900,
    aurora: 1313161554,
    base: 8453,
    bera: 80094,
    bsc: 56,
    gnosis: 100,
    op: 10,
    plasma: 9745,
    pol: 137,
    avax: 43114,
    monad: 143,
    xlayer: 196,
    scroll: 534352,
  });
});

test("maps supported NEAR catalog networks to EVM source tokens", () => {
  const tokens = sourceTokensFromCatalog([
    {
      assetId:
        "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
      blockchain: "base",
      contractAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      decimals: 6,
      symbol: "USDC",
    },
    {
      assetId: "unsupported",
      blockchain: "sol",
      contractAddress: "not-an-evm-address",
      decimals: 6,
      symbol: "USDC",
    },
  ]);

  assert.equal(tokens.length, 1);
  const firstToken = tokens[0];
  assert.ok(firstToken);
  assert.equal(firstToken.chainId, 8453);
  assert.equal(firstToken.name, "USD Coin");
  assert.equal(
    tokenKey(firstToken),
    "8453:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  );
});

test("deduplicates contracts by chain and address", () => {
  const token = {
    assetId: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near",
    blockchain: "arb",
    contractAddress: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    decimals: 6,
    symbol: "USDC",
  };

  assert.equal(sourceTokensFromCatalog([token, token]).length, 1);
});

test("enriches only exact chain and address matches from a token list", () => {
  const catalog = [
    {
      assetId:
        "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
      blockchain: "base",
      contractAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      decimals: 6,
      symbol: "USDC",
    },
  ];
  const enriched = enrichIntentsCatalog(catalog, [
    {
      chainId: 1,
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      name: "Wrong chain",
    },
    {
      chainId: 8453,
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      name: "USD Coin",
      logoURI: "https://example.com/usdc.png",
    },
  ]);

  assert.equal(enriched[0]?.name, "USD Coin");
  assert.equal(enriched[0]?.logoURI, "https://example.com/usdc.png");
  assert.equal(sourceTokensFromCatalog(enriched)[0]?.name, "USD Coin");
});
