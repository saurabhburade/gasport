import { z } from "zod";

const DEFAULT_ONE_CLICK_BASE_URL = "https://1click.chaindefuser.com";

export type BrowserRequestResult<T> =
  | { data: T; ok: true; status: number }
  | { error: string; ok: false; status: number };

function safeBaseUrl(rawUrl: string) {
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

function abortError() {
  const error = new Error("The NEAR 1Click request was aborted.");
  error.name = "AbortError";
  return error;
}

export async function requestNearOneClick<T>(
  apiUrl: string | undefined,
  path: string,
  init: RequestInit,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
): Promise<BrowserRequestResult<T>> {
  if (signal?.aborted) throw abortError();

  const baseUrl = safeBaseUrl(apiUrl?.trim() || DEFAULT_ONE_CLICK_BASE_URL);
  if (!baseUrl) {
    return {
      error: "NEAR 1Click URL is invalid or unavailable.",
      ok: false,
      status: 0,
    };
  }

  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await globalThis.fetch(`${baseUrl}${path}`, {
      ...init,
      cache: "no-store",
      headers,
      signal,
    });
  } catch {
    if (signal?.aborted) throw abortError();
    return {
      error: "NEAR 1Click is unavailable. Please try again.",
      ok: false,
      status: 0,
    };
  }

  const rawBody = await response.text();
  let body: unknown;
  try {
    body = rawBody ? JSON.parse(rawBody) : undefined;
  } catch {
    return {
      error: "NEAR 1Click returned malformed JSON.",
      ok: false,
      status: response.status,
    };
  }

  if (!response.ok) {
    const message = z.object({ message: z.string().min(1) }).safeParse(body);
    return {
      error: message.success
        ? message.data.message
        : "NEAR 1Click rejected the request.",
      ok: false,
      status: response.status,
    };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      error: "NEAR 1Click returned an invalid response.",
      ok: false,
      status: response.status,
    };
  }

  return { data: parsed.data, ok: true, status: response.status };
}
