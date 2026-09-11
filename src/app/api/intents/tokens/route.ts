import { NextResponse } from "next/server";
import { z } from "zod";
import { requestOneClick } from "@/lib/intents/api";
import { tokenResponseSchema } from "@/lib/intents/schemas";
import { enrichIntentsCatalog } from "@/lib/tokens/source-catalog";

const tokensResponseSchema = z.array(tokenResponseSchema);
const uniswapTokenSchema = z
  .object({
    chainId: z.number().int().positive(),
    address: z.string().min(1),
    name: z.string().min(1),
    symbol: z.string().min(1),
    logoURI: z.string().min(1).optional(),
  })
  .passthrough();
const uniswapListSchema = z
  .object({ tokens: z.array(uniswapTokenSchema) })
  .passthrough();

async function getUniswapTokenMetadata() {
  try {
    const response = await fetch("https://tokens.uniswap.org", {
      next: { revalidate: 60 * 60 },
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return [];
    const parsed = uniswapListSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.tokens : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const [result, uniswapTokens] = await Promise.all([
    requestOneClick("/v0/tokens", { method: "GET" }, tokensResponseSchema),
    getUniswapTokenMetadata(),
  ]);

  return result.ok
    ? NextResponse.json(enrichIntentsCatalog(result.data, uniswapTokens), {
        status: result.status,
      })
    : result.response;
}
