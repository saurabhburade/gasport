import assert from "node:assert/strict";
import test from "node:test";
import type { PreparedRoute } from "../routes/types";
import {
  assertSponsorshipPreflight,
  createSponsoredDepositRequest,
  createSponsoredTransferRequest,
  createWalletCallsRequest,
  getPaymasterProxyUrl,
  getSponsorshipPreflightHeaders,
  getSponsorshipPreflightUrl,
  getWalletCallId,
  getWalletTransactionHash,
  parseWalletCallsStatus,
  WalletCallsTerminalError,
} from "./wallet-calls.ts";

const account = "0x1111111111111111111111111111111111111111";
const token = "0x2222222222222222222222222222222222222222";
const recipient = "0x3333333333333333333333333333333333333333";

const preparedRoute = {
  calls: [
    {
      data: "0x1234",
      to: recipient,
      value: "0x0",
    },
  ],
  provider: "lifi",
  quote: {
    amountIn: "1",
    amountInFormatted: "1",
    amountOut: "1",
    amountOutFormatted: "1",
    expiresAt: "2099-01-01T00:00:00.000Z",
    fees: [],
    minAmountOut: "1",
    provider: "lifi",
    providerQuoteId: "quote",
  },
  settlement: {
    destinationChainId: 10,
    kind: "lifi",
    tool: "stargate",
  },
  sourceChainId: 8453,
} satisfies PreparedRoute;

test("builds an atomic route batch and prepends an optional source fee", () => {
  const request = createWalletCallsRequest({
    account,
    preparedRoute,
    sourceGasFee: { amount: 7n, recipient: account, token },
  });

  assert.equal(request.method, "wallet_sendCalls");
  assert.equal(request.params[0].atomicRequired, true);
  assert.equal(request.params[0].capabilities, undefined);
  assert.equal(request.params[0].calls.length, 2);
  assert.equal(request.params[0].calls[0].to, token);
  assert.equal(request.params[0].calls[1], preparedRoute.calls[0]);
});

test("adds paymasterService only for explicitly sponsored route batches", () => {
  const request = createWalletCallsRequest({
    account,
    preparedRoute,
    paymasterUrl: "https://gas.example.com/api/gas/sponsored",
    sponsorshipRequired: true,
  });

  assert.deepEqual(request.params[0].capabilities, {
    paymasterService: {
      url: "https://gas.example.com/api/gas/sponsored",
    },
  });
  assert.equal(
    getWalletTransactionHash({
      transactionHash: `0x${"cd".repeat(32)}`,
    }),
    `0x${"cd".repeat(32)}`,
  );
});

test("uses the connected account for a wallet-native sponsored Ethereum call", () => {
  const request = createSponsoredTransferRequest({
    account,
    token,
    recipient,
    amount: 25_000_000n,
    chainId: 1,
    paymasterUrl: "https://gas.example.com/api/gas/sponsored",
  });

  assert.equal(request.method, "wallet_sendCalls");
  assert.equal(request.params[0].from, account);
  assert.equal(request.params[0].chainId, "0x1");
  assert.equal(request.params[0].atomicRequired, true);
  assert.equal(
    request.params[0].capabilities.paymasterService.url,
    "https://gas.example.com/api/gas/sponsored",
  );
  assert.equal(request.params[0].calls[0].to, token);
  assert.match(request.params[0].calls[0].data, /^0xa9059cbb/);
});

test("accepts Coinbase and EIP-5792 wallet call identifiers", () => {
  assert.equal(getWalletCallId("call-id"), "call-id");
  assert.equal(getWalletCallId({ id: "id-value" }), "id-value");
  assert.equal(getWalletCallId({ batchId: "batch-value" }), "batch-value");
  assert.equal(getWalletCallId({ status: "pending" }), undefined);
});

test("creates a sponsored Base transfer for the connected account", () => {
  const request = createSponsoredTransferRequest({
    account,
    token,
    recipient,
    amount: 1n,
    chainId: 8453,
    paymasterUrl: "https://gas.example.com/api/gas/sponsored",
  });

  assert.equal(request.params[0].from, account);
  assert.equal(request.params[0].chainId, "0x2105");
});

test("creates a sponsored Monad transfer for the connected account", () => {
  const request = createSponsoredTransferRequest({
    account,
    token,
    recipient,
    amount: 1n,
    chainId: 143,
    paymasterUrl: "https://gas.example.com/api/gas/sponsored",
  });

  assert.equal(request.params[0].from, account);
  assert.equal(request.params[0].chainId, "0x8f");
});

test("batches gas recovery before the exact 1Click deposit transfer", () => {
  const request = createSponsoredDepositRequest({
    account,
    token,
    depositAddress: recipient,
    depositAmount: 9_995_625n,
    feeRecipient: account,
    feeAmount: 4_375n,
    chainId: 8453,
    paymasterUrl: "https://gas.example.com/api/gas/sponsored",
  });

  assert.equal(request.method, "wallet_sendCalls");
  assert.equal(request.params[0].atomicRequired, true);
  assert.equal(request.params[0].calls.length, 2);
  assert.equal(request.params[0].calls[0].to, token);
  assert.equal(request.params[0].calls[1].to, token);
  assert.match(
    request.params[0].calls[0].data,
    /0000000000000000000000000000000000000000000000000000000000001117$/,
  );
  assert.match(
    request.params[0].calls[1].data,
    /0000000000000000000000000000000000000000000000000000000000988569$/,
  );
});

test("extracts the transaction hash from a confirmed wallet call batch", () => {
  const transactionHash = `0x${"ab".repeat(32)}`;
  assert.deepEqual(
    parseWalletCallsStatus({
      status: 200,
      receipts: [{ status: "0x1", transactionHash }],
    }),
    { status: "success", transactionHash },
  );
  assert.deepEqual(parseWalletCallsStatus({ status: 100 }), {
    status: "pending",
  });
  assert.throws(
    () => parseWalletCallsStatus({ status: 500 }),
    /transaction failed/i,
  );
});

test("does not describe a failed self-funded wallet batch as sponsored", () => {
  assert.throws(
    () =>
      parseWalletCallsStatus({ status: 500 }, { sponsorshipRequired: false }),
    (error: unknown) =>
      error instanceof Error &&
      error.message === "The source transaction failed.",
  );
});

test("decodes LI.FI cumulative slippage from a failed wallet batch", () => {
  assert.throws(
    () =>
      parseWalletCallsStatus({
        status: 500,
        receipts: [
          {
            status: "0x1",
            transactionHash: `0x${"14".repeat(32)}`,
            logs: [
              {
                topics: [
                  "0x1c4fada7374c0a9ee8841fc38afe82932dc0f8e69012e927f061a8bae611a201",
                ],
                data: "0x000000000000000000000000000000000000000000000000000000000000000700000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000044275c273c000000000000000000000000000000000000000000000000000cc7de1a848264000000000000000000000000000000000000000000000000000cc0f8e95bd7ca00000000000000000000000000000000000000000000000000000000",
              },
            ],
          },
        ],
      }),
    (error: unknown) =>
      error instanceof WalletCallsTerminalError &&
      error.transactionHash === `0x${"14".repeat(32)}` &&
      error.message ===
        "Price moved beyond the minimum received amount. Refresh the quote and try again.",
  );
});

test("rejects a source chain without an Alchemy sponsorship adapter", () => {
  assert.throws(
    () =>
      createSponsoredTransferRequest({
        account,
        token,
        recipient,
        amount: 1n,
        chainId: 137,
        paymasterUrl: "https://gas.example.com/api/gas/sponsored",
      }),
    /not supported for sponsored deposits/i,
  );
});

test("rejects the localhost HTTP URL that Coinbase Base Account refuses", () => {
  assert.throws(
    () =>
      createSponsoredTransferRequest({
        account,
        token,
        recipient,
        amount: 1n,
        chainId: 1,
        paymasterUrl: "http://localhost:3000/api/gas/sponsored",
      }),
    /requires an HTTPS paymaster URL/i,
  );
});

test("uses the hosted app's HTTPS paymaster route without a tunnel", () => {
  assert.equal(
    getPaymasterProxyUrl({
      origin: "https://gas.example.com",
      configuredUrl: "https://temporary-tunnel.example.com/api/gas/sponsored",
    }),
    "https://gas.example.com/api/gas/sponsored",
  );
});

test("uses the configured HTTPS tunnel for local HTTP and HTTPS development", () => {
  assert.equal(
    getPaymasterProxyUrl({
      origin: "http://localhost:3000",
      configuredUrl: "https://tunnel.example.com/api/gas/sponsored",
    }),
    "https://tunnel.example.com/api/gas/sponsored",
  );
  assert.equal(
    getPaymasterProxyUrl({
      origin: "https://localhost:3000",
      configuredUrl: "https://tunnel.example.com/api/gas/sponsored",
    }),
    "https://tunnel.example.com/api/gas/sponsored",
  );
});

test("rejects local HTTPS as a wallet paymaster URL", () => {
  assert.throws(
    () =>
      getPaymasterProxyUrl({
        origin: "https://localhost:3000",
      }),
    /publicly reachable HTTPS paymaster URL/i,
  );
  assert.throws(
    () =>
      createSponsoredTransferRequest({
        account,
        token,
        recipient,
        amount: 1n,
        chainId: 1,
        paymasterUrl: "https://localhost:3000/api/gas/sponsored",
      }),
    /publicly reachable HTTPS paymaster URL/i,
  );
});

test("bypasses the ngrok browser warning for a local sponsorship preflight", () => {
  assert.deepEqual(
    getSponsorshipPreflightHeaders({
      origin: "http://localhost:3000",
      paymasterUrl: "https://temporary-tunnel.ngrok-free.dev/api/gas/sponsored",
    }),
    { "ngrok-skip-browser-warning": "1" },
  );
  assert.deepEqual(
    getSponsorshipPreflightHeaders({
      origin: "https://localhost:3000",
      paymasterUrl: "https://temporary-tunnel.ngrok-free.dev/api/gas/sponsored",
    }),
    { "ngrok-skip-browser-warning": "1" },
  );
  assert.deepEqual(
    getSponsorshipPreflightHeaders({
      origin: "https://gas.example.com",
      paymasterUrl: "https://gas.example.com/api/gas/sponsored",
    }),
    {},
  );
});

test("preflights the exact paymaster URL that is passed to the wallet", () => {
  assert.equal(
    getSponsorshipPreflightUrl(
      "https://tunnel.example.com/api/gas/sponsored?probe=1",
      10,
    ),
    "https://tunnel.example.com/api/gas/sponsored?probe=1&chainId=10",
  );
});

test("rejects a stale sponsored execution when the server policy is unavailable", () => {
  assert.doesNotThrow(() =>
    assertSponsorshipPreflight(true, { available: true }),
  );
  assert.throws(
    () =>
      assertSponsorshipPreflight(false, {
        error:
          "Gas sponsorship is not configured for Optimism. Configure ALCHEMY_POLICY_ID_OPTIMISM.",
      }),
    /ALCHEMY_POLICY_ID_OPTIMISM/,
  );
});
