import { NextResponse } from "next/server";
import { z } from "zod";
import type { MvpQuoteRequest, QuoteRequest } from "@/lib/intents/schemas";

const DEFAULT_ONE_CLICK_BASE_URL = "https://1click.chaindefuser.com";
const DEFAULT_EXPLORER_BASE_URL = "https://explorer.near-intents.org/api";
const upstreamErrorSchema = z.object({ message: z.string().min(1) });

type RequestResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; response: NextResponse };

function nearIntentsBaseUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const localHttpHost =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]";
    if (
      url.protocol !== "https:" &&
      !(url.protocol === "http:" && localHttpHost)
    ) {
      return null;
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function oneClickBaseUrl() {
  return nearIntentsBaseUrl(
    process.env.NEAR_INTENTS_API_URL ?? DEFAULT_ONE_CLICK_BASE_URL,
  );
}

export function explorerBaseUrl() {
  return nearIntentsBaseUrl(
    process.env.NEAR_INTENTS_EXPLORER_API_URL ?? DEFAULT_EXPLORER_BASE_URL,
  );
}

export function oneClickHeaders(hasJsonBody = false) {
  const headers = new Headers();
  if (hasJsonBody) headers.set("Content-Type", "application/json");

  const apiKey = process.env.NEAR_INTENTS_API_KEY;
  if (apiKey) headers.set("Authorization", `Bearer ${apiKey}`);

  return headers;
}

export async function readJsonBody(request: Request) {
  try {
    return { ok: true as const, value: await request.json() };
  } catch {
    return { ok: false as const };
  }
}

export function invalidRequest(message: string, issues?: z.ZodIssue[]) {
  return NextResponse.json(
    {
      error: message,
      ...(issues ? { issues } : {}),
    },
    { status: 400 },
  );
}

export async function requestOneClick<T>(
  path: string,
  init: RequestInit,
  schema: z.ZodType<T>,
): Promise<RequestResult<T>> {
  return requestNearIntents(
    oneClickBaseUrl(),
    "NEAR Intents API",
    path,
    init,
    schema,
  );
}

export async function requestExplorer<T>(
  path: string,
  init: RequestInit,
  schema: z.ZodType<T>,
): Promise<RequestResult<T>> {
  return requestNearIntents(
    explorerBaseUrl(),
    "NEAR Intents Explorer API",
    path,
    init,
    schema,
  );
}

async function requestNearIntents<T>(
  baseUrl: string | null,
  serviceName: string,
  path: string,
  init: RequestInit,
  schema: z.ZodType<T>,
): Promise<RequestResult<T>> {
  if (!baseUrl) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `${serviceName} URL is invalid or unavailable.` },
        { status: 503 },
      ),
    };
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: oneClickHeaders(Boolean(init.body)),
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `${serviceName} is unavailable. Please try again.` },
        { status: 503 },
      ),
    };
  }

  const rawBody = await response.text();
  let body: unknown;
  try {
    body = rawBody ? JSON.parse(rawBody) : undefined;
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `${serviceName} returned a malformed JSON response.`,
          upstreamStatus: response.status,
        },
        { status: 502 },
      ),
    };
  }

  if (!response.ok) {
    const upstreamError = upstreamErrorSchema.safeParse(body);
    const status =
      response.status >= 400 && response.status < 500 ? response.status : 502;
    return {
      ok: false,
      response: NextResponse.json(
        upstreamError.success
          ? { error: upstreamError.data.message }
          : {
              error:
                status === 502
                  ? `${serviceName} returned an unavailable service response.`
                  : `${serviceName} rejected the request.`,
              upstreamStatus: response.status,
            },
        { status },
      ),
    };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `${serviceName} returned an invalid response.`,
          upstreamStatus: response.status,
          issues: parsed.error.issues,
        },
        { status: 502 },
      ),
    };
  }

  return { ok: true, data: parsed.data, status: response.status };
}

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
