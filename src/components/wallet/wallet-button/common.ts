export function formatWalletAddress(address?: string) {
  if (!address) return "Wallet connected";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
