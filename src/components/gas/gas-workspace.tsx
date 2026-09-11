"use client";

import { useAppKit, useAppKitAccount } from "@reown/appkit/react";
import {
  Check,
  CircleAlert,
  CircleHelp,
  Copy,
  ExternalLink,
  LoaderCircle,
  Pencil,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type Address,
  formatUnits,
  isAddress,
  parseUnits,
  zeroAddress,
} from "viem";
import { useBalance } from "wagmi";
import { DashboardShell } from "@/components/dashboard-shell";
import { TransactionHistory } from "@/components/gas/transaction-history";
import { TransactionStatus } from "@/components/gas/transaction-status";
import { BouncyAccordion } from "@/components/motion/bouncy-accordion";
import { ThemeToggle } from "@/components/motion/theme-toggle";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { WalletButton } from "@/components/wallet/wallet-button";
import { appKitProjectId } from "@/config/appkit";
import { CHAIN_LIST, type DestinationChain } from "@/config/chains";
import { supportedTokens } from "@/config/tokens";
import {
  type GasExecutionResult,
  type RouteExecutionInput,
  useGasExecution,
} from "@/hooks/use-gas-execution";
import { useSourceTokens } from "@/hooks/use-source-tokens";
import {
  hasInsufficientBalance,
  normalizeAmountInput,
} from "@/lib/amount-input";
import {
  getExecutionRetryAction,
  isConfirmationDialogOpen,
  shouldFetchQuotes,
  shouldResetExecutionOnDialogClose,
  shouldResetExecutionOnDraftChange,
} from "@/lib/gas/confirmation-dialog-state";
import type { SourceGasEstimate } from "@/lib/gas/source-gas";
import { calculateNetRouteAmount } from "@/lib/gas/source-gas-amount";
import type {
  NormalizedRouteQuote,
  PreparedRoute,
  RouteFeeLine,
  RouteProviderId,
  RouteQuoteRequest,
} from "@/lib/routes/types";
import {
  normalizeTokenLogoUri,
  trustWalletTokenLogoUri,
} from "@/lib/tokens/logo-uri";
import { tokenKey } from "@/lib/tokens/source-catalog";
import { getVirtualLayout } from "@/lib/tokens/virtual-list";
import type { GasFlowState, GasQuote } from "@/types/gas";
import type { Token } from "@/types/tokens";

const demoMode = process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE !== "false";
const demoWalletAddress =
  "0x71b000000000000000000000000000000000c84e" as Address;
const defaultToken =
  supportedTokens.find(
    (token) => token.chainId === 8453 && token.symbol === "USDC",
  ) ?? supportedTokens[0];
const defaultDestination =
  CHAIN_LIST.find((chain) => chain.id === 42161) ?? CHAIN_LIST[0];
const DEFAULT_SLIPPAGE_BPS = 100;

const progressIndex: Partial<Record<GasFlowState, number>> = {
  switching_network: 0,
  wallet_signature: 0,
  submitting: 1,
  deposit_pending: 1,
  solver_executing: 2,
  completed: 3,
};

type MarketQuote = {
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

type RouteQuoteApiResponse = {
  error?: string;
  selected?: NormalizedRouteQuote;
};

const providerLabelById: Record<RouteProviderId, string> = {
  "near-1click": "NEAR 1Click",
  lifi: "LI.FI",
};
const MAX_TOKEN_INPUT = "10000";
const QUOTE_DEBOUNCE_MS = 450;

function marketQuoteExpiry(response: NormalizedRouteQuote) {
  const parsed = Date.parse(response.expiresAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

function feeRateLabel(rateBps?: number) {
  if (rateBps === undefined || !Number.isFinite(rateBps)) return undefined;
  const percent = rateBps / 100;
  return `${percent < 0.01 ? percent.toFixed(4) : percent.toFixed(2)}%`;
}

function routeQuoteRequest({
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

function formatReceive(value: string) {
  const [whole, fractional = ""] = value.split(".");
  return `${whole}.${fractional.padEnd(5, "0").slice(0, 5)}`;
}

function formatBalance(value?: string) {
  if (!value) return "—";
  const [whole, fractional = ""] = value.split(".");
  const compactFraction = fractional.slice(0, 6).replace(/0+$/, "");
  return compactFraction ? `${whole}.${compactFraction}` : whole;
}

function formatAddress(address: string) {
  if (!address) return "Add a destination address";
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function formatExecutionDuration(seconds?: number) {
  if (seconds === undefined || !Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `~${Math.ceil(seconds)} sec`;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return remainingSeconds
    ? `~${minutes} min ${remainingSeconds} sec`
    : `~${minutes} min`;
}

function formatUsd(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  if (amount > 0 && amount < 0.0001) return "<$0.0001";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount);
}

function formatTokenFee(value: number | string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  if (amount > 0 && amount < 0.0001) return "<0.0001";
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 4,
  }).format(amount);
}

const tokenIconBySymbol: Record<string, string> = {
  DAI: "/assets/tokens/dai.png",
  USDC: "/assets/tokens/usdc.png",
  USDT: "/assets/tokens/usdt.png",
  USDT0: "/assets/tokens/usdt.png",
};

function ChainIcon({
  chain,
  className,
  pixels,
}: {
  chain: DestinationChain;
  className: string;
  pixels: number;
}) {
  const [failedLogoURIs, setFailedLogoURIs] = useState<string[]>([]);
  const icon = failedLogoURIs.includes(chain.logoURI)
    ? undefined
    : chain.logoURI;
  return icon ? (
    <Image
      alt={`${chain.name} logo`}
      className={className}
      height={pixels}
      onError={() => {
        setFailedLogoURIs((current) =>
          current.includes(icon) ? current : [...current, icon],
        );
      }}
      sizes={`${pixels}px`}
      src={icon}
      width={pixels}
    />
  ) : (
    <span
      aria-label={`${chain.name} logo`}
      className={`${className} flex items-center justify-center text-[9px] font-bold uppercase`}
      role="img"
      style={{
        backgroundColor: chain.accent,
        color: chain.id === 534352 ? "#1f1f1f" : "#ffffff",
      }}
    >
      {chain.shortName.slice(0, 2)}
    </span>
  );
}

function TokenMark({
  token,
  size = "default",
}: {
  token: Token;
  size?: "default" | "small" | "tiny";
}) {
  const tokenListIcon = normalizeTokenLogoUri(token.logoUri);
  const trustWalletIcon = trustWalletTokenLogoUri(token);
  const [failedIcons, setFailedIcons] = useState<string[]>([]);
  const icon = [
    trustWalletIcon,
    tokenListIcon,
    tokenIconBySymbol[token.symbol.toUpperCase()],
  ].find((candidate) => candidate && !failedIcons.includes(candidate));
  const tokenChain = CHAIN_LIST.find((chain) => chain.id === token.chainId);
  const dimensions =
    size === "tiny"
      ? { token: "size-6", network: "size-3", pixels: 24, networkPixels: 12 }
      : size === "small"
        ? {
            token: "size-7",
            network: "size-3.5",
            pixels: 28,
            networkPixels: 14,
          }
        : { token: "size-9", network: "size-4", pixels: 36, networkPixels: 16 };
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center ${dimensions.token}`}
    >
      {icon ? (
        <Image
          alt={`${token.name} logo`}
          className={`${dimensions.token} rounded-full`}
          height={dimensions.pixels}
          onError={() => {
            setFailedIcons((current) =>
              current.includes(icon) ? current : [...current, icon],
            );
          }}
          sizes={`${dimensions.pixels}px`}
          src={icon}
          width={dimensions.pixels}
        />
      ) : (
        <span
          aria-label={`${token.name} logo`}
          className={`flex ${dimensions.token} items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-background`}
          role="img"
        >
          {token.symbol.slice(0, 3).toUpperCase()}
        </span>
      )}
      {tokenChain && token.chainId !== 1 && (
        <ChainIcon
          chain={tokenChain}
          className={`absolute -bottom-0.5 -right-0.5 ${dimensions.network} rounded-full border-2 border-secondary`}
          pixels={dimensions.networkPixels}
        />
      )}
    </span>
  );
}

function ChainMark({
  chain,
  size = "md",
}: {
  chain: DestinationChain;
  size?: "sm" | "md" | "lg";
}) {
  const pixels = size === "lg" ? 48 : size === "sm" ? 28 : 36;
  return (
    <ChainIcon
      chain={chain}
      className={
        size === "lg"
          ? "size-12 rounded-full"
          : size === "sm"
            ? "size-7 rounded-full"
            : "size-9 rounded-full"
      }
      pixels={pixels}
    />
  );
}

function NativeGasMark({ chain }: { chain: DestinationChain }) {
  const ethereumChain = CHAIN_LIST[0];
  const primaryChain = chain.symbol === "ETH" ? ethereumChain : chain;
  return (
    <span className="relative block size-9 shrink-0">
      <ChainIcon
        chain={primaryChain}
        className="size-9 rounded-full"
        pixels={36}
      />
      {chain.symbol === "ETH" && chain.id !== 1 && (
        <ChainIcon
          chain={chain}
          className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full border-2 border-secondary"
          pixels={16}
        />
      )}
    </span>
  );
}

export function GasWorkspace() {
  const { open: openAppKit } = useAppKit();
  const appKitAccount = useAppKitAccount();
  const reduceMotion = useReducedMotion();
  const walletAddress = appKitAccount.address as Address | undefined;
  const [demoConnected, setDemoConnected] = useState(false);
  const connected = appKitProjectId ? appKitAccount.isConnected : demoConnected;
  const [token, setToken] = useState<Token>(defaultToken);
  const [destination, setDestination] =
    useState<DestinationChain>(defaultDestination);
  const [amount, setAmount] = useState("5");
  const [state, setState] = useState<GasFlowState>("wallet_required");
  const [error, setError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);
  const [picker, setPicker] = useState<"token" | "destination" | null>(null);
  const [assetQuery, setAssetQuery] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [destinationAddressEdited, setDestinationAddressEdited] =
    useState(false);
  const [destinationAddressDialogOpen, setDestinationAddressDialogOpen] =
    useState(false);
  const [destinationAddressDraft, setDestinationAddressDraft] = useState("");
  const [destinationAddressError, setDestinationAddressError] = useState<
    string | null
  >(null);
  const [liveQuote, setLiveQuote] = useState<NormalizedRouteQuote | null>(null);
  const [sourceGasEstimate, setSourceGasEstimate] =
    useState<SourceGasEstimate | null>(null);
  const [quoteStatus, setQuoteStatus] = useState<
    "idle" | "loading" | "ready" | "error" | "invalid"
  >("idle");
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteRefreshKey, setQuoteRefreshKey] = useState(0);
  const [isPreparingDeposit, setIsPreparingDeposit] = useState(false);
  const [isExecutionDialogDismissed, setIsExecutionDialogDismissed] =
    useState(false);
  const [resumeExecutionAfterConnect, setResumeExecutionAfterConnect] =
    useState(false);
  const [activeView, setActiveView] = useState<
    "get-gas" | "transactions" | "tx-status"
  >("get-gas");
  const execution = useGasExecution();
  const quoteUpdatesEnabled = shouldFetchQuotes(state);
  const sourceTokens = useSourceTokens(walletAddress);
  const sourceChain =
    CHAIN_LIST.find((chain) => chain.id === token.chainId) ?? CHAIN_LIST[0];
  const sourceBalanceValue = sourceTokens.balanceByTokenKey[tokenKey(token)];
  const connectedWalletAddress =
    walletAddress ?? (demoConnected ? demoWalletAddress : undefined);
  const quoteWalletAddress = connectedWalletAddress ?? demoWalletAddress;
  const recipientAddress = destinationAddressEdited
    ? isAddress(destinationAddress)
      ? (destinationAddress as Address)
      : undefined
    : quoteWalletAddress;
  const destinationBalanceAddress = destinationAddressEdited
    ? recipientAddress
    : connectedWalletAddress;
  const destinationBalance = useBalance({
    address: destinationBalanceAddress,
    chainId: destination.id,
    query: { enabled: Boolean(destinationBalanceAddress) },
  });
  const sourceBalanceFormatted =
    sourceBalanceValue !== undefined
      ? formatUnits(sourceBalanceValue, token.decimals)
      : undefined;
  const hardInputLimit = parseUnits(MAX_TOKEN_INPUT, token.decimals);
  const inputLimit = hardInputLimit;
  const destinationBalanceFormatted = destinationBalance.data
    ? formatUnits(
        destinationBalance.data.value,
        destinationBalance.data.decimals,
      )
    : undefined;

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("gas-theme");
    const nextTheme =
      savedTheme === "dark" ||
      (savedTheme === null &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    setIsDark(nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme);
  }, []);

  useEffect(() => {
    if (connectedWalletAddress && !destinationAddressEdited) {
      setDestinationAddress(connectedWalletAddress);
    }
  }, [connectedWalletAddress, destinationAddressEdited]);

  const toggleTheme = () => {
    setIsDark((current) => {
      const nextTheme = !current;
      document.documentElement.classList.toggle("dark", nextTheme);
      window.localStorage.setItem("gas-theme", nextTheme ? "dark" : "light");
      return nextTheme;
    });
  };

  useEffect(() => {
    if (!quoteUpdatesEnabled) return;

    let inputAmount: bigint;
    try {
      inputAmount = parseUnits(amount.trim(), token.decimals);
      if (inputAmount <= BigInt(0)) throw new Error("invalid amount");
    } catch {
      setLiveQuote(null);
      setSourceGasEstimate(null);
      setQuoteStatus("idle");
      setQuoteError(null);
      return;
    }

    const controller = new AbortController();
    setLiveQuote(null);
    setSourceGasEstimate(null);
    setError(null);
    setQuoteError(null);
    if (inputAmount > inputLimit) {
      setQuoteStatus("invalid");
      setQuoteError(`Maximum input is 10,000 ${token.symbol}.`);
      return;
    }

    if (!recipientAddress) {
      setQuoteStatus("idle");
      return;
    }

    setQuoteStatus("loading");
    const timer = window.setTimeout(async () => {
      try {
        const gasResponse = await fetch("/api/gas/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            account: quoteWalletAddress,
            amount: inputAmount.toString(),
            chainId: token.chainId,
            quoteOnly: true,
            token: token.address,
          }),
        });
        const gasEstimate = (await gasResponse.json()) as SourceGasEstimate & {
          error?: string;
        };
        if (!gasResponse.ok) {
          throw new Error(
            gasEstimate.error ?? "Source gas estimate is unavailable.",
          );
        }
        const feeAmount = BigInt(gasEstimate.feeAmount);
        const quotedAmount = calculateNetRouteAmount({
          grossAmount: inputAmount,
          sponsorshipFee: feeAmount,
        });
        const response = await fetch(
          `/api/routes/quote?refresh=${quoteRefreshKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              ...routeQuoteRequest({
                account: quoteWalletAddress,
                amount: quotedAmount,
                destination,
                recipient: recipientAddress,
                sponsorshipRequired: gasEstimate.sponsorshipRequired,
                token,
              }),
              provider: "auto",
            }),
          },
        );
        const body = (await response.json()) as RouteQuoteApiResponse;
        if (!response.ok)
          throw new Error(body.error ?? "Quote request failed.");
        if (!body.selected)
          throw new Error("No route provider returned a usable quote.");
        if (marketQuoteExpiry(body.selected) <= Date.now())
          throw new Error("The route provider returned an expired quote.");
        setSourceGasEstimate(gasEstimate);
        setLiveQuote(body.selected);
        setQuoteStatus("ready");
      } catch (requestError) {
        if (controller.signal.aborted) return;
        setLiveQuote(null);
        setSourceGasEstimate(null);
        setQuoteStatus("error");
        setQuoteError(
          requestError instanceof Error
            ? requestError.message
            : "Live quote is unavailable.",
        );
      }
    }, QUOTE_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [
    amount,
    destination,
    inputLimit,
    quoteRefreshKey,
    recipientAddress,
    token,
    quoteWalletAddress,
    quoteUpdatesEnabled,
  ]);

  useEffect(() => {
    if (!quoteUpdatesEnabled || !liveQuote || quoteStatus !== "ready") return;
    const expiresAt = marketQuoteExpiry(liveQuote);
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      setLiveQuote(null);
      setQuoteRefreshKey((current) => current + 1);
      return;
    }
    const timer = window.setTimeout(() => {
      setLiveQuote(null);
      setQuoteRefreshKey((current) => current + 1);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [liveQuote, quoteStatus, quoteUpdatesEnabled]);

  useEffect(() => {
    if (!quoteUpdatesEnabled || quoteStatus !== "error") return;
    const timer = window.setTimeout(() => {
      setQuoteRefreshKey((current) => current + 1);
    }, 10_000);
    return () => window.clearTimeout(timer);
  }, [quoteStatus, quoteUpdatesEnabled]);

  const quote = useMemo<GasQuote | null>(() => {
    if (!liveQuote || !destination.intentsAssetId) return null;
    return {
      inputAmount: BigInt(liveQuote.amountIn),
      outputAmount: BigInt(liveQuote.amountOut),
      inputToken: token,
      outputToken: {
        address: zeroAddress,
        symbol: destination.symbol,
        name: `${destination.name} gas`,
        decimals: destination.decimals,
        chainId: destination.id,
        intentsAssetId: destination.intentsAssetId,
      },
      estimatedGasReceived: liveQuote.amountOutFormatted,
      quoteId: liveQuote.providerQuoteId,
      expiresAt: marketQuoteExpiry(liveQuote),
    };
  }, [destination, liveQuote, token]);

  const marketQuote = useMemo<MarketQuote | undefined>(() => {
    if (!quote || !liveQuote || !sourceGasEstimate) return undefined;
    const inputUsd = Number(liveQuote.amountInFormatted);
    const outputUsd = Number(liveQuote.amountOutUsd);
    const routeCostUsd =
      Number.isFinite(inputUsd) && Number.isFinite(outputUsd)
        ? Math.max(0, inputUsd - outputUsd)
        : 0;
    return {
      fees: liveQuote.fees,
      input: formatUnits(
        BigInt(liveQuote.amountIn) + BigInt(sourceGasEstimate.feeAmount),
        token.decimals,
      ),
      inputSymbol: token.symbol,
      minimumReceived: formatReceive(
        formatUnits(BigInt(liveQuote.minAmountOut), quote.outputToken.decimals),
      ),
      networkFee: formatUsd(
        (routeCostUsd + Number(sourceGasEstimate.feeUsd)).toString(),
      ),
      output: formatReceive(liveQuote.amountOutFormatted),
      providerLabel: providerLabelById[liveQuote.provider],
      sourceGasFeeToken: formatTokenFee(sourceGasEstimate.feeAmountFormatted),
      sourceGasSponsored: sourceGasEstimate.sponsorshipRequired,
      executionDurationSeconds: liveQuote.durationSeconds,
    };
  }, [liveQuote, quote, sourceGasEstimate, token]);

  useEffect(() => {
    if (!connected) return;
    if (state === "wallet_required" || state === "idle") setState("quoted");
  }, [connected, state]);

  useEffect(() => {
    if (execution.flowState === "idle") {
      setState((current) =>
        progressIndex[current] !== undefined || current === "failed"
          ? "quoted"
          : current,
      );
      return;
    }
    setState(execution.flowState);
    setIsExecutionDialogDismissed(false);
  }, [execution.flowState]);

  useEffect(() => {
    if (
      !resumeExecutionAfterConnect ||
      !execution.walletReady ||
      !execution.isResumable ||
      execution.isExecuting
    ) {
      return;
    }
    setResumeExecutionAfterConnect(false);
    setError(null);
    setIsExecutionDialogDismissed(false);
    execution.retry();
  }, [
    execution.isExecuting,
    execution.isResumable,
    execution.retry,
    execution.walletReady,
    resumeExecutionAfterConnect,
  ]);

  const connect = () => {
    setDemoConnected(true);
    setError(null);
    setState("quoted");
  };
  const getGas = () => {
    setError(null);
    if (!connected) {
      if (appKitProjectId) {
        void openAppKit({ view: "Connect" }).catch(() => {
          setError(
            "Couldn't open the wallet connection. Refresh the page and try again.",
          );
        });
      } else {
        connect();
      }
      return;
    }
    if (!quote) {
      if (quoteStatus === "idle") {
        setError("Enter an amount greater than zero to request a quote.");
      } else if (quoteStatus === "loading") {
        setError("A live quote is still loading. Please wait a moment.");
      } else {
        setError(quoteError ?? "A market quote is currently unavailable.");
      }
      return;
    }
    if (demoMode || !walletAddress) {
      setError(
        "Demo mode is enabled, so this request will not submit a real transaction. Set NEXT_PUBLIC_ENABLE_DEMO_MODE=false and connect a wallet to enable deposits.",
      );
      return;
    }
    if (sourceBalanceValue === undefined) {
      setError("Wallet balance is still loading. Try again in a moment.");
      return;
    }
    const totalInputAmount =
      quote.inputAmount + BigInt(sourceGasEstimate?.feeAmount ?? "0");
    if (totalInputAmount > sourceBalanceValue) {
      return;
    }
    if (!sourceGasEstimate?.executionAvailable) {
      setError(
        sourceGasEstimate?.executionError ??
          `Fund the connected wallet with native ${sourceChain.symbol} before continuing.`,
      );
      return;
    }
    if (execution.isResumable) {
      setError(
        "Finish or retry the existing deposit before starting another one.",
      );
      setState("failed");
      setIsExecutionDialogDismissed(false);
      return;
    }
    setState("confirming");
  };
  const reset = () => {
    execution.reset();
    setResumeExecutionAfterConnect(false);
    setState(connected ? "quoted" : "wallet_required");
    setError(null);
    setIsExecutionDialogDismissed(false);
  };
  const resetDraftPresentation = () => {
    setError(null);
    if (shouldResetExecutionOnDraftChange(state)) {
      reset();
    }
  };
  const confirmDeposit = async () => {
    if (!quote || !walletAddress || !recipientAddress || !sourceGasEstimate)
      return;
    setError(null);
    setIsPreparingDeposit(true);
    try {
      const response = await fetch("/api/routes/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...routeQuoteRequest({
            account: walletAddress,
            amount: quote.inputAmount,
            destination,
            recipient: recipientAddress,
            sponsorshipRequired: sourceGasEstimate.sponsorshipRequired,
            token,
          }),
          provider: liveQuote?.provider,
        }),
      });
      const body = (await response.json()) as PreparedRoute & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? "Could not prepare the selected route.");
      }
      if (
        !liveQuote ||
        body.provider !== liveQuote.provider ||
        body.quote.provider !== liveQuote.provider ||
        body.sourceChainId !== token.chainId ||
        body.quote.amountIn !== quote.inputAmount.toString() ||
        !Array.isArray(body.calls) ||
        body.calls.length === 0
      ) {
        throw new Error(
          "The prepared route does not match this request. No transaction was submitted.",
        );
      }
      if (marketQuoteExpiry(body.quote) <= Date.now()) {
        throw new Error(
          "The prepared route expired before confirmation. No transaction was submitted.",
        );
      }
      setLiveQuote(body.quote);
      const executionInput: RouteExecutionInput = {
        ...body,
        sponsorshipRequired: sourceGasEstimate.sponsorshipRequired,
        ...(sourceGasEstimate.sponsorshipRequired
          ? {
              sourceGasFee: {
                amount: BigInt(sourceGasEstimate.feeAmount),
                recipient: sourceGasEstimate.feeRecipient as Address,
                token: token.address,
              },
            }
          : {}),
      };
      execution.start(executionInput);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not prepare the selected route.",
      );
      setState("confirming");
    } finally {
      setIsPreparingDeposit(false);
    }
  };
  const openDestinationAddressDialog = () => {
    setDestinationAddressDraft(destinationAddress);
    setDestinationAddressError(null);
    setDestinationAddressDialogOpen(true);
  };
  const saveDestinationAddress = () => {
    const nextAddress = destinationAddressDraft.trim();
    if (!isAddress(nextAddress)) {
      setDestinationAddressError("Enter a valid EVM wallet address.");
      return;
    }
    setDestinationAddressEdited(true);
    setDestinationAddress(nextAddress);
    resetDraftPresentation();
    setDestinationAddressDialogOpen(false);
  };

  const visibleError = error ?? (state === "failed" ? execution.error : null);
  const requiredSourceAmount = quote
    ? quote.inputAmount + BigInt(sourceGasEstimate?.feeAmount ?? "0")
    : undefined;
  const insufficientBalance = hasInsufficientBalance({
    connected,
    requiredAmount: requiredSourceAmount,
    walletBalance: sourceBalanceValue,
  });
  const sourceGasUnavailable = Boolean(
    connected &&
      quoteStatus === "ready" &&
      sourceGasEstimate &&
      !sourceGasEstimate.executionAvailable,
  );
  const availableSourceGas = sourceGasEstimate
    ? formatBalance(
        formatUnits(
          BigInt(sourceGasEstimate.nativeBalanceWei),
          sourceChain.decimals,
        ),
      )
    : "—";
  const requiredSourceGas = sourceGasEstimate
    ? formatBalance(
        formatUnits(
          BigInt(sourceGasEstimate.requiredNativeWei),
          sourceChain.decimals,
        ),
      )
    : "—";
  const inlineAlert =
    (quoteStatus === "error" || quoteStatus === "invalid") && quoteError
      ? {
          description: quoteError,
          key: "quote-error",
          title:
            quoteStatus === "invalid"
              ? "Maximum input exceeded"
              : "Quote unavailable",
        }
      : insufficientBalance
        ? {
            description: `Available ${formatBalance(sourceBalanceFormatted)} ${token.symbol}; ${formatBalance(
              requiredSourceAmount === undefined
                ? undefined
                : formatUnits(requiredSourceAmount, token.decimals),
            )} ${token.symbol} required.`,
            key: "insufficient-balance",
            title: "Insufficient balance",
          }
        : sourceGasUnavailable
          ? {
              description: `Available ${availableSourceGas} ${sourceChain.symbol}; ${requiredSourceGas} ${sourceChain.symbol} required. Add ${sourceChain.symbol} or enable gas sponsorship for ${sourceChain.name}.`,
              key: "insufficient-source-gas",
              title: `Insufficient ${sourceChain.symbol} for gas`,
            }
          : error &&
              (state === "wallet_required" ||
                state === "idle" ||
                state === "quoted")
            ? {
                description: error,
                key: "action-error",
                title: "Unable to continue",
              }
            : null;

  return (
    <DashboardShell
      actions={
        <div className="flex items-center gap-2">
          <ThemeToggle isDark={isDark} onToggle={toggleTheme} />
          <WalletButton
            isDemoConnected={demoConnected}
            onDemoConnect={connect}
          />
        </div>
      }
      navigation={[
        {
          active: activeView === "get-gas",
          label: "Gasport",
          onClick: () => setActiveView("get-gas"),
        },
      ]}
    >
      <main
        className={`mx-auto flex w-full flex-1 flex-col items-center justify-center py-8 ${activeView === "transactions" ? "max-w-[760px]" : "max-w-[440px]"}`}
      >
        {activeView === "transactions" ? (
          <TransactionHistory address={walletAddress} />
        ) : activeView === "tx-status" ? (
          <TransactionStatus destination={destination} flowState={state} />
        ) : (
          <Card
            size="sm"
            className="w-full gap-0 border-border bg-card py-0 shadow-none"
          >
            <CardContent className="flex flex-col px-3 py-3 sm:px-4 sm:py-4">
              <div className="rounded-2xl border-[0.75px] border-border/30 bg-muted/40 p-4 transition-colors focus-within:bg-muted/55">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Input
                      id="amount"
                      aria-label="Amount"
                      autoComplete="off"
                      className="h-auto min-w-0 rounded-none border-0 bg-transparent p-0 text-4xl font-semibold tracking-[-0.07em] shadow-none focus-visible:border-0 focus-visible:ring-0 aria-invalid:!border-0 aria-invalid:!ring-0 md:text-4xl"
                      inputMode="decimal"
                      max={formatUnits(inputLimit, token.decimals)}
                      pattern="[0-9]*[.]?[0-9]*"
                      aria-invalid={quoteStatus === "invalid"}
                      value={amount}
                      onChange={(event) => {
                        setAmount(
                          normalizeAmountInput(
                            event.target.value,
                            token.decimals,
                          ),
                        );
                        resetDraftPresentation();
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    className="flex min-h-11 max-w-fit shrink-0 items-center gap-2 rounded-full border-[0.75px] border-foreground/5 bg-foreground/[0.02] px-3 py-1.5 transition-opacity hover:opacity-80 dark:bg-secondary"
                    onClick={() => {
                      setAssetQuery("");
                      setPicker("token");
                    }}
                  >
                    <TokenMark token={token} />
                    <span className="text-left">
                      <span className="block text-sm font-semibold">
                        {token.symbol}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {sourceChain.name}
                      </span>
                    </span>
                  </button>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                  {quoteStatus === "loading" ? (
                    <Skeleton className="h-4 w-12" />
                  ) : (
                    <span className="tabular-nums">
                      {liveQuote?.amountInUsd
                        ? formatUsd(liveQuote.amountInUsd)
                        : formatUsd("0")}
                    </span>
                  )}
                  <span className="ml-auto tabular-nums">
                    Bal:{" "}
                    {connected ? formatBalance(sourceBalanceFormatted) : "—"}
                  </span>
                </div>
              </div>

              <div className="mt-3 rounded-2xl border-[0.75px] border-border/30 bg-muted/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  {quoteStatus === "loading" ? (
                    <Skeleton className="h-9 w-40" />
                  ) : (
                    <span className="min-w-0 flex-1 tabular-nums text-3xl font-semibold tracking-[-0.06em]">
                      {marketQuote?.output ?? "0.00"}
                    </span>
                  )}
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    className="flex min-h-11 max-w-fit shrink-0 items-center gap-2 rounded-full border-[0.75px] border-foreground/5 bg-foreground/[0.02] px-3 py-1.5 transition-colors hover:bg-accent dark:bg-secondary"
                    onClick={() => {
                      setAssetQuery("");
                      setPicker("destination");
                    }}
                  >
                    <NativeGasMark chain={destination} />
                    <span className="text-left">
                      <span className="block text-sm font-semibold">
                        {destination.symbol}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {destination.name}
                      </span>
                    </span>
                  </button>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                  {quoteStatus === "loading" ? (
                    <Skeleton className="h-4 w-12" />
                  ) : (
                    <span className="tabular-nums">
                      {liveQuote?.amountOutUsd
                        ? formatUsd(liveQuote.amountOutUsd)
                        : formatUsd("0")}
                    </span>
                  )}
                  <span className="tabular-nums">
                    Bal:{" "}
                    {connected
                      ? formatBalance(destinationBalanceFormatted)
                      : "—"}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex min-h-13 items-center gap-3 rounded-2xl border-[0.75px] border-border/30 bg-muted/40 px-4 py-2.5">
                <span className="shrink-0 text-xs font-medium">
                  Destination address
                </span>
                <span
                  className="min-w-0 flex-1 truncate text-right text-[11px] text-muted-foreground"
                  title={destinationAddress || undefined}
                >
                  {formatAddress(destinationAddress)}
                </span>
                <Button
                  aria-label="Edit destination address"
                  className="rounded-full"
                  onClick={openDestinationAddressDialog}
                  size="icon"
                  type="button"
                  variant="secondary"
                >
                  <Pencil className="size-3.5" />
                </Button>
              </div>

              <AnimatePresence initial={false}>
                {inlineAlert ? (
                  <motion.div
                    animate={{
                      height: "auto",
                      marginTop: 12,
                      opacity: 1,
                      y: 0,
                    }}
                    className="overflow-hidden"
                    exit={{ height: 0, marginTop: 0, opacity: 0, y: -4 }}
                    initial={{
                      height: 0,
                      marginTop: 0,
                      opacity: 0,
                      y: reduceMotion ? 0 : 4,
                    }}
                    key={inlineAlert.key}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : {
                            height: {
                              duration: 0.3,
                              ease: [0.16, 1, 0.3, 1],
                            },
                            marginTop: {
                              duration: 0.3,
                              ease: [0.16, 1, 0.3, 1],
                            },
                            opacity: { duration: 0.18 },
                            y: {
                              duration: 0.24,
                              ease: [0.16, 1, 0.3, 1],
                            },
                          }
                    }
                  >
                    <Alert
                      className="gap-y-0.5 border-0 bg-destructive/10 py-2.5"
                      variant="destructive"
                    >
                      <CircleAlert className="size-3.5" />
                      <AlertTitle className="text-xs">
                        {inlineAlert.title}
                      </AlertTitle>
                      <AlertDescription className="text-[11px] leading-4">
                        {inlineAlert.description}
                      </AlertDescription>
                    </Alert>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <Button
                aria-busy={quoteStatus === "loading"}
                className="mt-3 w-full rounded-full"
                disabled={
                  quoteStatus === "loading" || quoteStatus === "invalid"
                }
                onClick={getGas}
                size="lg"
              >
                {connected ? "Get gas" : "Connect wallet"}
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
      <ConfirmationDialog
        amount={amount}
        completion={execution.result}
        destination={destination}
        flowState={state}
        recipient={destinationAddress}
        receiveAmount={marketQuote?.output}
        route={marketQuote}
        onConfirm={confirmDeposit}
        onReset={reset}
        onOpenChange={(open) => {
          if (open) {
            setIsExecutionDialogDismissed(false);
            return;
          }
          if (shouldResetExecutionOnDialogClose(state)) {
            reset();
            return;
          }
          setIsExecutionDialogDismissed(true);
        }}
        open={isConfirmationDialogOpen(state, isExecutionDialogDismissed)}
        quote={quote}
        sourceChain={sourceChain}
        error={visibleError}
        isPreparingDeposit={isPreparingDeposit}
        isRetrying={execution.isExecuting}
        retryStartsFreshQuote={!execution.isResumable}
        retryRequiresWallet={!execution.walletReady}
        onRetry={() => {
          setError(null);
          setIsExecutionDialogDismissed(false);
          const retryAction = getExecutionRetryAction(
            execution.walletReady,
            execution.isResumable,
          );
          if (retryAction === "connect-wallet") {
            setResumeExecutionAfterConnect(true);
            if (appKitProjectId) {
              void openAppKit({ view: "Connect" }).catch(() => {
                setResumeExecutionAfterConnect(false);
                setError(
                  "Couldn't open the wallet connection. Refresh the page and try again.",
                );
              });
            }
            return;
          }
          if (retryAction === "refresh-quote") {
            reset();
            setQuoteRefreshKey((current) => current + 1);
            return;
          }
          execution.retry();
        }}
      />
      <AssetPicker
        balanceByTokenKey={sourceTokens.balanceByTokenKey}
        balancesPending={sourceTokens.balancesPending}
        connected={connected}
        destination={destination}
        mode={picker}
        onDestinationChange={(nextDestination) => {
          setDestination(nextDestination);
          resetDraftPresentation();
        }}
        onOpenChange={(open) => {
          if (!open) setPicker(null);
        }}
        onTokenChange={(nextToken) => {
          setToken(nextToken);
          resetDraftPresentation();
        }}
        query={assetQuery}
        setQuery={setAssetQuery}
        token={token}
        tokens={sourceTokens.tokens}
      />
      <Dialog
        onOpenChange={(open) => {
          setDestinationAddressDialogOpen(open);
          if (!open) setDestinationAddressError(null);
        }}
        open={destinationAddressDialogOpen}
      >
        <DialogContent
          className="gap-4 p-5 sm:max-w-[480px]"
          initialFocus={false}
        >
          <DialogHeader className="pr-8">
            <DialogTitle className="text-xl tracking-[-0.04em]">
              Destination address
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              autoComplete="off"
              id="destination-address"
              aria-invalid={Boolean(destinationAddressError)}
              className="h-11 text-sm"
              onChange={(event) => {
                setDestinationAddressDraft(event.target.value);
                setDestinationAddressError(null);
              }}
              placeholder="0xA1b63a6Ca51b8CA5Bdb10866ac7C0C621D881800"
              spellCheck={false}
              value={destinationAddressDraft}
            />
            {destinationAddressError && (
              <p className="text-xs text-destructive">
                {destinationAddressError}
              </p>
            )}
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row">
            <Button
              className="h-10 w-full rounded-full px-4 text-sm sm:w-auto"
              onClick={() => setDestinationAddressDialogOpen(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="h-10 w-full rounded-full px-4 text-sm sm:w-auto"
              onClick={saveDestinationAddress}
              type="button"
            >
              Save address
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}

function QuoteDetail({
  detail,
  inlineDetail = false,
  label,
  value,
}: {
  detail?: string;
  inlineDetail?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-xs tabular-nums">
        {inlineDetail ? (
          <>
            <span className="text-foreground">{value}</span>
            {detail && (
              <span className="ml-2 text-muted-foreground">{detail}</span>
            )}
          </>
        ) : (
          <>
            <span className="block text-foreground">{value}</span>
            {detail && (
              <span className="block text-muted-foreground">{detail}</span>
            )}
          </>
        )}
      </span>
    </div>
  );
}

function NetworkDetail({
  chain,
  label,
}: {
  chain: DestinationChain;
  label: string;
}) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5 text-right font-medium text-foreground">
        <ChainIcon chain={chain} className="size-4 rounded-full" pixels={16} />
        {chain.name}
      </span>
    </div>
  );
}

function FeeBreakdownTooltip({ route }: { route: MarketQuote }) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label="Show fee breakdown"
        className="relative inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors before:absolute before:-inset-0.5 before:content-[''] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <CircleHelp className="size-4" />
      </TooltipTrigger>
      <TooltipContent
        align="end"
        className="block w-80 max-w-[calc(100vw-2rem)] p-3"
      >
        <p className="font-medium">Fee breakdown</p>
        <p className="mt-0.5 text-[11px] text-background/60">
          Route by {route.providerLabel}
        </p>
        <div className="mt-3 space-y-1.5 border-t border-background/15 pt-2 font-mono tabular-nums">
          {route.fees.map((fee) => {
            const rate = feeRateLabel(fee.rateBps);
            return (
              <div
                className="flex items-center justify-between gap-4"
                key={`${fee.kind}-${fee.label}-${fee.amount}-${fee.token.symbol}`}
              >
                <span className="font-sans text-background/70">
                  {fee.label}
                  {rate ? ` (${rate})` : ""}
                  {"\u00a0"}
                </span>
                <span className="whitespace-nowrap">
                  {formatTokenFee(fee.amount)} {fee.token.symbol}
                </span>
              </div>
            );
          })}
          <div className="flex items-center justify-between gap-4">
            <span className="font-sans text-background/70">
              {route.sourceGasSponsored
                ? "Transaction sponsorship fee"
                : "Estimated source gas"}
              {"\u00a0"}
            </span>
            <span className="whitespace-nowrap">
              {route.sourceGasSponsored
                ? `${route.sourceGasFeeToken} ${route.inputSymbol}`
                : "Paid by wallet"}
            </span>
          </div>
          <p className="pt-1 font-sans text-[11px] text-background/60">
            {route.sourceGasSponsored
              ? "Fixed USD tier converted to the source token, deducted from the input, and paid to the app in the same sponsored batch."
              : "No stablecoin gas charge is deducted when the wallet has enough native gas."}
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

type TokenPickerRow = { kind: "token"; token: Token };

const tokenPickerRowHeight = 56;

function VirtualTokenList({
  balanceLabel,
  groups,
  onOpenChange,
  onTokenChange,
  selectedToken,
}: {
  balanceLabel: (token: Token) => string;
  groups: readonly {
    chain: DestinationChain;
    tokens: readonly Token[];
  }[];
  onOpenChange: (open: boolean) => void;
  onTokenChange: (token: Token) => void;
  selectedToken: Token;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(390);
  const rows = useMemo<TokenPickerRow[]>(
    () =>
      groups.flatMap((group) =>
        group.tokens.map((item) => ({
          kind: "token" as const,
          token: item,
        })),
      ),
    [groups],
  );
  const sizes = useMemo(() => rows.map(() => tokenPickerRowHeight), [rows]);
  const layout = useMemo(
    () => getVirtualLayout(sizes, scrollTop, viewportHeight),
    [scrollTop, sizes, viewportHeight],
  );

  useEffect(() => {
    const element = scrollContainerRef.current;
    if (!element) return;
    const updateHeight = () => setViewportHeight(element.clientHeight);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      aria-label="Available source tokens"
      className="h-[min(390px,calc(100vh-13rem))] min-h-48 overflow-y-auto pt-2"
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      ref={scrollContainerRef}
      role="listbox"
      tabIndex={-1}
    >
      <div className="relative" style={{ height: layout.totalSize }}>
        {layout.items.map(({ index, size, start }) => {
          const row = rows[index];
          if (!row) return null;
          return (
            <div
              className="absolute inset-x-0 px-2"
              key={tokenKey(row.token)}
              style={{ height: size, transform: `translateY(${start}px)` }}
            >
              <button
                aria-selected={tokenKey(row.token) === tokenKey(selectedToken)}
                className="flex h-full w-full items-center gap-3 rounded-full px-3 text-left transition-colors hover:bg-muted"
                onClick={() => {
                  onTokenChange(row.token);
                  onOpenChange(false);
                }}
                role="option"
                type="button"
              >
                <TokenMark size="small" token={row.token} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {row.token.symbol}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {row.token.name}
                  </span>
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {balanceLabel(row.token)}
                </span>
                {tokenKey(row.token) === tokenKey(selectedToken) && (
                  <Check className="size-4" aria-label="Selected" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AssetPicker({
  balanceByTokenKey,
  balancesPending,
  connected,
  destination,
  mode,
  onDestinationChange,
  onOpenChange,
  onTokenChange,
  query,
  setQuery,
  token,
  tokens,
}: {
  balanceByTokenKey: Readonly<Record<string, bigint>>;
  balancesPending: boolean;
  connected: boolean;
  destination: DestinationChain;
  mode: "token" | "destination" | null;
  onDestinationChange: (chain: DestinationChain) => void;
  onOpenChange: (open: boolean) => void;
  onTokenChange: (token: Token) => void;
  query: string;
  setQuery: (query: string) => void;
  token: Token;
  tokens: readonly Token[];
}) {
  const [chainQuery, setChainQuery] = useState("");
  const [mobileChainsExpanded, setMobileChainsExpanded] = useState(false);
  const [selectedChainId, setSelectedChainId] = useState(token.chainId);
  const normalizedQuery = query.trim().toLowerCase();
  const sourceChainIds = new Set(tokens.map((item) => item.chainId));
  const sourceChains = CHAIN_LIST.filter((item) => sourceChainIds.has(item.id));
  const filteredTokens = tokens.filter((item) => {
    const chain = CHAIN_LIST.find((entry) => entry.id === item.chainId);
    return `${item.symbol} ${item.name} ${item.address} ${chain?.name ?? ""}`
      .toLowerCase()
      .includes(normalizedQuery);
  });
  const chains = CHAIN_LIST.filter((item) =>
    `${item.name} ${item.symbol}`.toLowerCase().includes(normalizedQuery),
  );
  const activeChain =
    sourceChains.find((chain) => chain.id === selectedChainId) ??
    sourceChains[0] ??
    CHAIN_LIST[0];
  const tokensForActiveChain = filteredTokens
    .filter((item) => item.chainId === activeChain?.id)
    .sort((first, second) => {
      const firstBalance = balanceByTokenKey[tokenKey(first)] ?? BigInt(0);
      const secondBalance = balanceByTokenKey[tokenKey(second)] ?? BigInt(0);
      if (firstBalance === secondBalance) {
        return first.symbol.localeCompare(second.symbol);
      }
      return firstBalance > secondBalance ? -1 : 1;
    });
  const trendingTokens = tokens
    .filter((item) => item.chainId === activeChain?.id)
    .slice(0, 4);
  const normalizedChainQuery = chainQuery.trim().toLowerCase();
  const visibleChains = sourceChains.filter((item) =>
    `${item.name} ${item.symbol}`.toLowerCase().includes(normalizedChainQuery),
  );
  const mobileTopChains = visibleChains.slice(0, 5);
  const mobileRemainingChains = visibleChains.slice(5);

  useEffect(() => {
    if (mode === "token") {
      setSelectedChainId(token.chainId);
      setChainQuery("");
      setMobileChainsExpanded(false);
    }
  }, [mode, token.chainId]);

  const balanceLabel = (item: Token) => {
    if (!connected) return "—";
    const balance = balanceByTokenKey[tokenKey(item)];
    if (balance === undefined) return balancesPending ? "Loading…" : "—";
    return formatBalance(formatUnits(balance, item.decimals));
  };

  const mobileRemainingChainGrid = (
    <div className="grid grid-cols-4 gap-1 px-2 py-2">
      {mobileRemainingChains.map((chain) => {
        const selected = chain.id === activeChain?.id;
        return (
          <button
            aria-label={chain.name}
            aria-pressed={selected}
            className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-center text-[10px] font-medium leading-tight transition-colors ${selected ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            key={chain.id}
            onClick={() => setSelectedChainId(chain.id)}
            type="button"
          >
            <ChainMark chain={chain} size="sm" />
            <span className="max-w-full truncate">{chain.shortName}</span>
          </button>
        );
      })}
    </div>
  );

  const destinationPicker = (
    <Dialog open={mode === "destination"} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(620px,calc(100vh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[480px]">
        <DialogHeader className="px-5 pb-2 pt-5 pr-14">
          <DialogTitle>Select gas network</DialogTitle>
        </DialogHeader>
        <div className="px-5 py-3">
          <div className="flex min-h-14 items-center gap-3 rounded-2xl bg-secondary px-4">
            <Search className="size-6 shrink-0 text-muted-foreground" />
            <Input
              aria-label="Search networks"
              autoFocus
              className="h-auto min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search networks"
              value={query}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overscroll-contain overflow-y-auto p-2 [scrollbar-gutter:stable]">
          {chains.map((item) => (
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-full px-3 py-3 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
              disabled={!item.intentsAssetId}
              key={item.id}
              onClick={() => {
                onDestinationChange(item);
                onOpenChange(false);
              }}
            >
              <ChainMark chain={item} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{item.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {item.intentsAssetId
                    ? `Native ${item.symbol}`
                    : "Native gas quote unavailable"}
                </span>
              </span>
              {item.id === destination.id && (
                <Check className="size-4" aria-label="Selected" />
              )}
            </button>
          ))}
          {chains.length === 0 && (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              No matching networks
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <>
      {destinationPicker}
      <Dialog open={mode === "token"} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-h-[min(720px,calc(100vh-2rem))] gap-0 overflow-hidden bg-popover p-0 sm:max-w-[560px]"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">Select a token</DialogTitle>
          <DialogDescription className="sr-only">
            Choose a network and token to pay with.
          </DialogDescription>
          <div className="grid min-h-0 grid-cols-1 bg-popover sm:grid-cols-[180px_minmax(0,1fr)]">
            <aside className="min-h-0 border-b border-border sm:border-b-0 sm:border-r">
              <div className="border-b border-border px-2 py-2.5">
                <div className="flex min-h-9 items-center gap-1.5 rounded-2xl bg-secondary px-2">
                  <Search className="size-3.5 shrink-0 text-muted-foreground" />
                  <Input
                    aria-label="Search chains"
                    className="h-auto min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
                    onChange={(event) => setChainQuery(event.target.value)}
                    placeholder="Search chains"
                    value={chainQuery}
                  />
                </div>
              </div>
              <div className="sm:hidden">
                {visibleChains.length > 0 ? (
                  <>
                    <div className="grid grid-cols-5 gap-1 px-2 py-2">
                      {mobileTopChains.map((chain) => {
                        const selected = chain.id === activeChain?.id;
                        return (
                          <button
                            aria-label={chain.name}
                            aria-pressed={selected}
                            className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-center text-[10px] font-medium leading-tight transition-colors ${selected ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                            key={chain.id}
                            onClick={() => setSelectedChainId(chain.id)}
                            type="button"
                          >
                            <ChainMark chain={chain} size="sm" />
                            <span className="max-w-full truncate">
                              {chain.shortName}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {mobileRemainingChains.length > 0 &&
                      (normalizedChainQuery ? (
                        mobileRemainingChainGrid
                      ) : (
                        <BouncyAccordion
                          className="border-t border-border"
                          contentClassName="border-t border-border"
                          onOpenChange={setMobileChainsExpanded}
                          open={mobileChainsExpanded}
                          title={
                            mobileChainsExpanded
                              ? "Show fewer chains"
                              : `View ${mobileRemainingChains.length} more chains`
                          }
                          triggerClassName="px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          {mobileRemainingChainGrid}
                        </BouncyAccordion>
                      ))}
                  </>
                ) : (
                  <p className="px-7 py-8 text-center text-sm text-muted-foreground">
                    No matching chains
                  </p>
                )}
              </div>

              <div className="hidden max-h-[min(608px,calc(100vh-10rem))] overflow-y-auto py-1 sm:block">
                {visibleChains.map((chain) => {
                  const selected = chain.id === activeChain?.id;
                  return (
                    <button
                      aria-pressed={selected}
                      className={`flex min-h-14 w-full items-center gap-2 px-4 text-left text-sm font-medium transition-colors ${selected ? "bg-muted" : "hover:bg-muted"}`}
                      key={chain.id}
                      onClick={() => setSelectedChainId(chain.id)}
                      type="button"
                    >
                      <ChainMark chain={chain} size="sm" />
                      <span>{chain.name}</span>
                    </button>
                  );
                })}
                {visibleChains.length === 0 && (
                  <p className="px-7 py-10 text-sm text-muted-foreground">
                    No matching chains
                  </p>
                )}
              </div>
            </aside>

            <section className="min-h-0">
              <div className="flex items-center gap-2 border-b border-border px-2 py-2.5">
                <div className="flex min-h-9 min-w-0 flex-1 items-center gap-1.5 rounded-2xl bg-secondary px-2">
                  <Search className="size-3.5 shrink-0 text-muted-foreground" />
                  <Input
                    aria-label="Search tokens or paste address"
                    autoFocus
                    className="h-auto min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search tokens or paste address"
                    value={query}
                  />
                </div>
                <DialogClose
                  aria-label="Close token picker"
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="size-4" />
                </DialogClose>
              </div>

              <div className="border-b border-border px-5 py-5">
                <p className="text-xs text-muted-foreground">Popular</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  {trendingTokens.map((item) => (
                    <button
                      className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 text-xs font-semibold transition-colors hover:bg-secondary"
                      key={tokenKey(item)}
                      onClick={() => {
                        onTokenChange(item);
                        onOpenChange(false);
                      }}
                      type="button"
                    >
                      <TokenMark size="tiny" token={item} />
                      {item.symbol}
                    </button>
                  ))}
                  {trendingTokens.length === 0 && (
                    <p className="py-3 text-sm text-muted-foreground">
                      No tokens available on this chain.
                    </p>
                  )}
                </div>
              </div>

              {tokensForActiveChain.length > 0 ? (
                <VirtualTokenList
                  balanceLabel={balanceLabel}
                  groups={[
                    { chain: activeChain, tokens: tokensForActiveChain },
                  ]}
                  key={`${activeChain?.id}-${query}`}
                  onOpenChange={onOpenChange}
                  onTokenChange={onTokenChange}
                  selectedToken={token}
                />
              ) : (
                <p className="px-5 py-14 text-center text-sm text-muted-foreground">
                  No matching tokens on {activeChain?.name}
                </p>
              )}
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ConfirmationDialog({
  open,
  amount,
  completion,
  destination,
  flowState,
  recipient,
  receiveAmount,
  route,
  quote,
  sourceChain,
  onConfirm,
  onOpenChange,
  onReset,
  error,
  isPreparingDeposit,
  isRetrying,
  retryStartsFreshQuote,
  retryRequiresWallet,
  onRetry,
}: {
  open: boolean;
  amount: string;
  completion: GasExecutionResult | null;
  destination: DestinationChain;
  flowState: GasFlowState;
  recipient: string;
  receiveAmount?: string;
  route?: MarketQuote;
  quote: GasQuote | null;
  sourceChain: DestinationChain;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  onReset: () => void;
  error: string | null;
  isPreparingDeposit: boolean;
  isRetrying: boolean;
  retryStartsFreshQuote: boolean;
  retryRequiresWallet: boolean;
  onRetry: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const alertTransition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, duration: 0.3, bounce: 0 };
  const isProcessing =
    flowState !== "confirming" &&
    flowState !== "failed" &&
    flowState !== "completed";
  const transactionUrl = completion
    ? `${sourceChain.explorerUrl}/tx/${completion.txHash}`
    : undefined;
  const routeExplorerUrl = completion
    ? (completion.explorerUrl ??
      (completion.provider === "near-1click"
        ? `https://explorer.near-intents.org/?search=${encodeURIComponent(completion.txHash)}`
        : undefined))
    : undefined;
  const copyTransactionHash = () => {
    if (completion) void navigator.clipboard?.writeText(completion.txHash);
  };
  const processingLabel: Partial<Record<GasFlowState, string>> = {
    switching_network: "Switching source network",
    wallet_signature: "Awaiting authorization",
    submitting: "Submitting source-chain transaction",
    deposit_pending: "Waiting for source-chain confirmation",
    solver_executing: "Waiting for destination delivery",
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(680px,calc(100vh-2rem))] gap-3 overflow-y-auto sm:max-h-[min(620px,calc(100vh-2rem))] sm:max-w-[420px]">
        <div className="border-b pb-4 pr-10">
          <p className="text-base font-semibold tracking-[-0.035em]">
            Gas on {destination.name}
          </p>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 py-2 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted/40 ring-1 ring-foreground/10">
            <NativeGasMark chain={destination} />
          </span>
          <p className="text-3xl font-semibold tracking-[-0.05em] tabular-nums sm:text-4xl">
            {receiveAmount
              ? `${receiveAmount} ${destination.symbol}`
              : "Quote unavailable"}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <div className="rounded-2xl bg-muted/40 p-4 text-xs">
            <div className="space-y-1">
              <QuoteDetail
                label="You pay"
                value={
                  route
                    ? `${route.input} ${route.inputSymbol}`
                    : quote
                      ? `${amount} ${quote.inputToken.symbol}`
                      : "—"
                }
              />
              <NetworkDetail chain={sourceChain} label="From network" />
            </div>
            <div className="my-2 h-px bg-foreground/10" />
            <div className="space-y-1">
              <QuoteDetail
                label="Minimum received"
                value={
                  route ? `${route.minimumReceived} ${destination.symbol}` : "—"
                }
              />
              <NetworkDetail chain={destination} label="To network" />
              <QuoteDetail label="Recipient" value={formatAddress(recipient)} />
              <div className="flex min-h-7 items-center justify-between gap-4">
                <span className="flex items-center text-muted-foreground">
                  Execution Fee
                  {route && <FeeBreakdownTooltip route={route} />}
                </span>
                <span className="text-right text-xs tabular-nums">
                  {route?.networkFee ?? "—"}
                </span>
              </div>
              <QuoteDetail
                label="Estimated completion"
                value={formatExecutionDuration(route?.executionDurationSeconds)}
              />
            </div>
          </div>
          {flowState === "confirming" && !quote ? (
            <Alert className="border-0 bg-secondary py-3">
              <CircleAlert className="size-4" />
              <AlertTitle>Quote expired</AlertTitle>
              <AlertDescription>
                This quote is no longer valid. Close this dialog and refresh the
                quote before continuing.
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
        {flowState === "confirming" && error && (
          <Alert variant="destructive" className="py-3">
            <CircleAlert className="size-4" />
            <AlertTitle>Couldn&apos;t prepare deposit</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <AnimatePresence initial={false} mode="popLayout">
          {flowState === "failed" && (
            <motion.div
              animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
              exit={{ filter: "blur(4px)", opacity: 0, y: -6 }}
              initial={{ filter: "blur(4px)", opacity: 0, y: 6 }}
              key="transaction-failed"
              transition={alertTransition}
            >
              <Alert
                variant="destructive"
                className="border-0 bg-destructive/10 py-3"
              >
                <CircleAlert className="size-4" />
                <AlertTitle className="min-w-0 break-words text-xs leading-5">
                  {error ?? "Transaction failed."}
                </AlertTitle>
              </Alert>
            </motion.div>
          )}
        </AnimatePresence>
        {flowState === "completed" && completion ? (
          <div className="space-y-3">
            <div className="space-y-3 rounded-2xl bg-muted/40 p-4 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Transaction hash</span>
                <span className="flex min-w-0 items-center gap-1.5 tabular-nums">
                  <span className="truncate" title={completion.txHash}>
                    {formatAddress(completion.txHash)}
                  </span>
                  <button
                    aria-label="Copy transaction hash"
                    className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    onClick={copyTransactionHash}
                    type="button"
                  >
                    <Copy className="size-4" />
                  </button>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 border-t border-foreground/10 pt-3">
                {transactionUrl && (
                  <a
                    className="flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-border px-3 text-center font-medium transition-colors hover:bg-secondary"
                    href={transactionUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {sourceChain.name} explorer
                    <ExternalLink className="size-3.5 shrink-0" />
                  </a>
                )}
                {routeExplorerUrl && (
                  <a
                    className="flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-border px-3 text-center font-medium transition-colors hover:bg-secondary"
                    href={routeExplorerUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {completion.provider === "near-1click"
                      ? "NEAR Intents Explorer"
                      : "LI.FI route explorer"}
                    <ExternalLink className="size-3.5 shrink-0" />
                  </a>
                )}
              </div>
            </div>
            <Button
              className="h-11 w-full rounded-full transition-transform active:scale-[0.96]"
              onClick={onReset}
            >
              <RotateCcw data-icon="inline-start" /> Start another
            </Button>
          </div>
        ) : flowState === "failed" ? (
          <Button
            className="h-11 w-full rounded-full"
            disabled={isRetrying}
            onClick={onRetry}
          >
            {isRetrying ? (
              <>
                <LoaderCircle
                  className="animate-spin"
                  data-icon="inline-start"
                />
                Retrying
              </>
            ) : retryRequiresWallet ? (
              "Connect wallet"
            ) : retryStartsFreshQuote ? (
              "Refresh quote"
            ) : (
              "Retry Transaction"
            )}
          </Button>
        ) : isProcessing ? (
          <div className="flex h-11 items-center justify-center gap-2 rounded-full bg-muted/40 px-4 text-sm font-medium">
            <LoaderCircle className="size-4 animate-spin" />
            {processingLabel[flowState] ?? "Processing transaction"}
          </div>
        ) : (
          <DialogFooter className="sticky bottom-0 z-10 mt-1 border-t border-border bg-popover pt-3 sm:static sm:m-0 sm:border-0 sm:bg-transparent sm:p-0">
            <Button
              disabled={isPreparingDeposit || !quote}
              onClick={onConfirm}
              className="w-full flex-1 rounded-full px-5 py-2.5 text-base transition-transform active:scale-[0.96] sm:px-4 sm:py-2 sm:text-sm"
            >
              {isPreparingDeposit ? (
                <>
                  <LoaderCircle
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                  Preparing deposit
                </>
              ) : (
                "Confirm transaction"
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
