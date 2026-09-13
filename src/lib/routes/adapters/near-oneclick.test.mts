import assert from "node:assert/strict";
import test from "node:test";
import type { RouteQuoteRequest } from "../types.ts";
import { matchesConfiguredAppFees } from "./near-oneclick/quote.ts";
import {
  NearOneClickRouteAdapter,
  nearOneClickAdapter,
} from "./near-oneclick.ts";

const address = "0x1111111111111111111111111111111111111111" as const;

const request: RouteQuoteRequest = {
  account: address,
  amount: "1000000",
  deadline: "2026-09-11T12:00:00.000Z",
  destinationAsset: {
    address,
    assetId: "nep141:eth.omft.near",
    chainId: 1,
    decimals: 18,
    symbol: "ETH",
  },
  recipient: address,
  refundAddress: address,
  slippageBps: 100,
  sponsorshipRequired: true,
  sourceAsset: {
    address,
    assetId: "nep141:eth-0x1111.omft.near",
    chainId: 1,
    decimals: 6,
    symbol: "USDC",
  },
};

test("rejects malformed route requests before contacting 1Click", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("fetch should not be called");
  };

  try {
    await assert.rejects(
      nearOneClickAdapter.getQuote({
        account: address,
        amount: "not-an-integer",
        deadline: "2026-09-11T12:00:00.000Z",
        destinationAsset: {
          address,
          assetId: "nep141:eth.omft.near",
          chainId: 1,
          decimals: 18,
          symbol: "ETH",
        },
        recipient: address,
        refundAddress: address,
        slippageBps: 100,
        sponsorshipRequired: true,
        sourceAsset: {
          address,
          assetId: "nep141:eth-0x1111.omft.near",
          chainId: 1,
          decimals: 6,
          symbol: "USDC",
        },
      }),
      (error: unknown) =>
        error instanceof Error &&
        error.name === "RouteAdapterError" &&
        error.message.includes("positive integer"),
    );
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects status checks for another provider settlement", async () => {
  await assert.rejects(
    nearOneClickAdapter.getStatus(
      {
        destinationChainId: 1,
        kind: "lifi",
        tool: "stargate",
      },
      `0x${"11".repeat(32)}`,
    ),
    (error: unknown) =>
      error instanceof Error &&
      error.name === "RouteAdapterError" &&
      error.message.includes("near-1click settlements"),
  );
});

test("sends configured fees and referral directly to public 1Click", async () => {
  const originalFetch = globalThis.fetch;
  let calledUrl = "";
  let calledBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (input, init) => {
    calledUrl = String(input);
    calledBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return {
      ok: false,
      status: 500,
      text: async () => "{}",
    } as Response;
  };

  try {
    await assert.rejects(
      new NearOneClickRouteAdapter({
        apiUrl: "https://public.example",
        feeRecipient: address,
        referralId: "gasport",
      }).getQuote(request),
      /quote service is unavailable/,
    );
    assert.equal(calledUrl, "https://public.example/v0/quote");
    assert.deepEqual(calledBody?.appFees, [{ fee: 100, recipient: address }]);
    assert.equal(calledBody?.referral, "gasport");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sends the 4% self-funded 1Click app fee within the public total fee cap", async () => {
  const originalFetch = globalThis.fetch;
  let calledBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    calledBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return {
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ message: "No route found." }),
    } as Response;
  };

  try {
    await assert.rejects(
      new NearOneClickRouteAdapter({ feeRecipient: address }).getQuote({
        ...request,
        sponsorshipRequired: false,
      }),
      /could not find a route/,
    );
    assert.deepEqual(calledBody?.appFees, [{ fee: 400, recipient: address }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("accepts provider-added app fees without losing configured fee matching", () => {
  const configured = [{ fee: 100, recipient: address }];
  const returned = [...configured, { fee: 25, recipient: "provider.near" }];
  assert.equal(matchesConfiguredAppFees(returned, configured), true);
  assert.equal(
    matchesConfiguredAppFees(
      [{ fee: 25, recipient: "provider.near" }],
      configured,
    ),
    false,
  );
});

test("abort signals stop a browser quote request", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    new NearOneClickRouteAdapter({ feeRecipient: address }).getQuote(
      request,
      controller.signal,
    ),
    (error: unknown) => error instanceof Error && error.name === "AbortError",
  );
});

test("status service failures never report success", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    ({
      ok: false,
      status: 503,
      text: async () => "{}",
    }) as Response;

  try {
    await assert.rejects(
      new NearOneClickRouteAdapter().getStatus(
        {
          depositAddress: address,
          kind: "near-1click",
          quoteId: "quote-id",
        },
        `0x${"11".repeat(32)}`,
      ),
      (error: unknown) =>
        error instanceof Error &&
        error.name === "RouteAdapterError" &&
        error.message.includes("status service is unavailable"),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("malformed status responses are retryable provider errors", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    ({
      ok: true,
      status: 200,
      text: async () => "not-json",
    }) as Response;

  try {
    await assert.rejects(
      new NearOneClickRouteAdapter().getStatus(
        {
          depositAddress: address,
          kind: "near-1click",
          quoteId: "quote-id",
        },
        `0x${"11".repeat(32)}`,
      ),
      (error: unknown) =>
        error instanceof Error && error.name === "RouteAdapterError",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
