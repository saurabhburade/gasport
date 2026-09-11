import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/intents/api";
import { getRouteQuotes } from "@/lib/routes/registry";
import { routeQuoteApiRequestSchema } from "@/lib/routes/schemas";

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body.ok) {
    return NextResponse.json(
      { error: "A valid JSON route quote body is required." },
      { status: 400 },
    );
  }
  const parsed = routeQuoteApiRequestSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid route quote parameters.", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { provider, ...quoteRequest } = parsed.data;
  const result = await getRouteQuotes(quoteRequest, provider);
  if (!result.selected) {
    return NextResponse.json(
      {
        error: "No route provider could quote this transfer.",
        failures: result.failures,
      },
      { status: 422 },
    );
  }
  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
