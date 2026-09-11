export const SOURCE_TRANSACTION_CONFIRMED =
  "SOURCE_TRANSACTION_CONFIRMED" as const;

export type SourceTransactionConfirmed = {
  status: typeof SOURCE_TRANSACTION_CONFIRMED;
  txHash: string;
};

export function getLocalDepositCompletion({
  apiKey,
  txHash,
}: {
  apiKey: string | undefined;
  txHash: string;
}): SourceTransactionConfirmed | null {
  if (apiKey?.trim()) return null;
  return { status: SOURCE_TRANSACTION_CONFIRMED, txHash };
}

export function getNearIntentsExplorerSearchUrl(txHash: string) {
  const url = new URL("https://explorer.near-intents.org/");
  url.searchParams.set("search", txHash);
  return url.toString();
}

export function isSourceTransactionConfirmed(
  value: unknown,
): value is SourceTransactionConfirmed {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.status === SOURCE_TRANSACTION_CONFIRMED &&
    typeof record.txHash === "string" &&
    /^0x[0-9a-fA-F]{64}$/.test(record.txHash)
  );
}
