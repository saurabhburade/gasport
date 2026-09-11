import assert from "node:assert/strict";
import test from "node:test";
import { ensureActiveWalletOnExecutionChain } from "./execution-chain.ts";

test("keeps the active network when it already matches the source", async () => {
  let switchCount = 0;

  await ensureActiveWalletOnExecutionChain({
    activeChainId: 8453,
    executionChainId: 8453,
    switchChain: async () => {
      switchCount += 1;
      return { id: 8453 };
    },
  });

  assert.equal(switchCount, 0);
});

test("switches to the source network before execution", async () => {
  const requestedChainIds: number[] = [];

  await ensureActiveWalletOnExecutionChain({
    activeChainId: 1,
    executionChainId: 8453,
    switchChain: async ({ chainId }) => {
      requestedChainIds.push(chainId);
      return { id: chainId };
    },
  });

  assert.deepEqual(requestedChainIds, [8453]);
});

test("rejects a wallet that resolves to a different network", async () => {
  await assert.rejects(
    ensureActiveWalletOnExecutionChain({
      activeChainId: 1,
      executionChainId: 8453,
      switchChain: async () => ({ id: 10 }),
    }),
    /did not switch to the source network/i,
  );
});
