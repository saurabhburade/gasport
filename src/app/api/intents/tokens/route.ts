import { NextResponse } from "next/server";
import { intentsTokenCatalog } from "@/config/tokens";

export async function GET() {
  return NextResponse.json(intentsTokenCatalog);
}
