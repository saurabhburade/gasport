import type { GasFlowState } from "../../types/gas";

export function getExecutionRetryAction(
  walletReady: boolean,
  hasResumableCheckpoint = true,
) {
  if (!walletReady) return "connect-wallet" as const;
  return hasResumableCheckpoint
    ? ("retry" as const)
    : ("refresh-quote" as const);
}

export function resolveConfirmationFlowState({
  flowState,
  executionFlowState,
  isExecuting,
}: {
  flowState: GasFlowState;
  executionFlowState: GasFlowState;
  isExecuting: boolean;
}): GasFlowState {
  if (executionFlowState !== "idle") return executionFlowState;
  return isExecuting ? "submitting" : flowState;
}

export function isConfirmationDialogOpen(
  flowState: GasFlowState,
  isDismissed: boolean,
) {
  const needsAttention =
    flowState === "confirming" ||
    flowState === "failed" ||
    flowState === "switching_network" ||
    flowState === "wallet_signature" ||
    flowState === "submitting" ||
    flowState === "deposit_pending" ||
    flowState === "solver_executing" ||
    flowState === "completed";

  return needsAttention && !isDismissed;
}

export function shouldFetchQuotes(flowState: GasFlowState) {
  return !isConfirmationDialogOpen(flowState, false);
}

export function shouldResetExecutionOnDialogClose(flowState: GasFlowState) {
  return (
    flowState === "confirming" ||
    flowState === "failed" ||
    flowState === "completed"
  );
}

export function shouldResetExecutionOnDraftChange(flowState: GasFlowState) {
  return flowState === "failed";
}
