import { NextResponse } from "next/server";
import type { MvpQuoteRequest, QuoteRequest } from "../schemas.ts";

export function configuredQuotePayload(
  request: MvpQuoteRequest,
  feeBpsOverride?: number,
): { ok: true; data: QuoteRequest } | { ok: false; response: NextResponse } {
  const feeText =
    feeBpsOverride === undefined
      ? (process.env.NEAR_INTENTS_FEE_BPS ?? "0")
      : String(feeBpsOverride);
  if (!/^\d+$/.test(feeText)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "NEAR_INTENTS_FEE_BPS must be a non-negative integer." },
        { status: 500 },
      ),
    };
  }

  const feeBps = Number(feeText);
  const feeRecipient = process.env.NEAR_INTENTS_FEE_RECIPIENT;
  if (!Number.isSafeInteger(feeBps)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "NEAR_INTENTS_FEE_BPS is outside the supported integer range.",
        },
        { status: 500 },
      ),
    };
  }
  if (feeBps > 500) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "NEAR_INTENTS_FEE_BPS cannot exceed 500." },
        { status: 500 },
      ),
    };
  }
  if (feeBps > 0 && !feeRecipient) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "NEAR_INTENTS_FEE_RECIPIENT is required when NEAR_INTENTS_FEE_BPS is enabled.",
        },
        { status: 500 },
      ),
    };
  }

  const referral = process.env.NEAR_INTENTS_REFERRER_ID;
  return {
    ok: true,
    data: {
      ...request,
      ...(referral ? { referral } : {}),
      ...(feeBps > 0 && feeRecipient
        ? { appFees: [{ recipient: feeRecipient, fee: feeBps }] }
        : {}),
    },
  };
}
