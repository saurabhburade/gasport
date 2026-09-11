import { NextResponse } from "next/server";
import type { z } from "zod";

export async function readJsonBody(request: Request) {
  try {
    return { ok: true as const, value: await request.json() };
  } catch {
    return { ok: false as const };
  }
}

export function invalidRequest(message: string, issues?: z.ZodIssue[]) {
  return NextResponse.json(
    {
      error: message,
      ...(issues ? { issues } : {}),
    },
    { status: 400 },
  );
}
