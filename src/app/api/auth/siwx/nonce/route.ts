import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { SIWX_NONCE_COOKIE, signedNonce } from "@/lib/siwx/server";

export const runtime = "nodejs";

export async function GET() {
  const nonce = randomBytes(24).toString("base64url");
  const response = NextResponse.json(
    { nonce },
    { headers: { "cache-control": "no-store" } },
  );
  response.cookies.set({
    name: SIWX_NONCE_COOKIE,
    value: signedNonce(nonce),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 5 * 60,
  });
  return response;
}
