import type { Address, Hex } from "viem";
import type { RouteCall } from "../../routes/types.ts";

export type WalletRpcProvider = {
  request(args: {
    method: string;
    params?: readonly unknown[];
  }): Promise<unknown>;
};

export type SourceGasFeeTransfer = {
  amount: bigint;
  recipient: Address;
  token: Address;
};

export type WalletCallsRequest = {
  method: "wallet_sendCalls";
  params: readonly [
    {
      atomicRequired: true;
      calls: readonly RouteCall[];
      chainId: Hex;
      from: Address;
      version: "2.0.0";
      capabilities?: {
        paymasterService: { url: string };
      };
    },
  ];
};

export type SponsoredWalletCallsRequest = {
  method: "wallet_sendCalls";
  params: readonly [
    WalletCallsRequest["params"][0] & {
      capabilities: { paymasterService: { url: string } };
    },
  ];
};
