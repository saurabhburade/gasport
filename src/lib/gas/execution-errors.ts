function hasShortMessage(error: unknown): error is { shortMessage: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "shortMessage" in error &&
    typeof error.shortMessage === "string" &&
    error.shortMessage.trim().length > 0
  );
}

function messageFromError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim().length > 0
  ) {
    return error.message;
  }
  return undefined;
}

export function isUnsupportedWalletMethodError(error: unknown) {
  const message = messageFromError(error)?.toLowerCase() ?? "";
  return (
    message.includes("provider does not support the requested method") ||
    message.includes(
      "requested method is not supported by this ethereum provider",
    )
  );
}

export function executionErrorMessage(error: unknown) {
  if (isUnsupportedWalletMethodError(error)) {
    return "This wallet does not support wallet-native sponsored calls on Ethereum. Reconnect the Coinbase Base Account and try again.";
  }
  if (hasShortMessage(error)) {
    return error.shortMessage;
  }
  const message = messageFromError(error);
  if (
    message &&
    ["failed to fetch", "networkerror"].some((needle) =>
      message.toLowerCase().includes(needle),
    )
  ) {
    return "Could not reach the wallet or gas sponsorship service. Check your connection and retry.";
  }
  return message
    ? message
    : "The transaction could not be completed. Retry to continue from the last completed step.";
}
