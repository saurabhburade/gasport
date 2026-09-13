import { z } from "zod";

export const SOURCE_GAS_PRICE_SCALE = 8;
export const SOURCE_GAS_BUFFER_BPS = 12_500n;
const USD_STABLE_SYMBOLS = new Set([
  "USDC",
  "USDT",
  "USDT0",
  "DAI",
  "USD1",
  "USDF",
]);

export function isUsdStableToken(symbol: string) {
  return USD_STABLE_SYMBOLS.has(symbol.toUpperCase());
}

export function sponsorshipSourceTokenUsd(
  symbol: string,
  quotedUsd: string | number,
) {
  return isUsdStableToken(symbol) ? 1 : quotedUsd;
}

export const sourceGasEstimateRequestSchema = z
  .object({
    account: z.string().regex(/^0x[\da-fA-F]{40}$/),
    amount: z.string().regex(/^[1-9]\d*$/),
    chainId: z.number().int().positive(),
    quoteOnly: z.boolean().optional().default(false),
    token: z.string().regex(/^0x[\da-fA-F]{40}$/),
  })
  .strict();

export const sourceGasEstimateResponseSchema = z
  .object({
    executionAvailable: z.boolean(),
    executionError: z.string().nullable(),
    feeAmount: z.string().regex(/^\d+$/),
    feeAmountFormatted: z.string().min(1),
    feeRecipient: z.string().regex(/^0x[\da-fA-F]{40}$/),
    feeUsd: z.string().min(1),
    gasPriceWei: z.string().regex(/^\d+$/),
    gasUnits: z.string().regex(/^\d+$/),
    nativeBalanceWei: z.string().regex(/^\d+$/),
    requiredNativeWei: z.string().regex(/^\d+$/),
    sponsorshipRequired: z.boolean(),
  })
  .strict();

export type SourceGasEstimate = z.infer<typeof sourceGasEstimateResponseSchema>;

function ceilDiv(value: bigint, divisor: bigint) {
  return (value + divisor - 1n) / divisor;
}

export function requiresSourceGasSponsorship({
  nativeBalanceWei,
  requiredNativeWei,
}: {
  nativeBalanceWei: bigint;
  requiredNativeWei: bigint;
}) {
  if (nativeBalanceWei < 0n || requiredNativeWei <= 0n) {
    throw new Error("The native gas balance or requirement is invalid.");
  }
  return nativeBalanceWei < requiredNativeWei;
}

export function resolveSourceGasFunding({
  nativeBalanceWei,
  quoteOnly = false,
  requiredNativeWei,
  sponsorshipAvailable,
}: {
  nativeBalanceWei: bigint;
  quoteOnly?: boolean;
  requiredNativeWei: bigint;
  sponsorshipAvailable: boolean;
}) {
  const nativeGasRequired = requiresSourceGasSponsorship({
    nativeBalanceWei,
    requiredNativeWei,
  });
  const sponsorshipRequired = nativeGasRequired && sponsorshipAvailable;

  return {
    executable: sponsorshipAvailable || !nativeGasRequired,
    quoteAvailable: quoteOnly || sponsorshipAvailable || !nativeGasRequired,
    sponsorshipRequired,
  };
}

export function calculateFixedSourceGasCharge({
  amount,
  sourceTokenDecimals,
  sourceTokenUsd,
}: {
  amount: bigint;
  sourceTokenDecimals: number;
  sourceTokenUsd: string | number;
}) {
  if (amount <= 0n) throw new Error("The source amount must be positive.");
  if (!Number.isInteger(sourceTokenDecimals) || sourceTokenDecimals < 0) {
    throw new Error("The source token decimals are invalid.");
  }

  const sourceUsdScaled = decimalToScaledBigInt(sourceTokenUsd);
  if (sourceUsdScaled <= 0n) {
    throw new Error("The token price must be positive.");
  }
  const scale = 10n ** BigInt(SOURCE_GAS_PRICE_SCALE);
  const tokenUnit = 10n ** BigInt(sourceTokenDecimals);
  const inputUsdScaled = (amount * sourceUsdScaled) / tokenUnit;
  if (inputUsdScaled < 5n * scale) {
    throw new Error("Enter at least $5 of the source token.");
  }

  const feeAmount = ceilDiv(scale * tokenUnit, sourceUsdScaled);
  if (feeAmount >= amount) {
    throw new Error("Enter more than the sponsorship fee.");
  }

  return {
    feeAmount,
    feeAmountFormatted: formatScaledBigInt(feeAmount, sourceTokenDecimals),
    feeUsd: "1",
  };
}

export function decimalToScaledBigInt(
  value: string | number,
  scale = SOURCE_GAS_PRICE_SCALE,
) {
  const normalized =
    typeof value === "number" ? value.toFixed(scale) : value.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) throw new Error("The token price is invalid.");
  const whole = match[1] ?? "0";
  const fractional = (match[2] ?? "").padEnd(scale, "0").slice(0, scale);
  return BigInt(whole) * 10n ** BigInt(scale) + BigInt(fractional || "0");
}

export function formatScaledBigInt(value: bigint, scale: number) {
  const divisor = 10n ** BigInt(scale);
  const whole = value / divisor;
  const fractional = (value % divisor)
    .toString()
    .padStart(scale, "0")
    .replace(/0+$/, "");
  return fractional ? `${whole}.${fractional}` : whole.toString();
}

export function calculateSourceGasCharge({
  gasPriceWei,
  gasUnits,
  nativeTokenUsd,
  sourceTokenDecimals,
  sourceTokenUsd,
}: {
  gasPriceWei: bigint;
  gasUnits: bigint;
  nativeTokenUsd: string | number;
  sourceTokenDecimals: number;
  sourceTokenUsd: string | number;
}) {
  if (gasPriceWei <= 0n || gasUnits <= 0n) {
    throw new Error("The source gas estimate must be positive.");
  }
  if (!Number.isInteger(sourceTokenDecimals) || sourceTokenDecimals < 0) {
    throw new Error("The source token decimals are invalid.");
  }

  const nativeUsdScaled = decimalToScaledBigInt(nativeTokenUsd);
  const sourceUsdScaled = decimalToScaledBigInt(sourceTokenUsd);
  if (nativeUsdScaled <= 0n || sourceUsdScaled <= 0n) {
    throw new Error("The token price must be positive.");
  }

  const bufferedNativeWei = ceilDiv(
    gasUnits * gasPriceWei * SOURCE_GAS_BUFFER_BPS,
    10_000n,
  );
  const feeAmount = ceilDiv(
    bufferedNativeWei * nativeUsdScaled * 10n ** BigInt(sourceTokenDecimals),
    10n ** 18n * sourceUsdScaled,
  );
  const feeUsdScaled = ceilDiv(
    feeAmount * sourceUsdScaled,
    10n ** BigInt(sourceTokenDecimals),
  );

  return {
    bufferedNativeWei,
    feeAmount,
    feeAmountFormatted: formatScaledBigInt(feeAmount, sourceTokenDecimals),
    feeUsd: formatScaledBigInt(feeUsdScaled, SOURCE_GAS_PRICE_SCALE),
  };
}
