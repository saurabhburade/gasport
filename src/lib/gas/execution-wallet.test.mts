import assert from "node:assert/strict";
import test from "node:test";
import { resolveExecutionWallet } from "./execution-wallet.ts";

test("uses the Reown account and provider as one authoritative wallet session", () => {
  const provider = { request: async () => undefined };

  assert.deepEqual(
    resolveExecutionWallet({
      address: "0xA1b63a6ca51B8ca5bdb10866aC7C0c621d881800",
      isConnected: true,
      provider,
    }),
    {
      account: "0xA1b63a6ca51B8ca5bdb10866aC7C0c621d881800",
      provider,
    },
  );
});

test("requires both parts of the same Reown wallet session", () => {
  assert.throws(
    () =>
      resolveExecutionWallet({
        address: "0xA1b63a6ca51B8ca5bdb10866aC7C0c621d881800",
        isConnected: true,
        provider: undefined,
      }),
    /wallet connection is still loading/i,
  );
  assert.throws(
    () =>
      resolveExecutionWallet({
        address: undefined,
        isConnected: false,
        provider: { request: async () => undefined },
      }),
    /connect the wallet/i,
  );
});
