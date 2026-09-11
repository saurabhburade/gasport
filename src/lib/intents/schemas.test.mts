import assert from "node:assert/strict";
import test from "node:test";
import {
  executionResponseSchema,
  mvpQuoteRequestSchema,
  quoteResponseSchema,
  transactionHistoryResponseSchema,
} from "./schemas.ts";

const exactInputRequest = {
  dry: false,
  swapType: "EXACT_INPUT",
  slippageTolerance: 100,
  originAsset:
    "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
  depositType: "ORIGIN_CHAIN",
  destinationAsset: "nep141:arb.omft.near",
  amount: "1000000",
  refundTo: "0xa1b63a6ca51b8ca5bdb10866ac7c0c621d881800",
  refundType: "ORIGIN_CHAIN",
  recipient: "0xa1b63a6ca51b8ca5bdb10866ac7c0c621d881800",
  recipientType: "DESTINATION_CHAIN",
  deadline: "2026-09-10T18:53:00.000Z",
  depositMode: "SIMPLE",
} as const;

test("accepts only an exact-input market quote request for the MVP", () => {
  assert.equal(
    mvpQuoteRequestSchema.safeParse(exactInputRequest).success,
    true,
  );
  assert.equal(
    mvpQuoteRequestSchema.safeParse({
      ...exactInputRequest,
      swapType: "EXACT_OUTPUT",
    }).success,
    false,
  );
});

test("accepts the single executable quote returned by NEAR 1Click", () => {
  const result = quoteResponseSchema.safeParse({
    correlationId: "quote-correlation-id",
    timestamp: "2026-09-10T18:50:00.000Z",
    signature: "signed-quote",
    quoteRequest: exactInputRequest,
    quote: {
      depositAddress: "0xe480a1029dc223dcab7d8c62f2f3addb4b9a3049",
      amountIn: "1000000",
      amountInFormatted: "1",
      amountInUsd: "1",
      minAmountIn: "1000000",
      amountOut: "402000000000000",
      amountOutFormatted: "0.000402",
      amountOutUsd: "0.99",
      minAmountOut: "397980000000000",
      deadline: "2026-09-10T18:53:00.000Z",
      timeEstimate: 36,
    },
  });

  assert.equal(result.success, true, result.error?.message);
  if (result.success) {
    assert.equal(result.data.quote.amountOutFormatted, "0.000402");
    assert.equal(result.data.quoteRequest.swapType, "EXACT_INPUT");
  }
});

test("accepts the status shape returned for a completed EVM deposit", () => {
  const result = executionResponseSchema.safeParse({
    correlationId: "status-correlation-id",
    quoteResponse: {
      timestamp: "2026-09-10T18:50:00.000Z",
      signature: "signed-quote",
      quoteRequest: {
        dry: false,
        swapType: "EXACT_INPUT",
        slippageTolerance: 100,
        originAsset:
          "nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near",
        depositType: "ORIGIN_CHAIN",
        destinationAsset: "nep141:eth.omft.near",
        amount: "5000000",
        refundTo: "0xa1b63a6ca51b8ca5bdb10866ac7c0c621d881800",
        refundType: "ORIGIN_CHAIN",
        recipient: "0xa1b63a6ca51b8ca5bdb10866ac7c0c621d881800",
        recipientType: "DESTINATION_CHAIN",
        deadline: "2026-09-10T18:53:00.000Z",
        depositMode: "SIMPLE",
        virtualChainRecipient: null,
        virtualChainRefundRecipient: null,
        referral: null,
      },
      quote: {
        depositAddress: "0xe480a1029dc223dcab7d8c62f2f3addb4b9a3049",
        amountIn: "5000000",
        amountInFormatted: "5",
        amountInUsd: "5",
        minAmountIn: "5000000",
        amountOut: "2030000000000000",
        amountOutFormatted: "0.00203",
        amountOutUsd: "4.99",
        minAmountOut: "2000000000000000",
        timeEstimate: 52,
      },
    },
    status: "PROCESSING",
    updatedAt: "2026-09-10T18:52:00.000Z",
    swapDetails: {
      intentHashes: [],
      nearTxHashes: [],
      originChainTxHashes: [
        {
          hash: "0x84ab4a4386490bb349f81cff8b99f79b347eedd083e44843564b5e19dc471f2f",
          explorerUrl: "",
        },
      ],
      destinationChainTxHashes: [{ hash: "pending", explorerUrl: "" }],
      slippage: -0.01,
      refundReason: null,
      refundFee: "0",
    },
  });

  assert.equal(result.success, true, result.error?.message);
});

test("accepts transaction history returned by the 1Click explorer API", () => {
  const result = transactionHistoryResponseSchema.safeParse([
    {
      originAsset:
        "nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near",
      destinationAsset: "nep141:eth.omft.near",
      depositAddress: "0xe480a1029dc223dcab7d8c62f2f3addb4b9a3049",
      depositMemo: null,
      recipient: "0xa1b63a6ca51b8ca5bdb10866ac7c0c621d881800",
      status: "SUCCESS",
      createdAt: "2026-09-10T18:50:00.000Z",
      amountInFormatted: "5",
      amountInUsd: "5",
      amountOutFormatted: "0.00203",
      amountOutUsd: "4.99",
      intentHashes: "intent-hash",
      nearTxHashes: ["near-hash"],
      originChainTxHashes: [
        "0x84ab4a4386490bb349f81cff8b99f79b347eedd083e44843564b5e19dc471f2f",
      ],
      destinationChainTxHashes: [
        "0x9bcff372aee89b648c922b850573b22387c31d693079f5e37cd255814e2d615a",
      ],
      senders: ["0xa1b63a6ca51b8ca5bdb10866ac7c0c621d881800"],
    },
  ]);

  assert.equal(result.success, true, result.error?.message);
});
