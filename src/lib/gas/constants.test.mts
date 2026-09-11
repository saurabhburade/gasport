import assert from "node:assert/strict";
import test from "node:test";
import {
  ALCHEMY_NETWORKS,
  getPublicBundlerUrl,
  getPublicRpcUrl,
  PUBLIC_BUNDLER_URL_BY_CHAIN_ID,
  PUBLIC_RPC_URL_BY_CHAIN_ID,
  resolveAlchemyPolicyId,
} from "./constants.ts";

test("prefers a chain policy and falls back to the common Alchemy policy", () => {
  assert.equal(
    resolveAlchemyPolicyId("optimism-policy", "common-policy"),
    "optimism-policy",
  );
  assert.equal(
    resolveAlchemyPolicyId(undefined, "common-policy"),
    "common-policy",
  );
  assert.equal(
    resolveAlchemyPolicyId("  ", " common-policy "),
    "common-policy",
  );
  assert.equal(resolveAlchemyPolicyId(undefined, "  "), undefined);
});

test("maps every sponsored chain to its keyless Pimlico bundler", () => {
  assert.deepEqual(PUBLIC_BUNDLER_URL_BY_CHAIN_ID, {
    1: "https://public.pimlico.io/v2/1/rpc",
    143: "https://public.pimlico.io/v2/143/rpc",
    8453: "https://public.pimlico.io/v2/8453/rpc",
    42161: "https://public.pimlico.io/v2/42161/rpc",
    10: "https://public.pimlico.io/v2/10/rpc",
  });

  assert.equal(getPublicBundlerUrl(8453), PUBLIC_BUNDLER_URL_BY_CHAIN_ID[8453]);
  assert.equal(getPublicBundlerUrl(137), undefined);
});

test("maps Monad Mainnet to the Alchemy app policy endpoint", () => {
  assert.equal(ALCHEMY_NETWORKS[143].name, "Monad Mainnet");
  assert.equal(ALCHEMY_NETWORKS[143].rpcHost, "monad-mainnet.g.alchemy.com");
});

test("maps every NEAR Intents EVM chain to a keyless RPC endpoint", () => {
  assert.deepEqual(PUBLIC_RPC_URL_BY_CHAIN_ID, {
    1: "https://eth.drpc.org",
    10: "https://optimism.drpc.org",
    56: "https://56.rpc.thirdweb.com",
    100: "https://rpc.gnosischain.com",
    137: "https://polygon.drpc.org",
    143: "https://rpc.monad.xyz",
    196: "https://xlayerrpc.okx.com",
    8453: "https://base.drpc.org",
    9745: "https://rpc.plasma.to",
    36900: "https://rpc.adifoundation.ai",
    42161: "https://arbitrum.drpc.org",
    43114: "https://api.avax.network/ext/bc/C/rpc",
    534352: "https://rpc.scroll.io",
    80094: "https://rpc.berachain.com",
    1313161554: "https://mainnet.aurora.dev",
  });
  assert.equal(getPublicRpcUrl(10), "https://optimism.drpc.org");
  assert.equal(getPublicRpcUrl(137), "https://polygon.drpc.org");
  assert.equal(getPublicRpcUrl(999999), undefined);
});
