import { NextResponse } from "next/server";
import { z } from "zod";
import { invalidRequest, requestExplorer } from "@/lib/intents/api";
import { transactionHistoryResponseSchema } from "@/lib/intents/schemas";

const querySchema = z
  .object({
    address: z.string().min(1).max(256),
    cursorAddress: z.string().min(1).max(256).optional(),
    cursorMemo: z.string().max(256).optional(),
  })
  .strict();

export async function GET(request: Request) {
  if (!process.env.NEAR_INTENTS_API_KEY) {
    return NextResponse.json(
      {
        error:
          "Transaction history requires a NEAR Intents API key. Set NEAR_INTENTS_API_KEY on the server.",
      },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    address: url.searchParams.get("address"),
    cursorAddress: url.searchParams.get("cursorAddress") ?? undefined,
    cursorMemo: url.searchParams.get("cursorMemo") ?? undefined,
  });
  if (!parsed.success) {
    return invalidRequest(
      "A wallet address is required to find transactions.",
      parsed.error.issues,
    );
  }

  const params = new URLSearchParams({
    search: parsed.data.address,
    numberOfTransactions: "20",
    statuses:
      "FAILED,INCOMPLETE_DEPOSIT,PENDING_DEPOSIT,PROCESSING,REFUNDED,SUCCESS",
  });
  if (parsed.data.cursorAddress) {
    params.set("lastDepositAddress", parsed.data.cursorAddress);
    if (parsed.data.cursorMemo)
      params.set("lastDepositMemo", parsed.data.cursorMemo);
  }

  const result = await requestExplorer(
    `/v0/transactions?${params.toString()}`,
    { method: "GET" },
    transactionHistoryResponseSchema,
  );

  return result.ok
    ? NextResponse.json(result.data, { status: result.status })
    : result.response;
}
