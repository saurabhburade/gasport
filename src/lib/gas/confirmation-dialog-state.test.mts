import assert from "node:assert/strict";
import test from "node:test";
import {
  getExecutionRetryAction,
  isConfirmationDialogOpen,
  resolveConfirmationFlowState,
  shouldFetchQuotes,
  shouldResetExecutionOnDialogClose,
  shouldResetExecutionOnDraftChange,
} from "./confirmation-dialog-state.ts";

test("closing a failed transaction resets its checkpoint", () => {
  assert.equal(shouldResetExecutionOnDialogClose("failed"), true);
});

test("an unfinished transaction is visible until the user dismisses it", () => {
  assert.equal(isConfirmationDialogOpen("failed", false), true);
});

test("an authorization prompt remains visible while it is active", () => {
  assert.equal(isConfirmationDialogOpen("wallet_signature", false), true);
});

test("a pending wallet authorization cannot show the confirm action again", () => {
  const activeState = resolveConfirmationFlowState({
    flowState: "confirming",
    executionFlowState: "wallet_signature",
    isExecuting: true,
  });
  assert.equal(activeState, "wallet_signature");
  assert.equal(shouldResetExecutionOnDialogClose(activeState), false);
  assert.equal(shouldFetchQuotes(activeState), false);
  assert.equal(
    resolveConfirmationFlowState({
      flowState: "confirming",
      executionFlowState: "idle",
      isExecuting: true,
    }),
    "submitting",
  );
  assert.equal(
    resolveConfirmationFlowState({
      flowState: "confirming",
      executionFlowState: "wallet_signature",
      isExecuting: false,
    }),
    "wallet_signature",
  );
  assert.equal(
    resolveConfirmationFlowState({
      flowState: "confirming",
      executionFlowState: "idle",
      isExecuting: false,
    }),
    "confirming",
  );
});

test("a completed transaction remains visible in the execution dialog", () => {
  assert.equal(isConfirmationDialogOpen("completed", false), true);
  assert.equal(shouldResetExecutionOnDialogClose("completed"), true);
});

test("editing a new draft resets an old failed transaction", () => {
  assert.equal(shouldResetExecutionOnDraftChange("failed"), true);
  assert.equal(shouldResetExecutionOnDraftChange("deposit_pending"), false);
});

test("a failed execution reconnects before retrying when the wallet client is unavailable", () => {
  assert.equal(getExecutionRetryAction(false), "connect-wallet");
  assert.equal(getExecutionRetryAction(true), "retry");
});

test("a terminal source failure refreshes the quote instead of retrying a dead checkpoint", () => {
  assert.equal(getExecutionRetryAction(true, false), "refresh-quote");
});

test("quote updates stay frozen for the complete modal lifecycle", () => {
  assert.equal(shouldFetchQuotes("quoted"), true);
  assert.equal(shouldFetchQuotes("confirming"), false);
  assert.equal(shouldFetchQuotes("wallet_signature"), false);
  assert.equal(shouldFetchQuotes("solver_executing"), false);
  assert.equal(shouldFetchQuotes("failed"), false);
  assert.equal(shouldFetchQuotes("completed"), false);
});
