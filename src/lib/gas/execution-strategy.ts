import type { Address } from "viem";
import {
  type AlchemySponsorshipConfig,
  isAlchemySponsorshipConfigured,
  isSupportedAlchemyDelegation,
} from "@/lib/gas/alchemy";
import { GasExecutionError } from "@/lib/gas/errors";
import type { WalletCapabilities } from "@/types/wallet";

export type { GasExecutionErrorCode } from "@/lib/gas/errors";
export { GasExecutionError } from "@/lib/gas/errors";

export type GasExecutionMode = "live" | "demo" | "unsupported";

export type GasExecutionInput = {
  token: Address;
  amount: bigint;
  depositAddress: Address;
  chainId: number;
};

export type ExecutionResult = {
  txHash?: `0x${string}`;
  userOperationHash?: `0x${string}`;
  mode: GasExecutionMode;
  status: "submitted" | "simulated";
  /** Sponsorship is never reported as confirmed by this boundary. */
  sponsorship: "unverified" | "not_applicable";
};

export type PreparedExecution = {
  mode: GasExecutionMode;
  kind: "alchemy-eip7702" | "demo" | "unsupported";
  input?: GasExecutionInput;
  chainId?: number;
  policyId?: string;
  delegation?: Address;
  requiresAuthorization: boolean;
  sponsorship: "configured" | "not_applicable" | "unavailable";
};

export type LiveExecutionAdapter = {
  prepare(input: GasExecutionInput): Promise<PreparedExecution>;
  execute(prepared: PreparedExecution): Promise<ExecutionResult>;
};

export interface GasExecutionStrategy {
  readonly mode: GasExecutionMode;
  canExecute(capabilities: WalletCapabilities): Promise<boolean>;
  prepare(input?: GasExecutionInput): Promise<PreparedExecution>;
  execute(prepared?: PreparedExecution): Promise<ExecutionResult>;
}

export class Eip7702ExecutionStrategy implements GasExecutionStrategy {
  readonly mode = "live" as const;

  constructor(
    private readonly config: AlchemySponsorshipConfig,
    private readonly adapter: LiveExecutionAdapter,
  ) {}

  async canExecute(capabilities: WalletCapabilities) {
    return Boolean(
      capabilities.eip7702 === true &&
        capabilities.eip5792 === true &&
        capabilities.paymasterService === true &&
        capabilities.authorizationSigner === true &&
        isAlchemySponsorshipConfigured(this.config, capabilities.chainId),
    );
  }

  async prepare(input?: GasExecutionInput): Promise<PreparedExecution> {
    if (!input) {
      throw new GasExecutionError(
        "unsupported_execution",
        "A source token, amount, deposit address, and chain are required before preparing a live execution.",
      );
    }

    const prepared = await this.adapter.prepare(input);
    if (
      prepared.mode !== "live" ||
      !prepared.delegation ||
      !isSupportedAlchemyDelegation(prepared.delegation)
    ) {
      throw new GasExecutionError(
        "live_adapter_invalid_result",
        "The live execution adapter did not return a live operation using an accepted Alchemy EIP-7702 delegate.",
      );
    }
    return prepared;
  }

  async execute(prepared?: PreparedExecution): Promise<ExecutionResult> {
    if (prepared?.mode !== "live") {
      throw new GasExecutionError(
        "unsupported_execution",
        "A live prepared operation is required before execution.",
      );
    }

    const result = await this.adapter.execute(prepared);
    if (
      result.mode !== "live" ||
      result.status !== "submitted" ||
      (!result.txHash && !result.userOperationHash)
    ) {
      throw new GasExecutionError(
        "live_adapter_invalid_result",
        "The live execution adapter did not return a real submitted transaction or user-operation hash.",
      );
    }
    return { ...result, sponsorship: "unverified" };
  }
}

export class StandardExecutionStrategy implements GasExecutionStrategy {
  readonly mode = "unsupported" as const;

  async canExecute() {
    return false;
  }

  async prepare(): Promise<PreparedExecution> {
    throw new GasExecutionError(
      "unsupported_execution",
      "A standard ERC-20 transfer requires native gas or a verified token-authorization mechanism.",
      "Connect a wallet with verified EIP-7702 sponsorship support or fund the source wallet with native gas.",
    );
  }

  async execute(): Promise<ExecutionResult> {
    throw new GasExecutionError(
      "unsupported_execution",
      "Standard execution is unavailable without source-chain gas.",
    );
  }
}

export class DemoExecutionStrategy implements GasExecutionStrategy {
  readonly mode = "demo" as const;

  async canExecute() {
    return true;
  }

  async prepare(input?: GasExecutionInput): Promise<PreparedExecution> {
    return {
      mode: "demo",
      kind: "demo",
      input,
      chainId: input?.chainId,
      requiresAuthorization: false,
      sponsorship: "not_applicable",
    };
  }

  async execute(prepared?: PreparedExecution): Promise<ExecutionResult> {
    if (prepared?.mode !== "demo") {
      throw new GasExecutionError(
        "demo_only",
        "Demo execution requires a demo prepared operation.",
      );
    }
    return {
      mode: "demo",
      status: "simulated",
      sponsorship: "not_applicable",
    };
  }
}

export type GasExecutionSelection = {
  mode: GasExecutionMode;
  strategy: GasExecutionStrategy;
  reason: string;
};

export function selectGasExecutionStrategy({
  capabilities,
  config,
  adapter,
  requestedMode,
  chainId,
}: {
  capabilities: WalletCapabilities;
  config?: AlchemySponsorshipConfig;
  adapter?: LiveExecutionAdapter;
  requestedMode?: GasExecutionMode;
  chainId?: number;
}): GasExecutionSelection {
  if (requestedMode === "demo") {
    return {
      mode: "demo",
      strategy: new DemoExecutionStrategy(),
      reason:
        "Demo mode was explicitly requested; no transaction will be submitted.",
    };
  }

  const missing: string[] = [];
  if (!config || !isAlchemySponsorshipConfigured(config, chainId)) {
    missing.push("Alchemy API key and active Gas Manager policy");
  }
  if (capabilities.eip5792 !== true)
    missing.push("verified EIP-5792 capability");
  if (capabilities.eip7702 !== true)
    missing.push("verified EIP-7702 capability");
  if (capabilities.paymasterService !== true) {
    missing.push("verified paymaster-service capability");
  }
  if (capabilities.authorizationSigner !== true) {
    missing.push("a signer that exposes signAuthorization");
  }
  if (!adapter) missing.push("a configured live execution adapter");

  if (missing.length === 0 && config && adapter) {
    return {
      mode: "live",
      strategy: new Eip7702ExecutionStrategy(config, adapter),
      reason:
        "All live execution prerequisites are present; sponsorship remains unverified until settlement.",
    };
  }

  return {
    mode: "unsupported",
    strategy: new StandardExecutionStrategy(),
    reason: `Live execution is unavailable: ${missing.join(", ")}.`,
  };
}
