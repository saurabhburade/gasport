export function getNearIntentsExplorerSearchUrl(txHash: string) {
  const url = new URL("https://explorer.near-intents.org/");
  url.searchParams.set("search", txHash);
  return url.toString();
}
