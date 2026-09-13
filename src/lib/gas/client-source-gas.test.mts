import assert from "node:assert/strict";
import test from "node:test";
import { encodeAbiParameters } from "viem";
import baseChain from "../../config/chains/base.json" with { type: "json" };
import ethereumChain from "../../config/chains/ethereum.json" with {
  type: "json",
};
import ethereumTokens from "../../config/tokens/1.json" with { type: "json" };
import baseTokens from "../../config/tokens/8453.json" with { type: "json" };
import { sourceTokensFromCatalog } from "../tokens/source-catalog.ts";
import { estimateSourceGasInBrowser } from "./client-source-gas.ts";

const account = "0x1111111111111111111111111111111111111111" as const;
const feeRecipient = "0x2222222222222222222222222222222222222222" as const;
const roundParameters = [
  { type: "uint80" },
  { type: "int256" },
  { type: "uint256" },
  { type: "uint256" },
  { type: "uint80" },
] as const;

function roundData(answer: bigint) {
  return encodeAbiParameters(roundParameters, [
    5n,
    answer,
    0n,
    BigInt(Math.floor(Date.now() / 1000)),
    5n,
  ]);
}

test("client quote deducts one stablecoin or exactly $1 of a volatile token", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      method: string;
      params: [{ to: string; data: string }];
    };
    calls.push(body.method);
    if (body.method === "eth_call") {
      const { data, to } = body.params[0];
      const answer =
        to.toLowerCase() === baseChain.chainlinkUsdFeed.address.toLowerCase()
          ? 250_000_000_000n
          : 100_000_000n;
      return Response.json({
        result: data === "0x313ce567" ? "0x08" : roundData(answer),
      });
    }
    return Response.json({
      result:
        body.method === "eth_estimateGas"
          ? "0xfde8"
          : body.method === "eth_gasPrice"
            ? "0x3b9aca00"
            : "0x0",
    });
  };

  try {
    const tokens = sourceTokensFromCatalog(baseTokens);
    const config = {
      feeRecipient,
      sponsoredChainIds: [8453],
      bundlerUrls: {},
    };
    const stable = tokens.find((token) => token.symbol === "USDC");
    const volatile = tokens.find((token) => token.symbol === "WETH");
    assert.ok(stable && volatile);
    const stableEstimate = await estimateSourceGasInBrowser({
      account,
      amount: 5_000_000n,
      chain: baseChain,
      config,
      signal: new AbortController().signal,
      token: stable,
    });
    assert.equal(stableEstimate.sponsorshipRequired, true);
    assert.equal(stableEstimate.feeAmount, "1000000");
    assert.equal(stableEstimate.feeRecipient, feeRecipient);
    assert.equal(calls.filter((method) => method === "eth_call").length, 2);

    calls.length = 0;
    const volatileEstimate = await estimateSourceGasInBrowser({
      account,
      amount: 2_000_000_000_000_000n,
      chain: baseChain,
      config,
      signal: new AbortController().signal,
      token: volatile,
    });
    assert.equal(volatileEstimate.feeAmount, "400000000000000");
    assert.equal(calls.filter((method) => method === "eth_call").length, 2);
    assert.equal(calls.length, 5);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("falls back to a fresh public token price when no feed is mapped", async () => {
  const originalFetch = globalThis.fetch;
  let tokenRequests = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith("/v0/tokens")) {
      tokenRequests++;
      return Response.json([
        {
          assetId: ethereumTokens.find((token) => token.symbol === "WBTC")
            ?.assetId,
          blockchain: "eth",
          decimals: 8,
          price: 80_000,
          priceUpdatedAt: new Date().toISOString(),
          symbol: "WBTC",
        },
      ]);
    }
    const body = JSON.parse(String(init?.body)) as {
      method: string;
      params: [{ data: string }];
    };
    if (body.method === "eth_call") {
      return Response.json({
        result:
          body.params[0].data === "0x313ce567"
            ? "0x08"
            : roundData(250_000_000_000n),
      });
    }
    return Response.json({
      result:
        body.method === "eth_estimateGas"
          ? "0xfde8"
          : body.method === "eth_gasPrice"
            ? "0x3b9aca00"
            : "0x0",
    });
  };
  try {
    const token = sourceTokensFromCatalog(ethereumTokens).find(
      (item) => item.symbol === "WBTC",
    );
    assert.ok(token);
    const estimate = await estimateSourceGasInBrowser({
      account,
      amount: 10_000n,
      chain: ethereumChain,
      config: {
        feeRecipient,
        sponsoredChainIds: [1],
        bundlerUrls: {},
      },
      signal: new AbortController().signal,
      token,
    });
    assert.equal(estimate.feeAmount, "1250");
    assert.equal(tokenRequests, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("does not assume sponsorship when native balance cannot be read", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      method: string;
      params: [{ data: string }];
    };
    if (body.method === "eth_getBalance") {
      return Response.json({ error: { code: -32000 } });
    }
    if (body.method === "eth_call") {
      return Response.json({
        result:
          body.params[0].data === "0x313ce567"
            ? "0x08"
            : roundData(250_000_000_000n),
      });
    }
    return Response.json({ result: "0x3b9aca00" });
  };
  try {
    const token = sourceTokensFromCatalog(baseTokens).find(
      (item) => item.symbol === "USDC",
    );
    assert.ok(token);
    await assert.rejects(
      estimateSourceGasInBrowser({
        account,
        amount: 5_000_000n,
        chain: baseChain,
        config: {
          feeRecipient,
          sponsoredChainIds: [8453],
          bundlerUrls: {},
        },
        signal: new AbortController().signal,
        token,
      }),
      /RPC rejected/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
