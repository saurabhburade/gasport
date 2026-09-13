import { type Address, zeroAddress } from "viem";
import { DEFAULT_SLIPPAGE_BPS } from "@/components/gas/workspace/constants";
import type { DestinationChain } from "@/config/chains";
import type {
  NormalizedRouteQuote,
  RouteQuoteRequest,
} from "@/lib/routes/types";
import type { Token } from "@/types/tokens";

export function marketQuoteExpiry(response: NormalizedRouteQuote) {
  const parsed = Date.parse(response.expiresAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function feeRateLabel(rateBps?: number) {
  if (rateBps === undefined || !Number.isFinite(rateBps)) return undefined;
  const percent = rateBps / 100;
  return `${percent < 0.01 ? percent.toFixed(4) : percent.toFixed(2)}%`;
}

export function routeQuoteRequest({
  account,
  amount,
  destination,
  recipient,
  sponsorshipRequired,
  token,
}: {
  account: Address;
  amount: bigint;
  destination: DestinationChain;
  recipient: Address;
  sponsorshipRequired: boolean;
  token: Token;
}): RouteQuoteRequest {
  if (!destination.intentsAssetId) {
    throw new Error(
      `${destination.name} does not currently expose a native gas asset in the NEAR Intents token catalog.`,
    );
  }
  return {
    account,
    amount: amount.toString(),
    deadline: new Date(Date.now() + 10 * 60_000).toISOString(),
    destinationAsset: {
      address: zeroAddress,
      assetId: destination.intentsAssetId,
      chainId: destination.id,
      decimals: 18,
      symbol: destination.symbol,
    },
    recipient,
    refundAddress: account,
    slippageBps: DEFAULT_SLIPPAGE_BPS,
    sponsorshipRequired,
    sourceAsset: {
      address: token.address,
      assetId: token.intentsAssetId,
      chainId: token.chainId,
      decimals: token.decimals,
      symbol: token.symbol,
    },
  };
}

export function formatReceive(value: string) {
  const [whole, fractional = ""] = value.split(".");
  return `${whole}.${fractional.padEnd(5, "0").slice(0, 5)}`;
}

export function formatBalance(value?: string) {
  if (!value) return "-";
  const [whole, fractional = ""] = value.split(".");
  const compactFraction = fractional.slice(0, 6).replace(/0+$/, "");
  return compactFraction ? `${whole}.${compactFraction}` : whole;
}

export function formatAddress(address: string) {
  if (!address) return "Add a destination address";
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

export function formatExecutionDuration(seconds?: number) {
  if (seconds === undefined || !Number.isFinite(seconds)) return "-";
  if (seconds < 60) return `~${Math.ceil(seconds)} sec`;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return remainingSeconds
    ? `~${minutes} min ${remainingSeconds} sec`
    : `~${minutes} min`;
}

export function formatUsd(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  if (amount > 0 && amount < 0.0001) return "<$0.0001";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount);
}

export function formatTokenFee(value: number | string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  if (amount > 0 && amount < 0.0001) return "<0.0001";
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 4,
  }).format(amount);
}
