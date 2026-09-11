import { NextResponse } from "next/server";
import { type Address, isAddress } from "viem";
import { z } from "zod";
import { CHAIN_LIST } from "@/config/chains";
import {
  getAlchemySponsorshipConfig,
  isAlchemySponsorshipConfigured,
} from "@/lib/gas/alchemy";
import { getPublicBundlerUrl, getPublicRpcUrl } from "@/lib/gas/constants";
import {
  calculateFixedSourceGasCharge,
  calculateSourceGasCharge,
  resolveSourceGasFunding,
  sourceGasEstimateRequestSchema,
} from "@/lib/gas/source-gas";
import { encodeErc20Transfer } from "@/lib/gas/wallet-calls";
import {
  invalidRequest,
  readJsonBody,
  requestOneClick,
} from "@/lib/intents/api";
import { tokenResponseSchema } from "@/lib/intents/schemas";
import { sourceTokensFromCatalog } from "@/lib/tokens/source-catalog";

const tokensResponseSchema = z.array(tokenResponseSchema);
const hexQuantitySchema = z.string().regex(/^0x[\da-fA-F]+$/);
const rpcQuantityResponseSchema = z
  .object({ result: hexQuantitySchema })
  .passthrough();
const bundlerGasPriceResponseSchema = z
  .object({
    result: z.object({
      fast: z.object({ maxFeePerGas: hexQuantitySchema }).passthrough(),
    }),
  })
  .passthrough();

const MIN_ERC20_TRANSFER_GAS = 65_000n;
const ACCOUNT_ABSTRACTION_OVERHEAD_GAS = 150_000n;
const USD_STABLE_SYMBOLS = new Set(["USDC", "USDT", "DAI"]);

async function rpcRequest(url: string, method: string, params: unknown[]) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("The source-chain RPC is unavailable.");
  return response.json();
}

async function getGasPriceWei(rpcUrl: string, bundlerUrl?: string) {
  if (bundlerUrl) {
    try {
      const body = await rpcRequest(
        bundlerUrl,
        "pimlico_getUserOperationGasPrice",
        [],
      );
      const parsed = bundlerGasPriceResponseSchema.parse(body);
      return BigInt(parsed.result.fast.maxFeePerGas);
    } catch {
      // A standard RPC gas price keeps self-funded chains usable when the
      // keyless ERC-4337 estimator does not support that network.
    }
  }
  const body = await rpcRequest(rpcUrl, "eth_gasPrice", []);
  const parsed = rpcQuantityResponseSchema.parse(body);
  return BigInt(parsed.result);
}

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body.ok) {
    return invalidRequest("A valid source gas estimate body is required.");
  }
  const parsed = sourceGasEstimateRequestSchema.safeParse(body.value);
  if (!parsed.success) {
    return invalidRequest("Invalid source gas estimate parameters.");
  }

  const {
    account,
    amount,
    chainId,
    quoteOnly,
    token: tokenAddress,
  } = parsed.data;
  const nativeToken = CHAIN_LIST.find((chain) => chain.id === chainId);
  const rpcUrl = getPublicRpcUrl(chainId);
  const bundlerUrl = getPublicBundlerUrl(chainId);
  const configuredFeeRecipient = [
    process.env.SPONSORED_GAS_FEE_RECIPIENT,
    process.env.NEAR_INTENTS_FEE_RECIPIENT,
  ].find((value) => value?.trim());
  const feeRecipient = configuredFeeRecipient?.trim();
  const validFeeRecipient =
    feeRecipient && isAddress(feeRecipient) ? feeRecipient : undefined;
  if (!nativeToken?.intentsAssetId || !rpcUrl) {
    return invalidRequest(
      `Source gas recovery is unavailable on chain ${chainId}.`,
    );
  }
  if (feeRecipient && !validFeeRecipient && !quoteOnly) {
    return NextResponse.json(
      {
        error: "SPONSORED_GAS_FEE_RECIPIENT must be a valid EVM address.",
      },
      { status: 503 },
    );
  }

  const prices = await requestOneClick(
    "/v0/tokens",
    { method: "GET" },
    tokensResponseSchema,
  );
  if (!prices.ok) return prices.response;
  const sourceToken = sourceTokensFromCatalog(prices.data).find(
    (token) =>
      token.chainId === chainId &&
      token.address.toLowerCase() === tokenAddress.toLowerCase(),
  );
  if (!sourceToken) {
    return invalidRequest(
      `The source token is not available from NEAR Intents on chain ${chainId}.`,
    );
  }
  const sourcePrice = prices.data.find(
    (item) => item.assetId === sourceToken.intentsAssetId,
  )?.price;
  const nativePrice = prices.data.find(
    (item) => item.assetId === nativeToken.intentsAssetId,
  )?.price;
  if (
    sourcePrice === undefined ||
    nativePrice === undefined ||
    sourcePrice <= 0 ||
    nativePrice <= 0
  ) {
    return NextResponse.json(
      { error: "Live source-chain token prices are unavailable." },
      { status: 503 },
    );
  }

  let fixedSponsorshipCharge: ReturnType<typeof calculateFixedSourceGasCharge>;
  try {
    fixedSponsorshipCharge = calculateFixedSourceGasCharge({
      amount: BigInt(amount),
      sourceTokenDecimals: sourceToken.decimals,
      sourceTokenUsd: USD_STABLE_SYMBOLS.has(sourceToken.symbol)
        ? 1
        : sourcePrice,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The source amount is below the minimum.",
      },
      { status: 422 },
    );
  }

  try {
    const [gasEstimateBody, maxFeePerGas, nativeBalanceBody] =
      await Promise.all([
        rpcRequest(rpcUrl, "eth_estimateGas", [
          {
            data: encodeErc20Transfer(
              (validFeeRecipient ?? account) as Address,
              1n,
            ),
            from: account,
            to: sourceToken.address,
            value: "0x0",
          },
        ]).catch(() => ({
          result: `0x${MIN_ERC20_TRANSFER_GAS.toString(16)}`,
        })),
        getGasPriceWei(rpcUrl, bundlerUrl),
        rpcRequest(rpcUrl, "eth_getBalance", [account, "latest"]).catch(() => ({
          result: "0x0",
        })),
      ]);
    const gasEstimate = rpcQuantityResponseSchema.safeParse(gasEstimateBody);
    const nativeBalance =
      rpcQuantityResponseSchema.safeParse(nativeBalanceBody);
    const transferGas = gasEstimate.success
      ? BigInt(gasEstimate.data.result)
      : MIN_ERC20_TRANSFER_GAS;
    const gasUnits =
      (transferGas > MIN_ERC20_TRANSFER_GAS
        ? transferGas
        : MIN_ERC20_TRANSFER_GAS) *
        2n +
      ACCOUNT_ABSTRACTION_OVERHEAD_GAS;
    const charge = calculateSourceGasCharge({
      gasPriceWei: maxFeePerGas,
      gasUnits,
      nativeTokenUsd: nativePrice,
      sourceTokenDecimals: sourceToken.decimals,
      sourceTokenUsd: sourcePrice,
    });
    const nativeBalanceWei = nativeBalance.success
      ? BigInt(nativeBalance.data.result)
      : 0n;
    const funding = resolveSourceGasFunding({
      nativeBalanceWei,
      quoteOnly,
      requiredNativeWei: charge.bufferedNativeWei,
      sponsorshipAvailable: isAlchemySponsorshipConfigured(
        getAlchemySponsorshipConfig(chainId),
        chainId,
      ),
    });
    const policyIdVariable = `ALCHEMY_POLICY_ID_${nativeToken.name.toUpperCase()}`;
    const fundingError = `Gas sponsorship is not configured for ${nativeToken.name}. Configure ${policyIdVariable} or ALCHEMY_POLICY_ID, or fund the connected wallet with native ${nativeToken.symbol}.`;
    if (!funding.quoteAvailable) {
      return NextResponse.json(
        {
          error: fundingError,
        },
        { status: 503 },
      );
    }

    const { sponsorshipRequired } = funding;
    const recipientAvailable =
      !sponsorshipRequired || Boolean(validFeeRecipient);
    if (!recipientAvailable && !quoteOnly) {
      return NextResponse.json(
        {
          error:
            "Configure SPONSORED_GAS_FEE_RECIPIENT with the EVM address that receives the sponsorship fee.",
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        executionAvailable: funding.executable && recipientAvailable,
        executionError: !funding.executable
          ? fundingError
          : !recipientAvailable
            ? "Configure SPONSORED_GAS_FEE_RECIPIENT with the EVM address that receives the sponsorship fee."
            : null,
        feeAmount: sponsorshipRequired
          ? fixedSponsorshipCharge.feeAmount.toString()
          : "0",
        feeAmountFormatted: sponsorshipRequired
          ? fixedSponsorshipCharge.feeAmountFormatted
          : "0",
        feeRecipient: validFeeRecipient ?? account,
        feeUsd: sponsorshipRequired
          ? fixedSponsorshipCharge.feeUsd
          : charge.feeUsd,
        gasPriceWei: maxFeePerGas.toString(),
        gasUnits: gasUnits.toString(),
        nativeBalanceWei: nativeBalanceWei.toString(),
        requiredNativeWei: charge.bufferedNativeWei.toString(),
        sponsorshipRequired,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Could not estimate the sponsored source-chain gas." },
      { status: 503 },
    );
  }
}
