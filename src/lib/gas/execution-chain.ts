/**
 * AppKit's active account chain is authoritative for embedded wallets. Their
 * cached WalletClient chain can lag behind the passkey wallet's network.
 */
export function isActiveWalletOnExecutionChain(
  activeChainId: number | undefined,
  executionChainId: number,
) {
  return activeChainId === executionChainId;
}

type SwitchChain = (parameters: { chainId: number }) => Promise<{ id: number }>;

export async function ensureActiveWalletOnExecutionChain({
  activeChainId,
  executionChainId,
  switchChain,
}: {
  activeChainId: number | undefined;
  executionChainId: number;
  switchChain: SwitchChain;
}) {
  if (isActiveWalletOnExecutionChain(activeChainId, executionChainId)) return;

  const chain = await switchChain({ chainId: executionChainId });
  if (chain.id !== executionChainId) {
    throw new Error("The wallet did not switch to the source network.");
  }
}
