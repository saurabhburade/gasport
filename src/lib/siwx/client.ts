"use client";

import type {
  CaipNetworkId,
  SIWXConfig,
  SIWXMessage,
  SIWXSession,
} from "@reown/appkit";
import { createGasportSiwxMessage } from "./message.ts";

const sessionEndpoint = "/api/auth/siwx/session";
const nonceEndpoint = "/api/auth/siwx/nonce";
const requestHeaders = { "x-gasport-siwx": "1" };

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`SIWX request failed (${response.status}).`);
  }
  return (await response.json()) as T;
}

async function getNonce(): Promise<string> {
  const response = await fetch(nonceEndpoint, {
    credentials: "same-origin",
    cache: "no-store",
  });
  const body = await readJson<{ nonce: string }>(response);
  if (!body.nonce) {
    throw new Error("Gasport did not return an authentication nonce.");
  }
  return body.nonce;
}

async function getSession(
  chainId: CaipNetworkId,
  address: string,
): Promise<SIWXSession[]> {
  const params = new URLSearchParams({ chainId, address });
  const response = await fetch(`${sessionEndpoint}?${params.toString()}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 404) {
    return [];
  }
  const body = await readJson<{ session: SIWXSession | null }>(response);
  return body.session ? [body.session] : [];
}

export const siwxConfig: SIWXConfig = {
  createMessage: async (input) => {
    const nonce = await getNonce();
    return createGasportSiwxMessage({
      ...input,
      nonce,
      origin: window.location.origin,
    });
  },

  // Leave signing undefined so AppKit uses its adapter's native signer. This
  // preserves One-Click Auth and supports smart-wallet signature envelopes.
  addSession: async (session) => {
    await readJson(
      await fetch(sessionEndpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { ...requestHeaders, "content-type": "application/json" },
        body: JSON.stringify(session),
      }),
    );
  },

  revokeSession: async (chainId, address) => {
    await readJson(
      await fetch(
        `${sessionEndpoint}?${new URLSearchParams({ chainId, address })}`,
        {
          method: "DELETE",
          credentials: "same-origin",
          headers: requestHeaders,
        },
      ),
    );
  },

  setSessions: async (sessions) => {
    if (sessions.length === 0) {
      await readJson(
        await fetch(sessionEndpoint, {
          method: "DELETE",
          credentials: "same-origin",
          headers: requestHeaders,
        }),
      );
      return;
    }

    // The app has one active EVM identity at a time. Re-verify the selected
    // session before replacing the server cookie, even during AppKit restore.
    await readJson(
      await fetch(sessionEndpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { ...requestHeaders, "content-type": "application/json" },
        body: JSON.stringify({ ...sessions[0], restore: true }),
      }),
    );
  },

  getSessions: async (chainId, address) => getSession(chainId, address),
  getRequired: () => true,
  signOutOnDisconnect: true,
};

export function isGasportSiwxMessage(message: SIWXMessage): boolean {
  return (
    message.statement?.includes("Gasport Terms and Conditions") === true &&
    message.resources?.some((resource) => resource.endsWith("/terms")) === true
  );
}
