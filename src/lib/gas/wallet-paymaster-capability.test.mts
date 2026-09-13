import assert from "node:assert/strict";
import test from "node:test";
import {
  supportsSponsoredAtomicCalls,
  walletSupportsSponsoredAtomicCalls,
} from "./wallet-paymaster-capability.ts";

const account = "0x1111111111111111111111111111111111111111";

test("accepts sponsored atomic calls only for the requested chain", () => {
  const capabilities = {
    "0x2105": {
      atomic: { status: "supported" },
      paymasterService: { supported: true },
    },
  };
  assert.equal(supportsSponsoredAtomicCalls(capabilities, 8453), true);
  assert.equal(supportsSponsoredAtomicCalls(capabilities, 143), false);
});

test("does not claim sponsorship for an upgradeable or unsponsored account", () => {
  assert.equal(
    supportsSponsoredAtomicCalls(
      {
        "0x8f": {
          atomic: { status: "ready" },
          paymasterService: { supported: true },
        },
      },
      143,
    ),
    false,
  );
  assert.equal(
    supportsSponsoredAtomicCalls(
      {
        "0x8F": {
          atomic: { status: "supported" },
          paymasterService: { supported: false },
        },
      },
      143,
    ),
    false,
  );
});

test("honors global capabilities and chain-specific overrides", () => {
  assert.equal(
    supportsSponsoredAtomicCalls(
      {
        "0x0": {
          atomic: { status: "supported" },
          paymasterService: { supported: true },
        },
        "0x8f": { paymasterService: { supported: false } },
      },
      143,
    ),
    false,
  );
});

test("queries the wallet and fails closed when capabilities are unavailable", async () => {
  let seen: unknown;
  const supported = await walletSupportsSponsoredAtomicCalls({
    account,
    chainId: 143,
    provider: {
      request: async (args) => {
        seen = args;
        return {
          "0x8f": {
            atomic: { status: "supported" },
            paymasterService: { supported: true },
          },
        };
      },
    },
  });
  assert.equal(supported, true);
  assert.deepEqual(seen, {
    method: "wallet_getCapabilities",
    params: [account, ["0x8f"]],
  });
  assert.equal(
    await walletSupportsSponsoredAtomicCalls({
      account,
      chainId: 143,
      provider: {
        request: async () => {
          throw new Error("not supported");
        },
      },
    }),
    false,
  );
});
