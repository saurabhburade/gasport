import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/intents/api";
import { getRouteAdapter } from "@/lib/routes/registry";
import { routePrepareApiRequestSchema } from "@/lib/routes/schemas";
import { RouteAdapterError } from "@/lib/routes/types";

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body.ok) {
    return NextResponse.json(
      { error: "A valid JSON route preparation body is required." },
      { status: 400 },
    );
  }
  const parsed = routePrepareApiRequestSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid route preparation parameters.",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const { provider, ...quoteRequest } = parsed.data;
  try {
    const prepared = await getRouteAdapter(provider).prepare(quoteRequest);
    return NextResponse.json(prepared, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof RouteAdapterError) {
      const status =
        error.code === "invalid_request"
          ? 400
          : error.code === "no_route" || error.code === "unsupported"
            ? 422
            : 502;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json(
      { error: "The route provider could not prepare this transfer." },
      { status: 502 },
    );
  }
}
