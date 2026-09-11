import assert from "node:assert/strict";
import test from "node:test";
import {
  hasInsufficientBalance,
  normalizeAmountInput,
} from "./amount-input.ts";

test("removes letters and other non-numeric characters from an amount", () => {
  assert.equal(normalizeAmountInput("1fejwnfndsf", 6), "1");
  assert.equal(normalizeAmountInput("$1,234.50", 6), "1234.50");
});

test("keeps one decimal point and the token's supported precision", () => {
  assert.equal(normalizeAmountInput("1.2.3", 6), "1.23");
  assert.equal(normalizeAmountInput("1.1234567", 6), "1.123456");
});

test("reports insufficient balance without blocking disconnected quotes", () => {
  assert.equal(
    hasInsufficientBalance({
      connected: true,
      requiredAmount: 5_000_000n,
      walletBalance: 0n,
    }),
    true,
  );
  assert.equal(
    hasInsufficientBalance({
      connected: false,
      requiredAmount: 5_000_000n,
      walletBalance: 0n,
    }),
    false,
  );
});
