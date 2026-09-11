import type { NormalizedRouteQuote, RouteFeeLine } from "@/lib/routes/types";

export type MarketQuote = {
  fees: RouteFeeLine[];
  input: string;
  inputSymbol: string;
  minimumReceived: string;
  networkFee: string;
  output: string;
  providerLabel: string;
  sourceGasFeeToken: string;
  sourceGasSponsored: boolean;
  executionDurationSeconds?: number;
};

export type RouteQuoteApiResponse = {
  error?: string;
  selected?: NormalizedRouteQuote;
};

export type InlineAlert = {
  description: string;
  key: string;
  title: string;
} | null;
