import assert from "node:assert/strict";
import test from "node:test";
import { getQuoteFeeBreakdown } from "./quote-fees.ts";

test("shows the user-facing app fee once and keeps revenue sharing internal", () => {
  assert.deepEqual(
    getQuoteFeeBreakdown({
      amountInUsd: "10.00",
      amountInFormatted: "10",
      amountOutUsd: "9.87",
      appFees: [{ fee: 100 }],
      hasNearIntentsApiKey: false,
      returnedAppFees: [{ fee: 100 }, { fee: 10 }],
    }),
    {
      nearProtocolFeeRate: "0.0001%",
      nearProtocolFeeToken: 0.00001,
      nearProtocolFeeUsd: 0.00001,
      oneClickFeeRate: "0.10%",
      oneClickFeeToken: 0.01,
      oneClickFeeUsd: 0.01,
      platformFeeRate: "1.00%",
      platformFeeToken: 0.1,
      platformFeeUsd: 0.1,
      routeCostUsd: 0.01999,
      totalFeeUsd: 0.13,
    },
  );
});

test("removes the 1Click API fee when authenticated", () => {
  assert.deepEqual(
    getQuoteFeeBreakdown({
      amountInUsd: "10.00",
      amountInFormatted: "10",
      amountOutUsd: "9.90",
      appFees: [{ fee: 100 }],
      hasNearIntentsApiKey: true,
      returnedAppFees: [{ fee: 100 }],
    }),
    {
      nearProtocolFeeRate: "0.0001%",
      nearProtocolFeeToken: 0.00001,
      nearProtocolFeeUsd: 0.00001,
      oneClickFeeRate: "0%",
      oneClickFeeToken: 0,
      oneClickFeeUsd: 0,
      platformFeeRate: "1.00%",
      platformFeeToken: 0.1,
      platformFeeUsd: 0.1,
      routeCostUsd: 0,
      totalFeeUsd: 0.1,
    },
  );
});

test("never displays negative fees when the quote has price improvement", () => {
  assert.deepEqual(
    getQuoteFeeBreakdown({
      amountInUsd: "10",
      amountInFormatted: "10",
      amountOutUsd: "10.02",
      appFees: [],
      hasNearIntentsApiKey: true,
      returnedAppFees: [],
    }),
    {
      nearProtocolFeeRate: "0.0001%",
      nearProtocolFeeToken: 0.00001,
      nearProtocolFeeUsd: 0.00001,
      oneClickFeeRate: "0%",
      oneClickFeeToken: 0,
      oneClickFeeUsd: 0,
      platformFeeRate: "0%",
      platformFeeToken: 0,
      platformFeeUsd: 0,
      routeCostUsd: 0,
      totalFeeUsd: 0,
    },
  );
});

test("attributes provider-injected app fees to 1Click", () => {
  const result = getQuoteFeeBreakdown({
    amountInUsd: "4",
    amountInFormatted: "4",
    amountOutUsd: "3.95",
    appFees: [{ fee: 100 }],
    hasNearIntentsApiKey: false,
    returnedAppFees: [{ fee: 100 }, { fee: 10 }],
  });

  assert.equal(result.platformFeeRate, "1.00%");
  assert.equal(result.platformFeeToken, 0.04);
  assert.equal(result.oneClickFeeRate, "0.10%");
  assert.equal(result.oneClickFeeToken, 0.004);
});
