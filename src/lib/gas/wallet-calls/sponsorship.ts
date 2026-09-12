export function assertSponsorshipPreflight(
  responseOk: boolean,
  value: unknown,
) {
  const result =
    value && typeof value === "object"
      ? (value as { available?: unknown; error?: unknown })
      : undefined;
  if (responseOk && result?.available === true) return;
  if (typeof result?.error === "string" && result.error.trim()) {
    throw new Error(result.error);
  }
  throw new Error("Source-chain gas sponsorship is unavailable.");
}

function isLocalHostname(hostname: string) {
  return (
    ["localhost", "127.0.0.1", "[::1]"].includes(hostname) ||
    hostname.endsWith(".localhost")
  );
}

export function getPaymasterProxyUrl({
  origin,
  configuredUrl,
}: {
  origin: string;
  configuredUrl?: string;
}) {
  const appOrigin = new URL(origin);
  if (appOrigin.protocol === "https:" && !isLocalHostname(appOrigin.hostname)) {
    return new URL("/api/gas/sponsored", appOrigin).toString();
  }

  const publicProxyUrl = configuredUrl?.trim();
  if (!publicProxyUrl) {
    throw new Error(
      "A publicly reachable HTTPS paymaster URL is required for local development. Set NEXT_PUBLIC_PAYMASTER_PROXY_URL to your active tunnel URL.",
    );
  }
  validatePaymasterUrl(publicProxyUrl);
  return publicProxyUrl;
}

export function getSponsorshipPreflightUrl(
  paymasterUrl: string,
  chainId: number,
) {
  const url = new URL(paymasterUrl);
  url.searchParams.set("chainId", String(chainId));
  return url.toString();
}

/** Headers required by the browser-only local sponsorship availability check. */
export function getSponsorshipPreflightHeaders({
  origin,
  paymasterUrl,
}: {
  origin: string;
  paymasterUrl: string;
}): Record<string, string> {
  const appOrigin = new URL(origin);
  const paymaster = new URL(paymasterUrl);
  const isLocalOrigin = isLocalHostname(appOrigin.hostname);
  const isNgrok =
    paymaster.hostname.endsWith(".ngrok-free.dev") ||
    paymaster.hostname.endsWith(".ngrok.app") ||
    paymaster.hostname.endsWith(".ngrok.io");

  return isLocalOrigin && isNgrok ? { "ngrok-skip-browser-warning": "1" } : {};
}

export function validatePaymasterUrl(paymasterUrl: string) {
  let parsedPaymasterUrl: URL;
  try {
    parsedPaymasterUrl = new URL(paymasterUrl);
  } catch {
    throw new Error("The paymaster URL is invalid.");
  }
  if (parsedPaymasterUrl.protocol !== "https:") {
    throw new Error(
      "Coinbase Base Account requires an HTTPS paymaster URL. Configure NEXT_PUBLIC_PAYMASTER_PROXY_URL.",
    );
  }
  if (isLocalHostname(parsedPaymasterUrl.hostname)) {
    throw new Error(
      "A publicly reachable HTTPS paymaster URL is required. Localhost cannot be used as the wallet paymaster URL.",
    );
  }
}
