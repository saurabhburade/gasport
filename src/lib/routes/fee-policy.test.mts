import assert from "node:assert/strict";
import test from "node:test";
import { CHAIN_LIST } from "../../config/chains.ts";
import {
  PLATFORM_FEE_CONFIG_BY_CHAIN_ID,
  platformFeeBpsFor,
} from "./fee-policy.ts";

test("charges 1% when the app sponsors source gas", () => {
  assert.equal(platformFeeBpsFor(8453, true), 100);
});

test("charges 4% when the wallet pays source gas", () => {
  for (const chain of CHAIN_LIST) {
    assert.equal(platformFeeBpsFor(chain.id, false), 400);
  }
});

test("keeps the fee policy configurable by source chain", () => {
  assert.deepEqual(PLATFORM_FEE_CONFIG_BY_CHAIN_ID[1], {
    selfFundedBps: 400,
    sponsoredBps: 100,
  });
  assert.deepEqual(PLATFORM_FEE_CONFIG_BY_CHAIN_ID[42161], {
    selfFundedBps: 400,
    sponsoredBps: 100,
  });
  assert.deepEqual(
    Object.keys(PLATFORM_FEE_CONFIG_BY_CHAIN_ID)
      .map(Number)
      .sort((first, second) => first - second),
    CHAIN_LIST.map((chain) => chain.id).sort((first, second) => first - second),
  );
});
