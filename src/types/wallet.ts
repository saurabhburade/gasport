import type { Address } from "viem";

export type CapabilityState = boolean | "unknown";

export type AtomicCapabilityState =
  | "supported"
  | "ready"
  | "unsupported"
  | "unknown";

export type WalletChainCapabilities = {
  chainId: number;
  eip7702: CapabilityState;
  eip5792: CapabilityState;
  smartAccount: CapabilityState;
  passkey: CapabilityState;
  paymasterService: CapabilityState;
  atomic: AtomicCapabilityState;
  authorizationSigner: CapabilityState;
  source: "wallet_getCapabilities" | "not_connected" | "unavailable";
  reason?: string;
};

export type WalletCapabilities = {
  eip7702: CapabilityState;
  eip5792: CapabilityState;
  smartAccount: CapabilityState;
  passkey: CapabilityState;
  paymasterService?: CapabilityState;
  atomic?: AtomicCapabilityState;
  authorizationSigner?: CapabilityState;
  address?: Address;
  chainId?: number;
  source?: WalletChainCapabilities["source"];
  reason?: string;
  chains?: Record<number, WalletChainCapabilities>;
};
