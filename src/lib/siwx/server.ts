import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { SIWXMessage, SIWXSession } from "@reown/appkit";
import {
  type Address,
  createPublicClient,
  type Hex,
  http,
  isAddress,
  isHex,
} from "viem";
import { TERMS_VERSION } from "../terms.ts";
import {
  createGasportSiwxMessage,
  isIsoTimestamp,
  SIWX_MESSAGE_VERSION,
  SIWX_NONCE_TTL_SECONDS,
  SIWX_SESSION_TTL_SECONDS,
  termsUrlForOrigin,
} from "./message.ts";
import { getSiwxNetwork } from "./networks.ts";

export const SIWX_NONCE_COOKIE = "gasport_siwx_nonce";
export const SIWX_SESSION_COOKIE = "gasport_siwx_session";
export const SIWX_MUTATION_HEADER = "x-gasport-siwx";

type SignedTokenPayload = {
  nonce?: string;
  exp: number;
};

type StoredSession = {
  session: SIWXSession;
  exp: number;
};

type CacaoLike = {
  h?: { t?: unknown };
  p?: {
    iss?: unknown;
    aud?: unknown;
    domain?: unknown;
    nonce?: unknown;
    version?: unknown;
    iat?: unknown;
    exp?: unknown;
    nbf?: unknown;
    requestId?: unknown;
    statement?: unknown;
    resources?: unknown;
  };
  s?: { s?: unknown };
};

function sessionSecret(): string {
  // Production deployments should provide a stable secret. The random
  // fallback intentionally invalidates sessions whenever a server instance
  // restarts instead of signing cookies with a predictable value.
  const configured =
    process.env.SIWX_SESSION_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SIWX_SESSION_SECRET must be configured in production.");
  }

  const globalKey = "__gasport_siwx_ephemeral_secret__";
  const globalState = globalThis as typeof globalThis & {
    [key: string]: string | undefined;
  };
  const existing = globalState[globalKey];
  if (existing) return existing;
  const generated = randomBytes(32).toString("hex");
  globalState[globalKey] = generated;
  return generated;
}

function sign(value: string): string {
  return createHmac("sha256", sessionSecret()).update(value).digest("hex");
}

function encodeToken(payload: SignedTokenPayload | StoredSession): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

function decodeToken<T extends SignedTokenPayload | StoredSession>(
  value: string | undefined,
): T | null {
  if (!value) return null;
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;

  const encoded = value.slice(0, separator);
  const suppliedSignature = value.slice(separator + 1);
  const expectedSignature = sign(encoded);
  if (
    suppliedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(
      Buffer.from(suppliedSignature),
      Buffer.from(expectedSignature),
    )
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as T;
    return typeof parsed.exp === "number" && parsed.exp > Date.now() / 1000
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function requestOrigin(request: Request): string {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL;
  const configured = configuredOrigin ? new URL(configuredOrigin).origin : null;
  const configuredHost = configured ? new URL(configured).hostname : null;
  const isDevelopmentLoopback =
    process.env.NODE_ENV !== "production" &&
    (configuredHost === "localhost" ||
      configuredHost === "127.0.0.1" ||
      configuredHost === "[::1]");

  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  const forwardedProtocol = request.headers.get("x-forwarded-proto");
  const requestProtocol = new URL(request.url).protocol.replace(":", "");
  const protocol =
    forwardedProtocol?.split(",")[0]?.trim() || requestProtocol || "http";
  if (host && (protocol === "http" || protocol === "https")) {
    const requestOrigin = `${protocol}://${host}`;
    if (!configured || isDevelopmentLoopback) return requestOrigin;
    if (requestOrigin === configured) return configured;
  }
  return configured ?? new URL(request.url).origin;
}

export function isMutationRequest(request: Request): boolean {
  return request.headers.get(SIWX_MUTATION_HEADER) === "1";
}

export function signedNonce(nonce: string, now = Date.now()): string {
  return encodeToken({
    nonce,
    exp: Math.floor(now / 1000) + SIWX_NONCE_TTL_SECONDS,
  });
}

export function readNonce(request: Request): string | null {
  return (
    decodeToken<SignedTokenPayload>(
      request.headers
        .get("cookie")
        ?.split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${SIWX_NONCE_COOKIE}=`))
        ?.slice(SIWX_NONCE_COOKIE.length + 1),
    )?.nonce ?? null
  );
}

export function sessionCookieValue(
  session: SIWXSession,
  expirationTime: string,
): string {
  // The signature has already been verified by POST. Smart-wallet signatures
  // can exceed a browser's per-cookie limit, so retain only the verified
  // agreement metadata in the HMAC-protected session cookie.
  const {
    accountAddress,
    chainId,
    domain,
    uri,
    version,
    nonce,
    statement,
    resources,
    issuedAt,
  } = session.data;
  return encodeToken({
    session: {
      data: {
        accountAddress,
        chainId,
        domain,
        uri,
        version,
        nonce,
        statement,
        resources,
        issuedAt,
        expirationTime,
      },
      message: "",
      signature: "",
    },
    exp: Math.floor(Date.parse(expirationTime) / 1000),
  });
}

export function readStoredSession(request: Request): SIWXSession | null {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SIWX_SESSION_COOKIE}=`));
  const stored = decodeToken<StoredSession>(
    cookie?.slice(SIWX_SESSION_COOKIE.length + 1),
  );
  return stored?.session ?? null;
}

function parsedAddress(value: unknown): Address | null {
  return typeof value === "string" && isAddress(value)
    ? (value as Address)
    : null;
}

function isCaipEip155Chain(value: unknown): value is `eip155:${number}` {
  return (
    typeof value === "string" &&
    /^eip155:\d+$/.test(value) &&
    getSiwxNetwork(Number(value.slice("eip155:".length))) !== undefined
  );
}

function sessionDataFromUnknown(value: unknown): SIWXMessage.Data | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (
    !parsedAddress(data.accountAddress) ||
    !isCaipEip155Chain(data.chainId) ||
    typeof data.domain !== "string" ||
    typeof data.uri !== "string" ||
    data.version !== SIWX_MESSAGE_VERSION ||
    typeof data.nonce !== "string" ||
    typeof data.statement !== "string" ||
    !Array.isArray(data.resources) ||
    !data.resources.every((resource) => typeof resource === "string") ||
    !isIsoTimestamp(data.issuedAt) ||
    !isIsoTimestamp(data.expirationTime) ||
    (data.notBefore !== undefined && !isIsoTimestamp(data.notBefore)) ||
    (data.requestId !== undefined && typeof data.requestId !== "string")
  ) {
    return null;
  }

  return {
    accountAddress: data.accountAddress as string,
    chainId: data.chainId as `eip155:${number}`,
    domain: data.domain as string,
    uri: data.uri as string,
    version: data.version as string,
    nonce: data.nonce as string,
    statement: data.statement as string,
    resources: data.resources as string[],
    issuedAt: data.issuedAt as string,
    expirationTime: data.expirationTime as string,
    ...(data.notBefore !== undefined
      ? { notBefore: data.notBefore as string }
      : {}),
    ...(data.requestId !== undefined
      ? { requestId: data.requestId as string }
      : {}),
  };
}

function isCacao(value: unknown): value is CacaoLike {
  if (!value || typeof value !== "object") return false;
  const cacao = value as CacaoLike;
  return (
    cacao.h?.t === "caip122" &&
    typeof cacao.p?.iss === "string" &&
    typeof cacao.p?.aud === "string" &&
    typeof cacao.p?.domain === "string" &&
    typeof cacao.p?.nonce === "string" &&
    typeof cacao.s?.s === "string"
  );
}

function matchesCacao(
  cacao: CacaoLike,
  data: SIWXMessage.Data,
  signature: string,
): boolean {
  const payload = cacao.p;
  const expectedIssPrefix = `did:pkh:${data.chainId}:`;
  const issuedAddress =
    typeof payload?.iss === "string"
      ? payload.iss.slice(expectedIssPrefix.length)
      : null;
  return (
    typeof payload?.iss === "string" &&
    payload.iss.startsWith(expectedIssPrefix) &&
    typeof issuedAddress === "string" &&
    issuedAddress.toLowerCase() === data.accountAddress.toLowerCase() &&
    payload.aud === data.uri &&
    payload.domain === data.domain &&
    payload.nonce === data.nonce &&
    (payload.version ?? SIWX_MESSAGE_VERSION) === data.version &&
    payload.iat === data.issuedAt &&
    payload.exp === data.expirationTime &&
    (payload.nbf ?? undefined) === (data.notBefore ?? undefined) &&
    (payload.requestId ?? undefined) === (data.requestId ?? undefined) &&
    payload.statement === data.statement &&
    JSON.stringify(payload.resources ?? []) ===
      JSON.stringify(data.resources) &&
    cacao.s?.s === signature
  );
}

function parseFormattedAuthMessage(message: string): {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  version: string;
  chainId: string;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
  resources: string[];
  notBefore?: string;
  requestId?: string;
} | null {
  const lines = message.split("\n");
  if (lines.length < 11) return null;
  const header = lines[0]?.match(
    /^(.*) wants you to sign in with your Ethereum account:$/,
  );
  if (!header || !lines[1] || lines[2] !== "") return null;

  let index = 3;
  const statement = lines[index++];
  if (!statement || lines[index++] !== "") return null;

  const fields = new Map<string, string>();
  while (index < lines.length && !lines[index]?.startsWith("Resources:")) {
    const separator = lines[index]?.indexOf(": ");
    if (!separator || separator < 1) return null;
    const field = lines[index].slice(0, separator);
    if (fields.has(field)) return null;
    fields.set(field, lines[index].slice(separator + 2));
    index += 1;
  }

  const resources: string[] = [];
  if (index < lines.length) {
    if (lines[index++] !== "Resources:") return null;
    while (index < lines.length) {
      const resource = lines[index++];
      if (!resource.startsWith("- ")) return null;
      resources.push(resource.slice(2));
    }
  }

  const requiredFields = [
    "URI",
    "Version",
    "Chain ID",
    "Nonce",
    "Issued At",
    "Expiration Time",
  ];
  const optionalFields = ["Not Before", "Request ID"];
  if (
    fields.size < requiredFields.length ||
    fields.size > requiredFields.length + optionalFields.length ||
    !requiredFields.every((field) => fields.has(field)) ||
    [...fields.keys()].some(
      (field) =>
        !requiredFields.includes(field) && !optionalFields.includes(field),
    )
  ) {
    return null;
  }

  return {
    domain: header[1],
    address: lines[1],
    statement,
    uri: fields.get("URI") as string,
    version: fields.get("Version") as string,
    chainId: fields.get("Chain ID") as string,
    nonce: fields.get("Nonce") as string,
    issuedAt: fields.get("Issued At") as string,
    expirationTime: fields.get("Expiration Time") as string,
    resources,
    notBefore: fields.get("Not Before"),
    requestId: fields.get("Request ID"),
  };
}

function matchesFormattedAuthMessage(
  message: string,
  data: SIWXMessage.Data,
  origin: string,
): boolean {
  const parsed = parseFormattedAuthMessage(message);
  return (
    parsed !== null &&
    parsed.domain === data.domain &&
    parsed.address.toLowerCase() === data.accountAddress.toLowerCase() &&
    parsed.statement === data.statement &&
    parsed.uri === origin &&
    parsed.version === data.version &&
    parsed.chainId === data.chainId.slice("eip155:".length) &&
    parsed.nonce === data.nonce &&
    parsed.issuedAt === data.issuedAt &&
    parsed.expirationTime === data.expirationTime &&
    parsed.notBefore === data.notBefore &&
    parsed.requestId === data.requestId &&
    JSON.stringify(parsed.resources) === JSON.stringify(data.resources ?? [])
  );
}

export function validateSessionInput({
  body,
  request,
  requireFreshNonce,
  now = Date.now(),
}: {
  body: unknown;
  request: Request;
  requireFreshNonce: boolean;
  now?: number;
}): { session: SIWXSession; expirationTime: string } | null {
  if (!body || typeof body !== "object") return null;
  const input = body as Record<string, unknown>;
  const data = sessionDataFromUnknown(input.data);
  const message = typeof input.message === "string" ? input.message : null;
  const signature =
    typeof input.signature === "string" ? input.signature : null;
  if (!data || !message || !signature || !isHex(signature)) return null;

  const origin = requestOrigin(request);
  const account = parsedAddress(data.accountAddress);
  const issuedAt = Date.parse(data.issuedAt ?? "");
  const expirationTime = Date.parse(data.expirationTime ?? "");
  const nowWithSkew = now + 5 * 60 * 1000;
  if (
    !account ||
    data.uri !== origin ||
    data.domain !== new URL(origin).host ||
    data.statement !==
      `Sign in to Gasport and accept the Gasport Terms and Conditions (version ${TERMS_VERSION}) at ${termsUrlForOrigin(origin)}.` ||
    data.resources?.length !== 1 ||
    data.resources[0] !== termsUrlForOrigin(origin) ||
    issuedAt > nowWithSkew ||
    expirationTime <= now ||
    expirationTime <= issuedAt ||
    (data.notBefore !== undefined &&
      Date.parse(data.notBefore) > nowWithSkew) ||
    (data.notBefore !== undefined &&
      Date.parse(data.notBefore) > expirationTime) ||
    expirationTime - issuedAt > SIWX_SESSION_TTL_SECONDS * 1000 + 1000
  ) {
    return null;
  }

  const expectedMessage = createGasportSiwxMessage({
    accountAddress: account,
    chainId: data.chainId,
    nonce: data.nonce,
    origin,
    issuedAt: data.issuedAt,
    expirationTime: data.expirationTime,
  }).toString();
  const cacao = input.cacao;
  if (isCacao(cacao)) {
    if (
      !matchesCacao(cacao, data, signature) ||
      !matchesFormattedAuthMessage(message, data, origin)
    ) {
      return null;
    }
  } else if (
    message !== expectedMessage ||
    data.notBefore !== undefined ||
    data.requestId !== undefined
  ) {
    return null;
  }

  if (requireFreshNonce && readNonce(request) !== data.nonce) return null;

  return {
    session: {
      data: {
        ...data,
        accountAddress: account as Address,
      },
      message,
      signature,
    },
    expirationTime: data.expirationTime as string,
  };
}

export async function verifySessionSignature(
  session: SIWXSession,
): Promise<boolean> {
  const chainId = Number(session.data.chainId.slice("eip155:".length));
  const network = getSiwxNetwork(chainId);
  if (!network) return false;

  const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;
  const rpcUrl = projectId
    ? `https://rpc.walletconnect.org/v1/?chainId=eip155:${chainId}&projectId=${encodeURIComponent(projectId)}`
    : undefined;
  const client = createPublicClient({
    chain: network,
    transport: http(rpcUrl),
  });

  try {
    return await client.verifyMessage({
      address: session.data.accountAddress as Address,
      message: session.message,
      signature: session.signature as Hex,
    });
  } catch {
    return false;
  }
}

export function matchesSession(
  session: SIWXSession,
  chainId: string | null,
  address: string | null,
): boolean {
  const expectedAddress = address && parsedAddress(address);
  return (
    (!chainId || session.data.chainId === chainId) &&
    (!address ||
      (expectedAddress !== null &&
        session.data.accountAddress.toLowerCase() ===
          expectedAddress.toLowerCase()))
  );
}
