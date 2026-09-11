import { NextResponse } from "next/server";
import {
  configuredQuotePayload,
  invalidRequest,
  readJsonBody,
  requestOneClick,
} from "@/lib/intents/api";
import {
  mvpQuoteRequestSchema,
  quoteResponseSchema,
} from "@/lib/intents/schemas";
import { verifyNearQuoteSignature } from "@/lib/intents/signature";

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body.ok) return invalidRequest("A valid JSON quote body is required.");

  const parsed = mvpQuoteRequestSchema.safeParse(body.value);
  if (!parsed.success) {
    return invalidRequest("Invalid quote parameters.", parsed.error.issues);
  }

  const configured = configuredQuotePayload(parsed.data);
  if (!configured.ok) return configured.response;

  const result = await requestOneClick(
    "/v0/quote",
    {
      method: "POST",
      body: JSON.stringify(configured.data),
    },
    quoteResponseSchema,
  );

  if (!result.ok) return result.response;
  if (!verifyNearQuoteSignature(result.data)) {
    return NextResponse.json(
      { error: "NEAR Intents returned an invalid quote signature." },
      { status: 502 },
    );
  }
  return NextResponse.json(result.data, { status: result.status });
}
