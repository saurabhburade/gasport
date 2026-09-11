"use client";

import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import { useGasExecution } from "@/hooks/use-gas-execution";
import type { GasFlowState } from "@/types/gas";
import { progressIndex } from "./constants";

export function useSyncedGasExecution({
  connected,
  setError,
  setState,
  state,
}: {
  connected: boolean;
  setError: Dispatch<SetStateAction<string | null>>;
  setState: Dispatch<SetStateAction<GasFlowState>>;
  state: GasFlowState;
}) {
  const execution = useGasExecution();
  const [isExecutionDialogDismissed, setIsExecutionDialogDismissed] =
    useState(false);
  const [resumeExecutionAfterConnect, setResumeExecutionAfterConnect] =
    useState(false);

  useEffect(() => {
    if (!connected) return;
    if (state === "wallet_required" || state === "idle") setState("quoted");
  }, [connected, setState, state]);

  useEffect(() => {
    if (execution.flowState === "idle") {
      setState((current) =>
        progressIndex[current] !== undefined || current === "failed"
          ? "quoted"
          : current,
      );
      return;
    }
    setState(execution.flowState);
    setIsExecutionDialogDismissed(false);
  }, [execution.flowState, setState]);

  useEffect(() => {
    if (
      !resumeExecutionAfterConnect ||
      !execution.walletReady ||
      !execution.isResumable ||
      execution.isExecuting
    ) {
      return;
    }
    setResumeExecutionAfterConnect(false);
    setError(null);
    setIsExecutionDialogDismissed(false);
    execution.retry();
  }, [
    execution.isExecuting,
    execution.isResumable,
    execution.retry,
    execution.walletReady,
    resumeExecutionAfterConnect,
    setError,
  ]);

  return {
    ...execution,
    isExecutionDialogDismissed,
    setIsExecutionDialogDismissed,
    setResumeExecutionAfterConnect,
  };
}
