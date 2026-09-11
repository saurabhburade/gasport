import { lifiAdapter } from "@/lib/routes/adapters/lifi";
import { nearOneClickAdapter } from "@/lib/routes/adapters/near-oneclick";
import {
  type NormalizedRouteQuote,
  type RouteAdapter,
  RouteAdapterError,
  type RouteProviderId,
  type RouteQuoteRequest,
} from "@/lib/routes/types";

const adapterById: Readonly<Record<RouteProviderId, RouteAdapter>> = {
  "near-1click": nearOneClickAdapter,
  lifi: lifiAdapter,
};

export function getRouteAdapter(provider: RouteProviderId) {
  return adapterById[provider];
}

export type RouteQuoteFailure = {
  code: RouteAdapterError["code"];
  message: string;
  provider: RouteProviderId;
};

function quoteFailure(
  provider: RouteProviderId,
  error: unknown,
): RouteQuoteFailure {
  if (error instanceof RouteAdapterError) {
    return { provider, code: error.code, message: error.message };
  }
  return {
    provider,
    code: "provider_error",
    message: `${provider} could not produce a quote.`,
  };
}

function compareQuotes(
  first: NormalizedRouteQuote,
  second: NormalizedRouteQuote,
) {
  const outputDifference = BigInt(second.amountOut) - BigInt(first.amountOut);
  if (outputDifference !== 0n) return outputDifference > 0n ? 1 : -1;
  return (
    (first.durationSeconds ?? Number.POSITIVE_INFINITY) -
    (second.durationSeconds ?? Number.POSITIVE_INFINITY)
  );
}

export async function getRouteQuotes(
  request: RouteQuoteRequest,
  provider: RouteProviderId | "auto" = "auto",
) {
  const adapters =
    provider === "auto"
      ? Object.values(adapterById)
      : [getRouteAdapter(provider)];
  const results = await Promise.allSettled(
    adapters.map((adapter) => adapter.getQuote(request)),
  );
  const quotes: NormalizedRouteQuote[] = [];
  const failures: RouteQuoteFailure[] = [];

  results.forEach((result, index) => {
    const adapter = adapters[index];
    if (!adapter) return;
    if (result.status === "fulfilled") quotes.push(result.value);
    else failures.push(quoteFailure(adapter.id, result.reason));
  });
  quotes.sort(compareQuotes);

  return { failures, quotes, selected: quotes[0] };
}
