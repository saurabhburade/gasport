import { type Address, isAddress } from "viem";
import type { WalletRpcProvider } from "./wallet-calls";

export function resolveExecutionWallet({
  address,
  isConnected,
  provider,
}: {
  address?: string;
  isConnected: boolean;
  provider?: WalletRpcProvider;
}) {
  if (!isConnected || !address || !isAddress(address, { strict: false })) {
    throw new Error("Connect the wallet that will fund this route execution.");
  }
  if (!provider) {
    throw new Error(
      "The wallet connection is still loading. Try again shortly.",
    );
  }
  return { account: address as Address, provider };
}
