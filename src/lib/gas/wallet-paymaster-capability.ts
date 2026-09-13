import { type Address, numberToHex } from "viem";
import type { WalletRpcProvider } from "./wallet-calls/types.ts";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function chainCapabilities(
  response: unknown,
  chainId: number,
): Record<string, unknown> | null {
  const capabilities = asRecord(response);
  if (!capabilities) return null;
  let global: Record<string, unknown> | null = null;
  let chain: Record<string, unknown> | null = null;
  for (const [key, value] of Object.entries(capabilities)) {
    if (!/^0x[\da-f]+$/i.test(key)) continue;
    const parsedChainId = Number.parseInt(key, 16);
    if (parsedChainId === 0) global = asRecord(value);
    if (parsedChainId === chainId) chain = asRecord(value);
  }
  if (!chain && !global) return null;
  return { ...global, ...chain };
}

export function supportsSponsoredAtomicCalls(
  response: unknown,
  chainId: number,
): boolean {
  const capabilities = chainCapabilities(response, chainId);
  if (!capabilities) return false;
  const paymaster = asRecord(capabilities.paymasterService);
  const atomic = asRecord(capabilities.atomic);
  return paymaster?.supported === true && atomic?.status === "supported";
}

export async function walletSupportsSponsoredAtomicCalls({
  account,
  chainId,
  provider,
}: {
  account: Address;
  chainId: number;
  provider: WalletRpcProvider;
}): Promise<boolean> {
  try {
    const response = await provider.request({
      method: "wallet_getCapabilities",
      params: [account, [numberToHex(chainId)]],
    });
    return supportsSponsoredAtomicCalls(response, chainId);
  } catch {
    return false;
  }
}
