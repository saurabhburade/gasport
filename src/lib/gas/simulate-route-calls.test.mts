import assert from "node:assert/strict";
import test from "node:test";
import { encodeErrorResult } from "viem";
import {
  RouteSimulationError,
  simulateRouteCalls,
} from "./simulate-route-calls.ts";
import type { WalletCallsRequest } from "./wallet-calls/types.ts";

const account = "0x1111111111111111111111111111111111111111";
const calls = [
  {
    to: "0x2222222222222222222222222222222222222222",
    data: "0xa9059cbb" as const,
    value: "0x0" as const,
  },
  {
    to: "0x2222222222222222222222222222222222222222",
    data: "0x095ea7b3" as const,
    value: "0x0" as const,
  },
  {
    to: "0x3333333333333333333333333333333333333333",
    data: "0x1794958f" as const,
    value: "0x0" as const,
  },
] as const;
const request: WalletCallsRequest = {
  method: "wallet_sendCalls",
  params: [
    {
      version: "2.0.0",
      from: account,
      chainId: "0x2105",
      atomicRequired: true,
      calls,
    },
  ],
};

test("simulates the complete Base batch from the connected account", async () => {
  const result = await simulateRouteCalls(request, async (url, init) => {
    assert.equal(url, "https://mainnet-preconf.base.org");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.method, "eth_simulateV1");
    assert.equal(body.params[0].validation, false);
    assert.equal(body.params[1], "pending");
    assert.deepEqual(
      body.params[0].blockStateCalls[0].calls,
      calls.map((call) => ({ ...call, from: account })),
    );
    return Response.json({
      result: [{ calls: calls.map(() => ({ status: "0x1" })) }],
    });
  });
  assert.equal(result, "passed");
});

test("blocks the same insufficient-output failure before the wallet opens", async () => {
  const revertReason = encodeErrorResult({
    abi: [{ type: "error", name: "Error", inputs: [{ type: "string" }] }],
    errorName: "Error",
    args: ["Insufficient output"],
  });
  await assert.rejects(
    simulateRouteCalls(request, async () =>
      Response.json({
        result: [
          {
            calls: [
              { status: "0x1" },
              { status: "0x1" },
              {
                status: "0x0",
                error: { data: revertReason },
              },
            ],
          },
        ],
      }),
    ),
    (error: unknown) =>
      error instanceof RouteSimulationError &&
      error.refreshQuote &&
      error.message.includes("minimum output"),
  );
});

test("does not submit when the simulation service returns incomplete results", async () => {
  await assert.rejects(
    simulateRouteCalls(request, async () =>
      Response.json({ result: [{ calls: [{ status: "0x1" }] }] }),
    ),
    (error: unknown) =>
      error instanceof RouteSimulationError && !error.refreshQuote,
  );
});

test("leaves unsupported chains to the existing wallet flow", async () => {
  const unsupported = {
    ...request,
    params: [{ ...request.params[0], chainId: "0xa86a" as const }] as const,
  } satisfies WalletCallsRequest;
  assert.equal(
    await simulateRouteCalls(unsupported, async () => {
      throw new Error("An unsupported chain should not call the RPC.");
    }),
    "unsupported",
  );
});
