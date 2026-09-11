import { NextResponse } from "next/server";
import {
  invalidRequest,
  readJsonBody,
  requestOneClick,
} from "@/lib/intents/api";
import { getLocalDepositCompletion } from "@/lib/intents/deposit-registration";
import {
  executionResponseSchema,
  submitDepositTxRequestSchema,
} from "@/lib/intents/schemas";
import { verifyNearQuoteSignature } from "@/lib/intents/signature";

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body.ok) return invalidRequest("A valid JSON deposit body is required.");

  const parsed = submitDepositTxRequestSchema.safeParse(body.value);
  if (!parsed.success) {
    return invalidRequest(
      "A deposit address and transaction hash are required.",
      parsed.error.issues,
    );
  }

  const localCompletion = getLocalDepositCompletion({
    apiKey: process.env.NEAR_INTENTS_API_KEY,
    txHash: parsed.data.txHash,
  });
  if (localCompletion) return NextResponse.json(localCompletion);

  const result = await requestOneClick(
    "/v0/deposit/submit",
    {
      method: "POST",
      body: JSON.stringify(parsed.data),
    },
    executionResponseSchema,
  );

  if (!result.ok) return result.response;
  if (!verifyNearQuoteSignature(result.data.quoteResponse)) {
    return NextResponse.json(
      { error: "NEAR Intents returned an invalid status signature." },
      { status: 502 },
    );
  }
  return NextResponse.json(result.data, { status: result.status });
}
