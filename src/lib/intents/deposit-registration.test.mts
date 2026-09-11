import assert from "node:assert/strict";
import test from "node:test";
import {
  getLocalDepositCompletion,
  getNearIntentsExplorerSearchUrl,
  isSourceTransactionConfirmed,
} from "./deposit-registration.ts";

const txHash =
  "0x84ab4a4386490bb349f81cff8b99f79b347eedd083e44843564b5e19dc471f2f";

test("completes with the confirmed source transaction when no NEAR key exists", () => {
  const result = getLocalDepositCompletion({ apiKey: undefined, txHash });

  assert.deepEqual(result, {
    status: "SOURCE_TRANSACTION_CONFIRMED",
    txHash,
  });
  assert.equal(isSourceTransactionConfirmed(result), true);
});

test("continues NEAR registration when an API key is configured", () => {
  assert.equal(
    getLocalDepositCompletion({ apiKey: "configured", txHash }),
    null,
  );
  assert.equal(isSourceTransactionConfirmed({ status: "PROCESSING" }), false);
});

test("builds a public NEAR Intents explorer search URL from the source hash", () => {
  assert.equal(
    getNearIntentsExplorerSearchUrl(txHash),
    `https://explorer.near-intents.org/?search=${txHash}`,
  );
});
