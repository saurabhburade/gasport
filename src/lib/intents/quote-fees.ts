type AppFee = {
  fee: number;
};

export type QuoteFeeBreakdown = {
  nearProtocolFeeRate: string;
  nearProtocolFeeToken: number;
  nearProtocolFeeUsd: number;
  oneClickFeeRate: string;
  oneClickFeeToken: number;
  oneClickFeeUsd: number;
  platformFeeRate: string;
  platformFeeToken: number;
  platformFeeUsd: number;
  routeCostUsd: number;
  totalFeeUsd: number;
};

const nearProtocolFeeBps = 0.01;
const unauthenticatedOneClickFeeBps = 20;

function roundUsd(value: number) {
  return Math.round((value + Number.EPSILON) * 100_000_000) / 100_000_000;
}

function roundToken(value: number) {
  return (
    Math.round((value + Number.EPSILON) * 1_000_000_000_000) / 1_000_000_000_000
  );
}

function formatFeeRate(feeBps: number) {
  if (feeBps === 0) return "0%";
  return feeBps < 1
    ? `${(feeBps / 100).toFixed(4)}%`
    : `${(feeBps / 100).toFixed(2)}%`;
}

export function getQuoteFeeBreakdown({
  amountInUsd,
  amountInFormatted,
  amountOutUsd,
  appFees,
  hasNearIntentsApiKey,
  returnedAppFees,
}: {
  amountInUsd: string;
  amountInFormatted: string;
  amountOutUsd: string;
  appFees: AppFee[];
  hasNearIntentsApiKey: boolean;
  returnedAppFees?: AppFee[];
}): QuoteFeeBreakdown {
  const inputUsd = Number(amountInUsd);
  const inputToken = Number(amountInFormatted);
  const outputUsd = Number(amountOutUsd);
  const safeInputUsd = Number.isFinite(inputUsd) ? Math.max(0, inputUsd) : 0;
  const safeInputToken = Number.isFinite(inputToken)
    ? Math.max(0, inputToken)
    : 0;
  const safeOutputUsd = Number.isFinite(outputUsd) ? Math.max(0, outputUsd) : 0;
  const configuredAppFeeBps = appFees.reduce(
    (total, fee) => total + (Number.isFinite(fee.fee) ? fee.fee : 0),
    0,
  );
  const returnedAppFeeBps = returnedAppFees?.reduce(
    (total, fee) => total + (Number.isFinite(fee.fee) ? fee.fee : 0),
    0,
  );
  // appFees is the full fee charged to the user. 1Click's default 50/50
  // revenue share changes where that fee is settled, not the user-facing
  // fee rate. Keep the revenue split out of the quote fee breakdown.
  const platformFeeBps = configuredAppFeeBps;
  const oneClickFeeBps =
    returnedAppFeeBps === undefined
      ? hasNearIntentsApiKey
        ? 0
        : unauthenticatedOneClickFeeBps
      : Math.max(0, returnedAppFeeBps - configuredAppFeeBps);
  const totalFeeUsd = roundUsd(Math.max(0, safeInputUsd - safeOutputUsd));
  const platformFeeUsd = roundUsd((safeInputUsd * platformFeeBps) / 10_000);
  const oneClickFeeUsd = roundUsd((safeInputUsd * oneClickFeeBps) / 10_000);
  const nearProtocolFeeUsd = roundUsd(
    (safeInputUsd * nearProtocolFeeBps) / 10_000,
  );

  return {
    nearProtocolFeeRate: formatFeeRate(nearProtocolFeeBps),
    nearProtocolFeeToken: roundToken(
      (safeInputToken * nearProtocolFeeBps) / 10_000,
    ),
    nearProtocolFeeUsd,
    oneClickFeeRate: formatFeeRate(oneClickFeeBps),
    oneClickFeeToken: roundToken((safeInputToken * oneClickFeeBps) / 10_000),
    oneClickFeeUsd,
    platformFeeRate: formatFeeRate(platformFeeBps),
    platformFeeToken: roundToken((safeInputToken * platformFeeBps) / 10_000),
    platformFeeUsd,
    routeCostUsd: roundUsd(
      Math.max(
        0,
        totalFeeUsd - platformFeeUsd - oneClickFeeUsd - nearProtocolFeeUsd,
      ),
    ),
    totalFeeUsd,
  };
}
