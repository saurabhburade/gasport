import type { Hex } from "viem";
import type { RouteQuoteRequest } from "../../types.ts";
import { RouteAdapterError, type RouteSettlement } from "../../types.ts";
import { isRecord, providerError } from "./common.ts";
import { LIFI_API_BASE_URL } from "./constants.ts";

export function quoteUrl(request: RouteQuoteRequest, amount: bigint) {
  const url = new URL(`${LIFI_API_BASE_URL}/quote`);
  url.searchParams.set("fromChain", String(request.sourceAsset.chainId));
  url.searchParams.set("toChain", String(request.destinationAsset.chainId));
  url.searchParams.set("fromToken", request.sourceAsset.address);
  url.searchParams.set("toToken", request.destinationAsset.address);
  url.searchParams.set("fromAmount", amount.toString());
  url.searchParams.set("fromAddress", request.account);
  url.searchParams.set("toAddress", request.recipient);
  url.searchParams.set("slippage", String(request.slippageBps / 10_000));
  return url;
}

export function statusUrl(
  settlement: Extract<RouteSettlement, { kind: "lifi" }>,
  sourceTxHash: Hex,
) {
  const url = new URL(`${LIFI_API_BASE_URL}/status`);
  url.searchParams.set("txHash", sourceTxHash);
  url.searchParams.set("toChain", String(settlement.destinationChainId));
  url.searchParams.set("bridge", settlement.tool);
  return url;
}

function isNoRouteResponse(status: number, body: unknown) {
  if (status === 404) return true;
  if (status !== 400 && status !== 422) return false;
  if (!isRecord(body)) return false;
  const text = [body.code, body.error, body.message]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return /no route|route not found|no available route|could not find route/.test(
    text,
  );
}

async function requestProviderJson(
  url: URL,
  operation: "quote" | "status",
  signal?: AbortSignal,
) {
  let response: Response;
  try {
    response = await globalThis.fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw providerError(`LI.FI ${operation} service is unavailable.`, error);
  }

  let body: unknown;
  try {
    body = JSON.parse(await response.text());
  } catch {
    if (!response.ok) throw providerError(`LI.FI ${operation} request failed.`);
    throw providerError(`LI.FI returned malformed ${operation} data.`);
  }
  return { body, response };
}

export async function fetchProviderJson(
  url: URL,
  operation: "quote" | "status",
  signal?: AbortSignal,
) {
  const { body, response } = await requestProviderJson(url, operation, signal);
  if (!response.ok) {
    if (response.status === 429) {
      throw providerError(
        "LI.FI public API is rate-limited. Try again shortly.",
      );
    }
    if (isNoRouteResponse(response.status, body)) {
      throw new RouteAdapterError("lifi", "no_route", "LI.FI found no route.");
    }
    throw providerError(`LI.FI ${operation} request failed.`);
  }
  return body;
}
