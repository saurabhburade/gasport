import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateFixedSourceGasCharge,
  calculateSourceGasCharge,
  decimalToScaledBigInt,
  formatScaledBigInt,
  requiresSourceGasSponsorship,
  resolveSourceGasFunding,
} from "./source-gas.ts";
import { calculateNetRouteAmount } from "./source-gas-amount.ts";

test("subtracts the sponsored fee before quoting so the batch spends the exact gross input", () => {
  const grossAmount = 5_000_000n;
  const sponsorshipFee = 1_000_000n;
  const routeAmount = calculateNetRouteAmount({
    grossAmount,
    sponsorshipFee,
  });

  assert.equal(routeAmount, 4_000_000n);
  assert.equal(routeAmount + sponsorshipFee, grossAmount);
});

test("charges a fixed stablecoin sponsorship tier from one to five dollars", () => {
  const cases = [
    ["5000000", "1000000", "1"],
    ["99999999", "1000000", "1"],
    ["100000000", "2000000", "2"],
    ["500000000", "3000000", "3"],
    ["1000000000", "4000000", "4"],
    ["5000000000", "5000000", "5"],
  ] as const;

  for (const [amount, expectedFee, expectedFormatted] of cases) {
    assert.deepEqual(
      calculateFixedSourceGasCharge({
        amount: BigInt(amount),
        sourceTokenDecimals: 6,
        sourceTokenUsd: 1,
      }),
      {
        feeAmount: BigInt(expectedFee),
        feeAmountFormatted: expectedFormatted,
        feeUsd: expectedFormatted,
      },
    );
  }

  assert.throws(
    () =>
      calculateFixedSourceGasCharge({
        amount: 1_000_000n,
        sourceTokenDecimals: 6,
        sourceTokenUsd: 1,
      }),
    /at least \$5/i,
  );

  assert.deepEqual(
    calculateFixedSourceGasCharge({
      amount: 2_000_000_000_000_000n,
      sourceTokenDecimals: 18,
      sourceTokenUsd: 2_500,
    }),
    {
      feeAmount: 400_000_000_000_000n,
      feeAmountFormatted: "0.0004",
      feeUsd: "1",
    },
  );
});

test("converts a buffered native gas estimate into source token units", () => {
  const charge = calculateSourceGasCharge({
    gasPriceWei: 1_000_000_000n,
    gasUnits: 280_000n,
    nativeTokenUsd: 2_500,
    sourceTokenDecimals: 6,
    sourceTokenUsd: 1,
  });

  assert.equal(charge.bufferedNativeWei, 350_000_000_000_000n);
  assert.equal(charge.feeAmount, 875_000n);
  assert.equal(charge.feeAmountFormatted, "0.875");
  assert.equal(charge.feeUsd, "0.875");
});

test("rounds the recovered fee up to the token's smallest unit", () => {
  const charge = calculateSourceGasCharge({
    gasPriceWei: 5_000_000n,
    gasUnits: 280_000n,
    nativeTokenUsd: 2_500,
    sourceTokenDecimals: 6,
    sourceTokenUsd: 1,
  });

  assert.equal(charge.feeAmount, 4_375n);
  assert.equal(charge.feeAmountFormatted, "0.004375");
  assert.equal(charge.feeUsd, "0.004375");
});

test("parses and formats fixed-point prices without token float arithmetic", () => {
  assert.equal(decimalToScaledBigInt("2463.56"), 246_356_000_000n);
  assert.equal(formatScaledBigInt(4_375n, 6), "0.004375");
});

test("requires sponsorship only below the buffered native gas requirement", () => {
  assert.equal(
    requiresSourceGasSponsorship({
      nativeBalanceWei: 99n,
      requiredNativeWei: 100n,
    }),
    true,
  );
  assert.equal(
    requiresSourceGasSponsorship({
      nativeBalanceWei: 100n,
      requiredNativeWei: 100n,
    }),
    false,
  );
  assert.equal(
    requiresSourceGasSponsorship({
      nativeBalanceWei: 101n,
      requiredNativeWei: 100n,
    }),
    false,
  );
});

test("blocks execution when native gas is insufficient and the chain has no paymaster policy", () => {
  assert.deepEqual(
    resolveSourceGasFunding({
      nativeBalanceWei: 0n,
      requiredNativeWei: 100n,
      sponsorshipAvailable: false,
    }),
    {
      executable: false,
      quoteAvailable: false,
      sponsorshipRequired: false,
    },
  );

  assert.deepEqual(
    resolveSourceGasFunding({
      nativeBalanceWei: 0n,
      requiredNativeWei: 100n,
      sponsorshipAvailable: true,
    }),
    {
      executable: true,
      quoteAvailable: true,
      sponsorshipRequired: true,
    },
  );

  assert.deepEqual(
    resolveSourceGasFunding({
      nativeBalanceWei: 100n,
      requiredNativeWei: 100n,
      sponsorshipAvailable: false,
    }),
    {
      executable: true,
      quoteAvailable: true,
      sponsorshipRequired: false,
    },
  );

  assert.deepEqual(
    resolveSourceGasFunding({
      nativeBalanceWei: 100n,
      requiredNativeWei: 100n,
      sponsorshipAvailable: true,
    }),
    {
      executable: true,
      quoteAvailable: true,
      sponsorshipRequired: false,
    },
  );
});

test("keeps indicative quotes available when wallet funding is unknown", () => {
  assert.deepEqual(
    resolveSourceGasFunding({
      nativeBalanceWei: 0n,
      quoteOnly: true,
      requiredNativeWei: 100n,
      sponsorshipAvailable: false,
    }),
    {
      executable: false,
      quoteAvailable: true,
      sponsorshipRequired: false,
    },
  );

  assert.deepEqual(
    resolveSourceGasFunding({
      nativeBalanceWei: 0n,
      quoteOnly: true,
      requiredNativeWei: 100n,
      sponsorshipAvailable: true,
    }),
    {
      executable: true,
      quoteAvailable: true,
      sponsorshipRequired: true,
    },
  );
});
