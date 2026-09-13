import { type Address, isAddress } from "viem";
import { z } from "zod";
import type { DestinationChain } from "../../config/chains.ts";
import type { ChainlinkUsdFeed, Token } from "../../types/tokens.ts";
import { tokenResponseSchema } from "../intents/schemas.ts";
import { getChainlinkUsdPrice } from "./chainlink-prices.ts";
import {
  calculateFixedSourceGasCharge,
  calculateSourceGasCharge,
  isUsdStableToken,
  resolveSourceGasFunding,
  type SourceGasEstimate,
  sponsorshipSourceTokenUsd,
} from "./source-gas.ts";
import { encodeErc20Transfer } from "./wallet-calls/common.ts";
import type { WalletRpcProvider } from "./wallet-calls/types.ts";
import { walletSupportsSponsoredAtomicCalls } from "./wallet-paymaster-capability.ts";

export type ClientSourceGasConfig = {
  feeRecipient?: Address;
  platformFeeRecipient?: Address;
  sponsoredChainIds: number[];
  bundlerUrls: Record<number, string>;
};

const tokensResponseSchema = z.array(tokenResponseSchema);
const MIN_ERC20_TRANSFER_GAS = 65_000n;
const ACCOUNT_ABSTRACTION_OVERHEAD_GAS = 150_000n;

async function rpcRequest(
  url: string,
  method: string,
  params: unknown[],
  signal: AbortSignal,
) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
    signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
  });
  if (!response.ok) throw new Error("The source-chain RPC is unavailable.");
  const body = (await response.json()) as { result?: unknown; error?: unknown };
  if (body.error) throw new Error("The source-chain RPC rejected the request.");
  return body;
}

function rpcQuantity(body: unknown): bigint {
  const result =
    body && typeof body === "object" && "result" in body
      ? body.result
      : undefined;
  if (typeof result !== "string" || !/^0x[\da-fA-F]+$/.test(result)) {
    throw new Error("The source-chain RPC returned an invalid gas value.");
  }
  return BigInt(result);
}

async function gasPriceWei(
  rpcUrl: string,
  bundlerUrl: string | undefined,
  signal: AbortSignal,
) {
  if (bundlerUrl) {
    try {
      const body = await rpcRequest(
        bundlerUrl,
        "pimlico_getUserOperationGasPrice",
        [],
        signal,
      );
      const fast = (body.result as { fast?: { maxFeePerGas?: unknown } })?.fast
        ?.maxFeePerGas;
      return rpcQuantity({ result: fast });
    } catch {
      if (signal.aborted) throw signal.reason;
    }
  }
  return rpcQuantity(await rpcRequest(rpcUrl, "eth_gasPrice", [], signal));
}

async function usdPrices(
  token: Token,
  chain: DestinationChain,
  signal: AbortSignal,
) {
  const rpcUrl = chain.publicRpcUrl;
  const requests = new Map<string, Promise<string | undefined>>();
  const oraclePrice = (feed: ChainlinkUsdFeed | undefined) => {
    if (!feed) return Promise.resolve(undefined);
    const key = feed.address.toLowerCase();
    let pending = requests.get(key);
    if (!pending) {
      pending = getChainlinkUsdPrice({
        feed,
        rpcUrl,
        rpcRequest: (url, method, params) =>
          rpcRequest(url, method, params, signal),
      });
      requests.set(key, pending);
    }
    return pending;
  };
  const [sourceOracle, nativeOracle] = await Promise.all([
    isUsdStableToken(token.symbol)
      ? Promise.resolve("1")
      : oraclePrice(token.chainlinkUsdFeed),
    oraclePrice(chain.chainlinkUsdFeed),
  ]);
  if (signal.aborted) throw signal.reason;
  if (sourceOracle !== undefined && nativeOracle !== undefined) {
    return { sourcePrice: sourceOracle, nativePrice: nativeOracle };
  }

  const response = await fetch("https://1click.chaindefuser.com/v0/tokens", {
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error("Token prices are unavailable.");
  const parsed = tokensResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("Token prices are invalid.");
  const fallback = (assetId: string) => {
    const item = parsed.data.find((entry) => entry.assetId === assetId);
    if (!item || item.price <= 0) return undefined;
    const ageMs = Date.now() - Date.parse(item.priceUpdatedAt);
    return ageMs >= -60_000 && ageMs <= 10 * 60_000 ? item.price : undefined;
  };
  const sourcePrice = sourceOracle ?? fallback(token.intentsAssetId);
  const nativePrice = nativeOracle ?? fallback(chain.intentsAssetId ?? "");
  if (sourcePrice === undefined || nativePrice === undefined) {
    throw new Error("Fresh source-chain token prices are unavailable.");
  }
  return { sourcePrice, nativePrice };
}

export async function estimateSourceGasInBrowser({
  account,
  amount,
  chain,
  config,
  signal,
  token,
  walletConnected = false,
  walletProvider,
}: {
  account: Address;
  amount: bigint;
  chain: DestinationChain;
  config: ClientSourceGasConfig;
  signal: AbortSignal;
  token: Token;
  walletConnected?: boolean;
  walletProvider?: WalletRpcProvider;
}): Promise<SourceGasEstimate> {
  if (chain.id !== token.chainId || !chain.intentsAssetId) {
    throw new Error("Source gas recovery is unavailable on this chain.");
  }
  const rpcUrl = chain.publicRpcUrl;
  const [gasEstimateBody, gasPrice, balanceBody, prices] = await Promise.all([
    rpcRequest(
      rpcUrl,
      "eth_estimateGas",
      [
        {
          data: encodeErc20Transfer(config.feeRecipient ?? account, 1n),
          from: account,
          to: token.address,
          value: "0x0",
        },
      ],
      signal,
    ).catch(() => ({ result: `0x${MIN_ERC20_TRANSFER_GAS.toString(16)}` })),
    gasPriceWei(rpcUrl, config.bundlerUrls[chain.id], signal),
    rpcRequest(rpcUrl, "eth_getBalance", [account, "latest"], signal),
    usdPrices(token, chain, signal),
  ]);
  if (signal.aborted) throw signal.reason;

  const transferGas = rpcQuantity(gasEstimateBody);
  const gasUnits =
    (transferGas > MIN_ERC20_TRANSFER_GAS
      ? transferGas
      : MIN_ERC20_TRANSFER_GAS) *
      2n +
    ACCOUNT_ABSTRACTION_OVERHEAD_GAS;
  const charge = calculateSourceGasCharge({
    gasPriceWei: gasPrice,
    gasUnits,
    nativeTokenUsd: prices.nativePrice,
    sourceTokenDecimals: token.decimals,
    sourceTokenUsd: prices.sourcePrice,
  });
  const fixedCharge = calculateFixedSourceGasCharge({
    amount,
    sourceTokenDecimals: token.decimals,
    sourceTokenUsd: sponsorshipSourceTokenUsd(token.symbol, prices.sourcePrice),
  });
  const nativeBalanceWei = rpcQuantity(balanceBody);
  const sponsorshipConfigured = config.sponsoredChainIds.includes(chain.id);
  const nativeGasRequired = nativeBalanceWei < charge.bufferedNativeWei;
  const sponsorshipAvailable =
    sponsorshipConfigured &&
    (!nativeGasRequired ||
      !walletConnected ||
      (walletProvider !== undefined &&
        (await walletSupportsSponsoredAtomicCalls({
          account,
          chainId: chain.id,
          provider: walletProvider,
        }))));
  if (signal.aborted) throw signal.reason;
  const funding = resolveSourceGasFunding({
    nativeBalanceWei,
    quoteOnly: true,
    requiredNativeWei: charge.bufferedNativeWei,
    sponsorshipAvailable,
  });
  const sponsorshipRequired = funding.sponsorshipRequired;
  const recipientAvailable =
    !sponsorshipRequired || Boolean(config.feeRecipient);
  const fundingError = sponsorshipConfigured
    ? `This wallet does not report support for sponsored atomic calls on ${chain.name}. Add native ${chain.symbol} for gas, or use a wallet and source chain that support sponsorship.`
    : `Gas sponsorship is not configured for ${chain.name}. Fund the connected wallet with native ${chain.symbol}.`;
  const recipientError =
    "Configure SPONSORED_GAS_FEE_RECIPIENT with the EVM address that receives the sponsorship fee.";

  return {
    executionAvailable: funding.executable && recipientAvailable,
    executionError: !funding.executable
      ? fundingError
      : !recipientAvailable
        ? recipientError
        : null,
    feeAmount: sponsorshipRequired ? fixedCharge.feeAmount.toString() : "0",
    feeAmountFormatted: sponsorshipRequired
      ? fixedCharge.feeAmountFormatted
      : "0",
    feeRecipient:
      config.feeRecipient && isAddress(config.feeRecipient)
        ? config.feeRecipient
        : account,
    feeUsd: sponsorshipRequired ? fixedCharge.feeUsd : charge.feeUsd,
    gasPriceWei: gasPrice.toString(),
    gasUnits: gasUnits.toString(),
    nativeBalanceWei: nativeBalanceWei.toString(),
    requiredNativeWei: charge.bufferedNativeWei.toString(),
    sponsorshipRequired,
  };
}
