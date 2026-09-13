"use client";

import {
  useAppKit,
  useAppKitAccount,
  useAppKitProvider,
} from "@reown/appkit/react";
import { Fuel } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { type Address, formatUnits, isAddress, parseUnits } from "viem";
import { useBalance } from "wagmi";
import { DashboardShell } from "@/components/dashboard-shell";
import { TransactionHistory } from "@/components/gas/transaction-history";
import { TransactionStatus } from "@/components/gas/transaction-status";
import { AssetPicker } from "@/components/gas/workspace/asset-picker";
import {
  marketQuoteExpiry,
  routeQuoteRequest,
} from "@/components/gas/workspace/common";
import { ConfirmationDialog } from "@/components/gas/workspace/confirmation-dialog";
import {
  defaultDestination,
  defaultToken,
  demoMode,
  demoWalletAddress,
  MAX_TOKEN_INPUT,
} from "@/components/gas/workspace/constants";
import { DestinationAddressDialog } from "@/components/gas/workspace/destination-address-dialog";
import { GasRequestCard } from "@/components/gas/workspace/gas-request-card";
import { useGasTheme } from "@/components/gas/workspace/use-gas-theme";
import { useLiveRouteQuote } from "@/components/gas/workspace/use-live-route-quote";
import { useSyncedGasExecution } from "@/components/gas/workspace/use-synced-gas-execution";
import { workspaceAlert } from "@/components/gas/workspace/workspace-alert";
import { ThemeToggle } from "@/components/motion/theme-toggle";
import { WalletButton } from "@/components/wallet/wallet-button";
import { appKitProjectId } from "@/config/appkit";
import { CHAIN_LIST, type DestinationChain } from "@/config/chains";
import type { RouteExecutionInput } from "@/hooks/use-gas-execution";
import { useSourceTokens } from "@/hooks/use-source-tokens";
import { normalizeAmountInput } from "@/lib/amount-input";
import {
  type ClientSourceGasConfig,
  estimateSourceGasInBrowser,
} from "@/lib/gas/client-source-gas";
import {
  getExecutionRetryAction,
  isConfirmationDialogOpen,
  resolveConfirmationFlowState,
  shouldFetchQuotes,
  shouldResetExecutionOnDialogClose,
  shouldResetExecutionOnDraftChange,
} from "@/lib/gas/confirmation-dialog-state";
import type { WalletRpcProvider } from "@/lib/gas/wallet-calls";
import { LifiRouteAdapter } from "@/lib/routes/adapters/lifi";
import { NearOneClickRouteAdapter } from "@/lib/routes/adapters/near-oneclick";
import type { NearClientConfig, PreparedRoute } from "@/lib/routes/types";
import { tokenKey } from "@/lib/tokens/source-catalog";
import type { GasFlowState } from "@/types/gas";
import type { Token } from "@/types/tokens";

export function GasWorkspace({
  nearClientConfig,
  sourceGasConfig,
}: {
  nearClientConfig: NearClientConfig;
  sourceGasConfig: ClientSourceGasConfig;
}) {
  const { open: openAppKit } = useAppKit();
  const appKitAccount = useAppKitAccount();
  const { walletProvider } = useAppKitProvider<WalletRpcProvider>("eip155");
  const reduceMotion = useReducedMotion();
  const walletAddress = appKitAccount.address as Address | undefined;
  const [demoConnected, setDemoConnected] = useState(false);
  const connected = appKitProjectId ? appKitAccount.isConnected : demoConnected;
  const [token, setToken] = useState<Token>(defaultToken);
  const [destination, setDestination] =
    useState<DestinationChain>(defaultDestination);
  const [amount, setAmount] = useState("");
  const [state, setState] = useState<GasFlowState>("wallet_required");
  const [error, setError] = useState<string | null>(null);
  const { isDark, toggleTheme } = useGasTheme();
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
  const [isPreparingDeposit, setIsPreparingDeposit] = useState(false);
  const preparingDepositRef = useRef(false);
  const [activeView, setActiveView] = useState<
    "get-gas" | "transactions" | "tx-status"
  >("get-gas");
  const execution = useSyncedGasExecution({
    connected,
    nearClientConfig,
    setError,
    setState,
    state,
  });
  const {
    isExecutionDialogDismissed,
    setIsExecutionDialogDismissed,
    setResumeExecutionAfterConnect,
  } = execution;
  const confirmationFlowState = resolveConfirmationFlowState({
    flowState: state,
    executionFlowState: execution.flowState,
    isExecuting: execution.isExecuting,
  });
  const quoteUpdatesEnabled = shouldFetchQuotes(confirmationFlowState);
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
  const {
    liveQuote,
    marketQuote,
    quote,
    quoteError,
    quoteStatus,
    pauseQuoteUpdates,
    refreshQuote,
    setLiveQuote,
    sourceGasEstimate,
  } = useLiveRouteQuote({
    amount,
    destination,
    inputLimit,
    quoteUpdatesEnabled,
    quoteWalletAddress,
    recipientAddress,
    setWorkspaceError: setError,
    nearClientConfig,
    sourceGasConfig,
    token,
    walletConnected: Boolean(appKitAccount.isConnected),
    walletProvider,
  });

  useEffect(() => {
    if (!connected) {
      setDestinationAddress("");
      setDestinationAddressDraft("");
      setDestinationAddressEdited(false);
      setDestinationAddressError(null);
      return;
    }

    if (connectedWalletAddress && !destinationAddressEdited) {
      setDestinationAddress(connectedWalletAddress);
    }
  }, [connected, connectedWalletAddress, destinationAddressEdited]);

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
    pauseQuoteUpdates();
    setState("confirming");
  };
  const reset = () => {
    preparingDepositRef.current = false;
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
    if (
      preparingDepositRef.current ||
      execution.isExecuting ||
      execution.isResumable
    )
      return;
    if (!quote || !walletAddress || !recipientAddress || !sourceGasEstimate)
      return;
    preparingDepositRef.current = true;
    setError(null);
    setIsPreparingDeposit(true);
    let staleQuote = false;
    try {
      const grossAmount =
        quote.inputAmount + BigInt(sourceGasEstimate.feeAmount);
      const freshGas = await estimateSourceGasInBrowser({
        account: walletAddress,
        amount: grossAmount,
        chain: sourceChain,
        config: sourceGasConfig,
        signal: AbortSignal.timeout(20_000),
        token,
        walletConnected: Boolean(appKitAccount.isConnected),
        walletProvider,
      });
      if (!freshGas.executionAvailable) {
        throw new Error(
          freshGas.executionError ?? "Source gas is unavailable.",
        );
      }
      if (
        freshGas.sponsorshipRequired !==
          sourceGasEstimate.sponsorshipRequired ||
        freshGas.feeAmount !== sourceGasEstimate.feeAmount ||
        freshGas.feeRecipient.toLowerCase() !==
          sourceGasEstimate.feeRecipient.toLowerCase()
      ) {
        staleQuote = true;
        refreshQuote();
        throw new Error(
          "Source gas changed. Refresh the quote before confirming.",
        );
      }
      const quoteRequest = routeQuoteRequest({
        account: walletAddress,
        amount: quote.inputAmount,
        destination,
        recipient: recipientAddress,
        sponsorshipRequired: sourceGasEstimate.sponsorshipRequired,
        token,
      });
      let body: PreparedRoute;
      if (liveQuote?.provider === "lifi") {
        body = await new LifiRouteAdapter(
          sourceGasConfig.platformFeeRecipient,
        ).prepare(quoteRequest, AbortSignal.timeout(20_000));
      } else {
        body = await new NearOneClickRouteAdapter(nearClientConfig).prepare(
          quoteRequest,
          AbortSignal.timeout(20_000),
        );
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
      preparingDepositRef.current = false;
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not prepare the selected route.",
      );
      setState(staleQuote ? "quoted" : "confirming");
      if (staleQuote) setIsExecutionDialogDismissed(true);
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
  const inlineAlert = workspaceAlert({
    connected,
    error,
    quote,
    quoteError,
    quoteStatus,
    sourceBalanceFormatted,
    sourceBalanceValue,
    sourceChain,
    sourceGasEstimate,
    state,
    token,
  });

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
          active: true,
          icon: <Fuel aria-hidden="true" className="size-4" />,
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
          <GasRequestCard
            amount={amount}
            connected={connected}
            destination={destination}
            destinationAddress={destinationAddress}
            destinationBalanceFormatted={destinationBalanceFormatted}
            inlineAlert={inlineAlert}
            inputLimit={inputLimit}
            liveQuote={liveQuote}
            marketQuote={marketQuote}
            onAmountChange={(value) => {
              setAmount(normalizeAmountInput(value, token.decimals));
              resetDraftPresentation();
            }}
            onEditDestinationAddress={openDestinationAddressDialog}
            onGetGas={getGas}
            onOpenDestinationPicker={() => {
              setAssetQuery("");
              setPicker("destination");
            }}
            onOpenTokenPicker={() => {
              setAssetQuery("");
              setPicker("token");
            }}
            quoteStatus={quoteStatus}
            reduceMotion={reduceMotion}
            sourceBalanceFormatted={sourceBalanceFormatted}
            sourceChain={sourceChain}
            token={token}
          />
        )}
      </main>
      <ConfirmationDialog
        amount={amount}
        completion={execution.result}
        destination={destination}
        flowState={confirmationFlowState}
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
          if (shouldResetExecutionOnDialogClose(confirmationFlowState)) {
            reset();
            return;
          }
          setIsExecutionDialogDismissed(true);
        }}
        open={isConfirmationDialogOpen(
          confirmationFlowState,
          isExecutionDialogDismissed,
        )}
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
            refreshQuote();
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
      <DestinationAddressDialog
        draft={destinationAddressDraft}
        error={destinationAddressError}
        onDraftChange={(value) => {
          setDestinationAddressDraft(value);
          setDestinationAddressError(null);
        }}
        onOpenChange={(open) => {
          setDestinationAddressDialogOpen(open);
          if (!open) setDestinationAddressError(null);
        }}
        onSave={saveDestinationAddress}
        open={destinationAddressDialogOpen}
      />
    </DashboardShell>
  );
}
