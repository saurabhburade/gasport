import { NextResponse } from "next/server";
import { getRouteAdapter } from "@/lib/routes/registry";
import { routeStatusRequestSchema } from "@/lib/routes/schemas";
import { RouteAdapterError } from "@/lib/routes/types";

export async function GET(request: Request) {
  const url = new URL(request.url);
  let settlement: unknown;
  try {
    settlement = JSON.parse(url.searchParams.get("settlement") ?? "");
  } catch {
    return NextResponse.json(
      { error: "A valid route settlement is required." },
      { status: 400 },
    );
  }
  const parsed = routeStatusRequestSchema.safeParse({
    provider: url.searchParams.get("provider"),
    settlement,
    sourceTxHash: url.searchParams.get("sourceTxHash"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid route status parameters.",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  try {
    const status = await getRouteAdapter(parsed.data.provider).getStatus(
      parsed.data.settlement,
      parsed.data.sourceTxHash,
    );
    return NextResponse.json(status, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof RouteAdapterError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json(
      { error: "The route provider status is temporarily unavailable." },
      { status: 502 },
    );
  }
}
