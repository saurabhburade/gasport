import { NextResponse } from "next/server";
import { z } from "zod";
import { invalidRequest, requestOneClick } from "@/lib/intents/api";
import { executionResponseSchema } from "@/lib/intents/schemas";
import { verifyNearQuoteSignature } from "@/lib/intents/signature";

const querySchema = z
  .object({
    depositAddress: z.string().min(1),
    depositMemo: z.string().min(1).optional(),
  })
  .strict();

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    depositAddress: url.searchParams.get("depositAddress"),
    depositMemo: url.searchParams.get("depositMemo") ?? undefined,
  });
  if (!parsed.success) {
    return invalidRequest(
      "A valid deposit address is required.",
      parsed.error.issues,
    );
  }

  const params = new URLSearchParams({
    depositAddress: parsed.data.depositAddress,
  });
  if (parsed.data.depositMemo)
    params.set("depositMemo", parsed.data.depositMemo);

  const result = await requestOneClick(
    `/v0/status?${params.toString()}`,
    { method: "GET" },
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
