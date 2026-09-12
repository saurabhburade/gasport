import type { CaipNetworkId, SIWXMessage } from "@reown/appkit";
import { getAddress } from "viem";
import { TERMS_VERSION } from "../terms.ts";

export const SIWX_MESSAGE_VERSION = "1";
export const SIWX_SESSION_TTL_SECONDS = 15 * 60;
export const SIWX_NONCE_TTL_SECONDS = 5 * 60;

export function termsUrlForOrigin(origin: string): string {
  return new URL("/terms", origin).toString();
}

export function createGasportSiwxMessage({
  accountAddress,
  chainId,
  nonce,
  origin,
  issuedAt = new Date().toISOString(),
  expirationTime = new Date(
    Date.parse(issuedAt) + SIWX_SESSION_TTL_SECONDS * 1000,
  ).toISOString(),
}: {
  accountAddress: string;
  chainId: CaipNetworkId;
  nonce: string;
  origin: string;
  issuedAt?: string;
  expirationTime?: string;
}): SIWXMessage {
  const isPlaceholderAddress =
    accountAddress === "" || accountAddress === "<<AccountAddress>>";
  const address = isPlaceholderAddress
    ? accountAddress || "<<AccountAddress>>"
    : getAddress(accountAddress);
  const termsUrl = termsUrlForOrigin(origin);
  const chainNumber = chainId.startsWith("eip155:")
    ? chainId.slice("eip155:".length)
    : chainId;
  const statement = `Sign in to Gasport and accept the Gasport Terms and Conditions (version ${TERMS_VERSION}) at ${termsUrl}.`;
  const domain = new URL(origin).host;

  const data: SIWXMessage.Data = {
    accountAddress: address,
    chainId,
    domain,
    uri: origin,
    version: SIWX_MESSAGE_VERSION,
    nonce,
    statement,
    resources: [termsUrl],
    issuedAt,
    expirationTime,
  };

  return {
    ...data,
    toString: () =>
      `${domain} wants you to sign in with your Ethereum account:\n${address}\n\n${statement}\n\nURI: ${origin}\nVersion: ${SIWX_MESSAGE_VERSION}\nChain ID: ${chainNumber}\nNonce: ${nonce}\nIssued At: ${issuedAt}\nExpiration Time: ${expirationTime}\nResources:\n- ${termsUrl}`,
  };
}

export function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
