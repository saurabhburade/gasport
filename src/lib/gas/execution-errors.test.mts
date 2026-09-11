import assert from "node:assert/strict";
import test from "node:test";
import { BaseError } from "viem";
import {
  executionErrorMessage,
  isUnsupportedWalletMethodError,
} from "./execution-errors.ts";

const unsupportedMethod = new Error(
  "The Provider does not support the requested method. Details: The requested method is not supported by this Ethereum provider.",
);

test("recognizes an unsupported wallet RPC method", () => {
  assert.equal(isUnsupportedWalletMethodError(unsupportedMethod), true);
});

test("explains that wallet-native sponsored calls are required", () => {
  assert.match(executionErrorMessage(unsupportedMethod), /wallet-native/i);
});

test("uses Viem's short message for rejected wallet requests", () => {
  const rejectedRequest = new BaseError("User rejected the request.", {
    details: "User cancelled transaction",
  });

  assert.equal(
    executionErrorMessage(rejectedRequest),
    "User rejected the request.",
  );
});

test("uses shortMessage from a viem error that crossed a provider boundary", () => {
  const wrappedViemError = Object.assign(
    new Error("TransactionExecutionError: User rejected the request."),
    { shortMessage: "User rejected the request." },
  );

  assert.equal(
    executionErrorMessage(wrappedViemError),
    "User rejected the request.",
  );
});

test("prioritizes a viem shortMessage over a wrapped error message", () => {
  const wrappedViemError = Object.assign(new Error("NetworkError"), {
    shortMessage: "User rejected the request.",
  });

  assert.equal(
    executionErrorMessage(wrappedViemError),
    "User rejected the request.",
  );
});

test("uses the message from a plain EIP-1193 rejection", () => {
  assert.equal(
    executionErrorMessage({
      code: 4001,
      message: "User rejected the request.",
    }),
    "User rejected the request.",
  );
});

test("turns a browser fetch failure into an actionable retry message", () => {
  assert.equal(
    executionErrorMessage(new TypeError("Failed to fetch")),
    "Could not reach the wallet or gas sponsorship service. Check your connection and retry.",
  );
});
