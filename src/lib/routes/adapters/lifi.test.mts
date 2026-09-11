import assert from "node:assert/strict";
import test from "node:test";
import type { Address, Hex } from "viem";
import type { RouteQuoteRequest } from "../types.ts";
import { RouteAdapterError } from "../types.ts";
import { LifiRouteAdapter, lifiAdapter } from "./lifi.ts";

const ACCOUNT = "0x1111111111111111111111111111111111111111" as Address;
const RECIPIENT = "0x2222222222222222222222222222222222222222" as Address;
const REFUND = "0x3333333333333333333333333333333333333333" as Address;
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
const OPTIMISM_NATIVE = "0x0000000000000000000000000000000000000000" as Address;
const APPROVAL = "0x4444444444444444444444444444444444444444" as Address;
const ROUTER = "0x5555555555555555555555555555555555555555" as Address;
const FEE_RECIPIENT = "0x6666666666666666666666666666666666666666" as Address;
const SOURCE_HASH = `0x${"a".repeat(64)}` as Hex;
const DESTINATION_HASH = `0x${"b".repeat(64)}` as Hex;

const request: RouteQuoteRequest = {
  account: ACCOUNT,
  amount: "1000000",
  deadline: "2099-01-01T00:00:00.000Z",
  destinationAsset: {
    address: OPTIMISM_NATIVE,
    assetId: "optimism:native",
    chainId: 10,
    decimals: 18,
    symbol: "ETH",
  },
  recipient: RECIPIENT,
  refundAddress: REFUND,
  slippageBps: 50,
  sponsorshipRequired: true,
  sourceAsset: {
    address: BASE_USDC,
    assetId: "base:usdc",
    chainId: 8453,
    decimals: 6,
    symbol: "USDC",
  },
};

function token(
  address: Address,
  symbol: string,
  decimals: number,
  chainId: number,
) {
  return { address, symbol, decimals, chainId };
}

function quoteResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: "quote-123",
    type: "lifi",
    tool: "stargate",
    action: {
      fromChainId: 8453,
      toChainId: 10,
      fromToken: token(BASE_USDC, "USDC", 6, 8453),
      toToken: token(OPTIMISM_NATIVE, "ETH", 18, 10),
      fromAmount: "1000000",
      slippage: 0.005,
      fromAddress: ACCOUNT,
      toAddress: RECIPIENT,
    },
    estimate: {
      fromAmount: "1000000",
      toAmount: "500000000000000",
      toAmountMin: "490000000000000",
      approvalAddress: APPROVAL,
      executionDuration: 120,
      toAmountUSD: "1.20",
      feeCosts: [
        {
          name: "Protocol fee",
          amount: "1000",
          included: true,
          percentage: "0.001",
          token: token(BASE_USDC, "USDC", 6, 8453),
        },
      ],
      fromAmountUSD: "1.00",
      gasCosts: [
        {
          name: "Gas",
          amount: "2000000000000",
          included: false,
          token: token(OPTIMISM_NATIVE, "ETH", 18, 10),
        },
      ],
    },
    transactionRequest: {
      chainId: 8453,
      to: ROUTER,
      data: "0x1234",
      value: "0x0",
    },
    ...overrides,
  };
}

function quoteResponseForAmount(amount: string) {
  const response = quoteResponse();
  return {
    ...response,
    action: { ...response.action, fromAmount: amount },
    estimate: { ...response.estimate, fromAmount: amount },
  };
}

async function withFetch(
  handler: (url: URL, init: RequestInit) => Response | Promise<Response>,
  action: () => Promise<void>,
) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) =>
    handler(new URL(String(input)), init ?? {});
  try {
    await action();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("exports a LI.FI adapter and normalizes an exact-input quote", async () => {
  assert.equal(lifiAdapter.id, "lifi");
  let seenUrl: URL | undefined;
  await withFetch(
    (url, init) => {
      seenUrl = url;
      assert.equal(new Headers(init.headers).get("x-lifi-api-key"), null);
      return new Response(JSON.stringify(quoteResponse()));
    },
    async () => {
      const result = await lifiAdapter.getQuote(request);
      assert.deepEqual(result, {
        amountIn: "1000000",
        amountInFormatted: "1",
        amountInUsd: "1.00",
        amountOut: "500000000000000",
        amountOutFormatted: "0.0005",
        amountOutUsd: "1.20",
        durationSeconds: 120,
        expiresAt: "2099-01-01T00:00:00.000Z",
        fees: [
          {
            amount: "0.001",
            deductedFromInput: true,
            kind: "provider",
            label: "Protocol fee",
            rateBps: 10,
            token: { decimals: 6, symbol: "USDC" },
          },
          {
            amount: "0.000002",
            deductedFromInput: false,
            kind: "source-gas",
            label: "Gas",
            token: { decimals: 18, symbol: "ETH" },
          },
        ],
        minAmountOut: "490000000000000",
        provider: "lifi",
        providerQuoteId: "quote-123",
      });
    },
  );
  assert.ok(seenUrl);
  assert.equal(seenUrl?.pathname, "/v1/quote");
  assert.equal(seenUrl?.searchParams.get("fromChain"), "8453");
  assert.equal(seenUrl?.searchParams.get("toChain"), "10");
  assert.equal(seenUrl?.searchParams.get("fromAmount"), "1000000");
  assert.equal(seenUrl?.searchParams.get("slippage"), "0.005");
});

test("uses the optional server key and prepares an exact ERC-20 approval", async () => {
  const oldKey = process.env.LIFI_API_KEY;
  process.env.LIFI_API_KEY = "test-only-key";
  try {
    await withFetch(
      (_url, init) => {
        assert.equal(
          new Headers(init.headers).get("x-lifi-api-key"),
          "test-only-key",
        );
        return new Response(JSON.stringify(quoteResponse()));
      },
      async () => {
        const prepared = await new LifiRouteAdapter().prepare(request);
        assert.equal(prepared.calls.length, 2);
        assert.equal(prepared.calls[0]?.to, BASE_USDC);
        assert.match(prepared.calls[0]?.data ?? "", /^0x095ea7b3/);
        assert.match(
          prepared.calls[0]?.data ?? "",
          /00000000000000000000000000000000000000000000000000000000000f4240$/,
        );
        assert.equal(prepared.calls[0]?.value, "0x0");
        assert.deepEqual(prepared.calls[1], {
          to: ROUTER,
          data: "0x1234",
          value: "0x0",
        });
        assert.deepEqual(prepared.settlement, {
          kind: "lifi",
          destinationChainId: 10,
          tool: "stargate",
        });
      },
    );
  } finally {
    if (oldKey === undefined) delete process.env.LIFI_API_KEY;
    else process.env.LIFI_API_KEY = oldKey;
  }
});

test("deducts the 1% platform fee before quoting and transfers it atomically", async () => {
  const oldRecipient = process.env.PLATFORM_FEE_RECIPIENT;
  process.env.PLATFORM_FEE_RECIPIENT = FEE_RECIPIENT;
  try {
    await withFetch(
      (url) => {
        assert.equal(url.searchParams.get("fromAmount"), "990000");
        return new Response(JSON.stringify(quoteResponseForAmount("990000")));
      },
      async () => {
        const prepared = await new LifiRouteAdapter().prepare(request);
        assert.equal(prepared.quote.amountIn, "1000000");
        assert.deepEqual(prepared.quote.fees[0], {
          amount: "0.01",
          deductedFromInput: true,
          kind: "platform",
          label: "Platform fee",
          rateBps: 100,
          token: { decimals: 6, symbol: "USDC" },
        });
        assert.equal(prepared.calls.length, 3);
        assert.equal(prepared.calls[0]?.to, BASE_USDC);
        assert.match(prepared.calls[0]?.data ?? "", /^0xa9059cbb/);
        assert.match(
          prepared.calls[0]?.data ?? "",
          /0000000000000000000000006666666666666666666666666666666666666666/,
        );
        assert.match(
          prepared.calls[0]?.data ?? "",
          /0000000000000000000000000000000000000000000000000000000000002710$/,
        );
        assert.match(
          prepared.calls[1]?.data ?? "",
          /00000000000000000000000000000000000000000000000000000000000f1b30$/,
        );
      },
    );
  } finally {
    if (oldRecipient === undefined) delete process.env.PLATFORM_FEE_RECIPIENT;
    else process.env.PLATFORM_FEE_RECIPIENT = oldRecipient;
  }
});

test("deducts the chain's 5% platform fee when source gas is self-funded", async () => {
  const oldRecipient = process.env.PLATFORM_FEE_RECIPIENT;
  process.env.PLATFORM_FEE_RECIPIENT = FEE_RECIPIENT;
  try {
    await withFetch(
      (url) => {
        assert.equal(url.searchParams.get("fromAmount"), "950000");
        return new Response(JSON.stringify(quoteResponseForAmount("950000")));
      },
      async () => {
        const prepared = await new LifiRouteAdapter().prepare({
          ...request,
          sponsorshipRequired: false,
        });
        assert.deepEqual(prepared.quote.fees[0], {
          amount: "0.05",
          deductedFromInput: true,
          kind: "platform",
          label: "Platform fee",
          rateBps: 500,
          token: { decimals: 6, symbol: "USDC" },
        });
        assert.match(
          prepared.calls[0]?.data ?? "",
          /000000000000000000000000000000000000000000000000000000000000c350$/,
        );
      },
    );
  } finally {
    if (oldRecipient === undefined) delete process.env.PLATFORM_FEE_RECIPIENT;
    else process.env.PLATFORM_FEE_RECIPIENT = oldRecipient;
  }
});

test("falls back to the sponsorship recipient when the platform recipient is blank", async () => {
  const oldPlatformRecipient = process.env.PLATFORM_FEE_RECIPIENT;
  const oldSponsorshipRecipient = process.env.SPONSORED_GAS_FEE_RECIPIENT;
  process.env.PLATFORM_FEE_RECIPIENT = "";
  process.env.SPONSORED_GAS_FEE_RECIPIENT = FEE_RECIPIENT;
  try {
    await withFetch(
      (url) => {
        assert.equal(url.searchParams.get("fromAmount"), "990000");
        return new Response(JSON.stringify(quoteResponseForAmount("990000")));
      },
      async () => {
        const result = await new LifiRouteAdapter().getQuote(request);
        assert.equal(result.fees[0]?.kind, "platform");
      },
    );
  } finally {
    if (oldPlatformRecipient === undefined)
      delete process.env.PLATFORM_FEE_RECIPIENT;
    else process.env.PLATFORM_FEE_RECIPIENT = oldPlatformRecipient;
    if (oldSponsorshipRecipient === undefined)
      delete process.env.SPONSORED_GAS_FEE_RECIPIENT;
    else process.env.SPONSORED_GAS_FEE_RECIPIENT = oldSponsorshipRecipient;
  }
});

test("rejects an invalid configured platform recipient", async () => {
  const oldRecipient = process.env.PLATFORM_FEE_RECIPIENT;
  process.env.PLATFORM_FEE_RECIPIENT = "not-an-address";
  try {
    await assert.rejects(
      () => new LifiRouteAdapter().getQuote(request),
      (error: unknown) =>
        error instanceof RouteAdapterError && error.code === "invalid_request",
    );
  } finally {
    if (oldRecipient === undefined) delete process.env.PLATFORM_FEE_RECIPIENT;
    else process.env.PLATFORM_FEE_RECIPIENT = oldRecipient;
  }
});

test("does not add approval for a native exact-input route", async () => {
  const nativeRequest: RouteQuoteRequest = {
    ...request,
    amount: "1000000000000000",
    sourceAsset: {
      address: OPTIMISM_NATIVE,
      assetId: "base:native",
      chainId: 8453,
      decimals: 18,
      symbol: "ETH",
    },
  };
  const response = quoteResponse({
    action: {
      ...quoteResponse().action,
      fromToken: token(OPTIMISM_NATIVE, "ETH", 18, 8453),
      fromAmount: nativeRequest.amount,
    },
    estimate: {
      ...quoteResponse().estimate,
      fromAmount: nativeRequest.amount,
      approvalAddress: OPTIMISM_NATIVE,
    },
    transactionRequest: {
      chainId: 8453,
      to: ROUTER,
      data: "0x1234",
      value: "0x38d7ea4c68000",
    },
  });
  await withFetch(
    () => new Response(JSON.stringify(response)),
    async () => {
      const prepared = await lifiAdapter.prepare(nativeRequest);
      assert.equal(prepared.calls.length, 1);
      assert.deepEqual(prepared.calls[0], {
        to: ROUTER,
        data: "0x1234",
        value: "0x38d7ea4c68000",
      });
    },
  );
});

test("normalizes LI.FI status, including destination transaction details", async () => {
  await withFetch(
    (url) => {
      assert.equal(url.pathname, "/v1/status");
      assert.equal(url.searchParams.get("txHash"), SOURCE_HASH);
      assert.equal(url.searchParams.get("toChain"), "10");
      assert.equal(url.searchParams.get("bridge"), "stargate");
      return new Response(
        JSON.stringify({
          status: "DONE",
          substatus: "COMPLETED",
          receiving: {
            txHash: DESTINATION_HASH,
            txLink: `https://optimistic.etherscan.io/tx/${DESTINATION_HASH}`,
          },
        }),
      );
    },
    async () => {
      assert.deepEqual(
        await lifiAdapter.getStatus(
          { kind: "lifi", destinationChainId: 10, tool: "stargate" },
          SOURCE_HASH,
        ),
        {
          kind: "success",
          destinationTxHash: DESTINATION_HASH,
          explorerUrl: `https://optimistic.etherscan.io/tx/${DESTINATION_HASH}`,
        },
      );
    },
  );
});

test("maps not-found to pending and refunded/failed results to failed without provider text", async () => {
  const responses = [
    { status: "NOT_FOUND" },
    { status: "DONE", substatus: "REFUNDED", error: "secret upstream details" },
    { status: "FAILED", error: "secret upstream details" },
  ];
  await withFetch(
    () => new Response(JSON.stringify(responses.shift())),
    async () => {
      const settlement = {
        kind: "lifi" as const,
        destinationChainId: 10,
        tool: "stargate",
      };
      assert.deepEqual(await lifiAdapter.getStatus(settlement, SOURCE_HASH), {
        kind: "pending",
      });
      const refunded = await lifiAdapter.getStatus(settlement, SOURCE_HASH);
      assert.equal(refunded.kind, "failed");
      assert.ok(!JSON.stringify(refunded).includes("secret upstream details"));
      const failed = await lifiAdapter.getStatus(settlement, SOURCE_HASH);
      assert.equal(failed.kind, "failed");
    },
  );
});

test("treats a not-yet-indexed LI.FI status response as pending", async () => {
  await withFetch(
    () =>
      new Response(JSON.stringify({ message: "Route not found" }), {
        status: 404,
      }),
    async () => {
      assert.deepEqual(
        await lifiAdapter.getStatus(
          { kind: "lifi", destinationChainId: 10, tool: "across" },
          SOURCE_HASH,
        ),
        { kind: "pending" },
      );
    },
  );
});

test("converts malformed provider data and bad requests to RouteAdapterError", async () => {
  await withFetch(
    () => new Response(JSON.stringify({ type: "lifi", id: "bad" })),
    async () => {
      await assert.rejects(
        () => lifiAdapter.getQuote(request),
        (error: unknown) =>
          error instanceof RouteAdapterError &&
          error.provider === "lifi" &&
          error.code === "provider_error",
      );
    },
  );
  await assert.rejects(
    () => lifiAdapter.getQuote({ ...request, amount: "1.5" }),
    (error: unknown) =>
      error instanceof RouteAdapterError &&
      error.provider === "lifi" &&
      error.code === "invalid_request",
  );
});
