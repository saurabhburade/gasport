import assert from "node:assert/strict";
import test from "node:test";
import type { SIWXSession } from "@reown/appkit";
import { createGasportSiwxMessage } from "./message.ts";
import {
  readStoredSession,
  requestOrigin,
  SIWX_MUTATION_HEADER,
  SIWX_NONCE_COOKIE,
  SIWX_SESSION_COOKIE,
  sessionCookieValue,
  signedNonce,
  validateSessionInput,
} from "./server.ts";

const origin = "https://gasport.example";
const account = "0x0000000000000000000000000000000000000001";
const issuedAt = "2026-09-12T10:00:00.000Z";
const expirationTime = "2026-09-12T10:15:00.000Z";
const nonce = "test-nonce";

function makeSession(): SIWXSession {
  const message = createGasportSiwxMessage({
    accountAddress: account,
    chainId: "eip155:8453",
    nonce,
    origin,
    issuedAt,
    expirationTime,
  });
  return {
    data: message,
    message: message.toString(),
    signature: "0x1234",
  };
}

function makeRequest(cookie = signedNonce(nonce, Date.parse(issuedAt))) {
  return new Request(`${origin}/api/auth/siwx/session`, {
    headers: {
      host: "gasport.example",
      [SIWX_MUTATION_HEADER]: "1",
      cookie: `${SIWX_NONCE_COOKIE}=${cookie}`,
    },
  });
}

test("creates a wallet-connection message with versioned terms and URL", () => {
  const session = makeSession();
  assert.match(session.data.statement ?? "", /2026-09-12/);
  assert.deepEqual(session.data.resources, [`${origin}/terms`]);
  assert.match(session.message, /I?Sign in to Gasport/);
  assert.match(session.message, /Expiration Time: 2026-09-12T10:15:00.000Z/);
});

test("supports AppKit placeholder addresses before the wallet is known", () => {
  const message = createGasportSiwxMessage({
    accountAddress: "",
    chainId: "eip155:8453",
    nonce,
    origin,
    issuedAt,
    expirationTime,
  });
  assert.equal(message.accountAddress, "<<AccountAddress>>");
  assert.match(message.toString(), /<<AccountAddress>>/);
});

test("rejects a tampered message before signature verification", () => {
  const session = makeSession();
  const result = validateSessionInput({
    body: { ...session, message: `${session.message}\nUnexpected terms` },
    request: makeRequest(),
    requireFreshNonce: true,
    now: Date.parse(issuedAt),
  });
  assert.equal(result, null);
});

test("uses a public tunnel origin when development config points at localhost", () => {
  const previousOrigin = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  try {
    const tunnelOrigin = "https://gasport-tunnel.example";
    const message = createGasportSiwxMessage({
      accountAddress: account,
      chainId: "eip155:8453",
      nonce,
      origin: tunnelOrigin,
      issuedAt,
      expirationTime,
    });
    const request = new Request(`${tunnelOrigin}/api/auth/siwx/session`, {
      headers: {
        host: "localhost:3000",
        "x-forwarded-host": "gasport-tunnel.example",
        "x-forwarded-proto": "https",
        [SIWX_MUTATION_HEADER]: "1",
        cookie: `${SIWX_NONCE_COOKIE}=${signedNonce(nonce)}`,
      },
    });
    assert.equal(requestOrigin(request), tunnelOrigin);
    const result = validateSessionInput({
      body: { ...makeSession(), data: message, message: message.toString() },
      request,
      requireFreshNonce: true,
      now: Date.parse(issuedAt),
    });
    assert.ok(result);
  } finally {
    if (previousOrigin === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previousOrigin;
  }
});

test("accepts a WalletConnect Cacao message only when every Cacao field matches", () => {
  const session = makeSession();
  const cacao = {
    h: { t: "caip122" },
    p: {
      iss: `did:pkh:eip155:8453:${session.data.accountAddress}`,
      aud: origin,
      domain: "gasport.example",
      nonce,
      version: "1",
      iat: issuedAt,
      exp: expirationTime,
      statement: session.data.statement,
      resources: session.data.resources,
    },
    s: { s: session.signature },
  };
  const cacaoMessage = session.message;
  const result = validateSessionInput({
    body: { ...session, message: cacaoMessage, cacao, restore: true },
    request: makeRequest("invalid-for-restore"),
    requireFreshNonce: false,
    now: Date.parse(issuedAt),
  });
  assert.ok(result);

  const tampered = validateSessionInput({
    body: {
      ...session,
      message: "WalletConnect's canonical auth message",
      cacao,
      restore: true,
    },
    request: makeRequest("invalid-for-restore"),
    requireFreshNonce: false,
    now: Date.parse(issuedAt),
  });
  assert.equal(tampered, null);
});

test("keeps a large smart-wallet signature out of the signed session cookie", () => {
  const now = new Date();
  const expires = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
  const session = makeSession();
  session.data.issuedAt = now.toISOString();
  session.data.expirationTime = expires;
  session.signature = `0x${"ab".repeat(5_000)}`;

  const cookie = sessionCookieValue(session, expires);
  assert.ok(Buffer.byteLength(session.signature) > 4_096);
  assert.ok(Buffer.byteLength(`${SIWX_SESSION_COOKIE}=${cookie}`) < 4_096);

  const request = new Request(`${origin}/api/auth/siwx/session`, {
    headers: { cookie: `${SIWX_SESSION_COOKIE}=${cookie}` },
  });
  const stored = readStoredSession(request);
  assert.equal(stored?.data.accountAddress, account);
  assert.equal(stored?.data.chainId, "eip155:8453");
  assert.equal(stored?.data.expirationTime, expires);
  assert.equal(stored?.signature, "");
  assert.equal(stored?.message, "");

  const changedCharacter = cookie.endsWith("0") ? "1" : "0";
  const tampered = new Request(`${origin}/api/auth/siwx/session`, {
    headers: {
      cookie: `${SIWX_SESSION_COOKIE}=${cookie.slice(0, -1)}${changedCharacter}`,
    },
  });
  assert.equal(readStoredSession(tampered), null);
});
