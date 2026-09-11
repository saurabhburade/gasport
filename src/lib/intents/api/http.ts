import { NextResponse } from "next/server";
import { z } from "zod";
import { nearIntentsBaseUrl } from "./common.ts";
import {
  DEFAULT_EXPLORER_BASE_URL,
  DEFAULT_ONE_CLICK_BASE_URL,
} from "./constants.ts";

const upstreamErrorSchema = z.object({ message: z.string().min(1) });

type RequestResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; response: NextResponse };

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
