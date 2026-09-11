/** Keeps a token amount editable while rejecting non-numeric characters. */
export function normalizeAmountInput(value: string, decimals: number) {
  const numeric = value.replace(/[^\d.]/g, "");
  const [whole = "", ...fractionalParts] = numeric.split(".");
  const hasDecimal = numeric.includes(".");
  const fractional = fractionalParts.join("").slice(0, decimals);

  return hasDecimal ? `${whole}.${fractional}` : whole;
}

export function hasInsufficientBalance({
  connected,
  requiredAmount,
  walletBalance,
}: {
  connected: boolean;
  requiredAmount?: bigint;
  walletBalance?: bigint;
}) {
  return (
    connected &&
    requiredAmount !== undefined &&
    walletBalance !== undefined &&
    requiredAmount > walletBalance
  );
}
