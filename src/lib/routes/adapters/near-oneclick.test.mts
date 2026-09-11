import assert from "node:assert/strict";
import test from "node:test";
import { nearOneClickAdapter } from "./near-oneclick.ts";

const address = "0x1111111111111111111111111111111111111111" as const;

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
