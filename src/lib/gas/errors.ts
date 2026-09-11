export type GasExecutionErrorCode =
  | "alchemy_not_configured"
  | "alchemy_chain_not_enabled"
  | "capability_unknown"
  | "eip7702_unsupported"
  | "live_adapter_missing"
  | "live_adapter_invalid_result"
  | "unsupported_execution"
  | "demo_only";

export class GasExecutionError extends Error {
  constructor(
    public readonly code: GasExecutionErrorCode,
    message: string,
    public readonly remediation?: string,
  ) {
    super(message);
    this.name = "GasExecutionError";
  }
}
