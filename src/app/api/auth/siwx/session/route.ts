import { NextResponse } from "next/server";
import {
  isMutationRequest,
  matchesSession,
  readStoredSession,
  requestOrigin,
  SIWX_NONCE_COOKIE,
  SIWX_SESSION_COOKIE,
  sessionCookieValue,
  validateSessionInput,
  verifySessionSignature,
} from "@/lib/siwx/server";

export const runtime = "nodejs";

function noStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "no-store");
  return response;
}

function clearNonce(response: NextResponse): void {
  response.cookies.set({
    name: SIWX_NONCE_COOKIE,
    value: "",
    maxAge: 0,
    path: "/",
  });
}

function clearSession(response: NextResponse): void {
  response.cookies.set({
    name: SIWX_SESSION_COOKIE,
    value: "",
    maxAge: 0,
    path: "/",
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const session = readStoredSession(request);
  if (
    !session ||
    !matchesSession(
      session,
      url.searchParams.get("chainId"),
      url.searchParams.get("address"),
    )
  ) {
    return noStore(NextResponse.json({ session: null }, { status: 404 }));
  }
  return noStore(NextResponse.json({ session }));
}

export async function POST(request: Request) {
  if (!isMutationRequest(request)) {
    return noStore(
      NextResponse.json({ error: "Invalid SIWX request." }, { status: 403 }),
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStore(
      NextResponse.json({ error: "Invalid SIWX payload." }, { status: 400 }),
    );
  }

  const restore =
    typeof body === "object" &&
    body !== null &&
    "restore" in body &&
    (body as { restore?: unknown }).restore === true;
  const validated = validateSessionInput({
    body,
    request,
    requireFreshNonce: !restore,
  });
  if (!validated || !(await verifySessionSignature(validated.session))) {
    return noStore(
      NextResponse.json({ error: "Invalid SIWX signature." }, { status: 401 }),
    );
  }

  const response = noStore(
    NextResponse.json({
      ok: true,
      expirationTime: validated.expirationTime,
      origin: requestOrigin(request),
    }),
  );
  response.cookies.set({
    name: SIWX_SESSION_COOKIE,
    value: sessionCookieValue(validated.session, validated.expirationTime),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(validated.expirationTime),
  });
  clearNonce(response);
  return response;
}

export async function DELETE(request: Request) {
  if (!isMutationRequest(request)) {
    return noStore(
      NextResponse.json({ error: "Invalid SIWX request." }, { status: 403 }),
    );
  }

  const url = new URL(request.url);
  const session = readStoredSession(request);
  const hasFilter =
    url.searchParams.has("chainId") || url.searchParams.has("address");
  if (
    hasFilter &&
    (!session ||
      !matchesSession(
        session,
        url.searchParams.get("chainId"),
        url.searchParams.get("address"),
      ))
  ) {
    return noStore(NextResponse.json({ ok: true }));
  }

  const response = noStore(NextResponse.json({ ok: true }));
  clearSession(response);
  clearNonce(response);
  return response;
}
