import type { Address, Hex } from "viem";

export const ROUTE_PROVIDER_IDS = ["near-1click", "lifi"] as const;

export type RouteProviderId = (typeof ROUTE_PROVIDER_IDS)[number];

export type RouteAsset = {
  address: Address;
  assetId: string;
  chainId: number;
  decimals: number;
  symbol: string;
};

export type RouteQuoteRequest = {
  account: Address;
  amount: string;
  deadline: string;
  destinationAsset: RouteAsset;
  recipient: Address;
  refundAddress: Address;
  slippageBps: number;
  sponsorshipRequired: boolean;
  sourceAsset: RouteAsset;
};

export type RouteFeeKind = "provider" | "protocol" | "platform" | "source-gas";

export type RouteFeeLine = {
  /** Human-readable decimal amount in the fee token's own units. */
  amount: string;
  deductedFromInput: boolean;
  kind: RouteFeeKind;
  label: string;
  rateBps?: number;
  token: Pick<RouteAsset, "decimals" | "symbol">;
};

export type NormalizedRouteQuote = {
  amountIn: string;
  amountInFormatted: string;
  amountInUsd?: string;
  amountOut: string;
  amountOutFormatted: string;
  amountOutUsd?: string;
  durationSeconds?: number;
  expiresAt: string;
  fees: RouteFeeLine[];
  minAmountOut: string;
  provider: RouteProviderId;
  providerQuoteId: string;
};

export type RouteCall = {
  data: Hex;
  to: Address;
  value: Hex;
};

export type RouteSettlement =
  | {
      depositAddress: Address;
      depositMemo?: string;
      kind: "near-1click";
      quoteId: string;
    }
  | {
      destinationChainId: number;
      kind: "lifi";
      tool: string;
    };

export type PreparedRoute = {
  calls: RouteCall[];
  provider: RouteProviderId;
  quote: NormalizedRouteQuote;
  settlement: RouteSettlement;
  sourceChainId: number;
};

export type RouteExecutionStatus =
  | {
      kind: "pending";
    }
  | {
      destinationTxHash?: Hex;
      explorerUrl?: string;
      kind: "success";
    }
  | {
      explorerUrl?: string;
      kind: "failed";
      message: string;
    };

export interface RouteAdapter {
  readonly id: RouteProviderId;
  getQuote(request: RouteQuoteRequest): Promise<NormalizedRouteQuote>;
  prepare(request: RouteQuoteRequest): Promise<PreparedRoute>;
  getStatus(
    settlement: RouteSettlement,
    sourceTxHash: Hex,
  ): Promise<RouteExecutionStatus>;
}

export class RouteAdapterError extends Error {
  readonly provider: RouteProviderId;
  readonly code:
    | "invalid_request"
    | "no_route"
    | "provider_error"
    | "unsupported";
  override readonly cause?: unknown;

  constructor(
    provider: RouteProviderId,
    code: "invalid_request" | "no_route" | "provider_error" | "unsupported",
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "RouteAdapterError";
    this.provider = provider;
    this.code = code;
    this.cause = cause;
  }
}
