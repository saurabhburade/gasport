import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyNearExecutionStatus,
  encodeNearDepositTransfer,
  parseNearTransactionHash,
  validateNearExecutionInput,
} from "./near-execution.ts";

const token = "0x1111111111111111111111111111111111111111" as const;
const depositAddress = "0x2222222222222222222222222222222222222222" as const;

test("encodes the exact ERC-20 transfer to the 1Click deposit address", () => {
  assert.equal(
    encodeNearDepositTransfer({
      amount: 1_000_000n,
      chainId: 8453,
      depositAddress,
      token,
    }),
    `0xa9059cbb${depositAddress.slice(2).padStart(64, "0")}${1_000_000n
      .toString(16)
      .padStart(64, "0")}`,
  );
});

test("rejects unsafe deposit inputs", () => {
  assert.throws(
    () =>
      validateNearExecutionInput({
        amount: 0n,
        chainId: 8453,
        depositAddress,
        token,
      }),
    /amount/i,
  );
  assert.throws(
    () =>
      validateNearExecutionInput({
        amount: 1n,
        chainId: 8453,
        depositAddress: "0x1234" as typeof depositAddress,
        token,
      }),
    /deposit address/i,
  );
});

test("accepts only a full EVM transaction hash", () => {
  const hash = `0x${"ab".repeat(32)}`;
  assert.equal(parseNearTransactionHash(hash), hash);
  assert.throws(() => parseNearTransactionHash("0x1234"), /transaction hash/i);
});

test("classifies terminal NEAR Intents statuses", () => {
  assert.deepEqual(classifyNearExecutionStatus("SUCCESS"), {
    kind: "settled",
  });
  assert.equal(classifyNearExecutionStatus("PROCESSING").kind, "pending");
  assert.equal(classifyNearExecutionStatus("REFUNDED").kind, "failed");
  assert.equal(
    classifyNearExecutionStatus("INCOMPLETE_DEPOSIT").kind,
    "failed",
  );
});
