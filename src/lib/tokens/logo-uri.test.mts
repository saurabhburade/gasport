import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTokenLogoUri, trustWalletTokenLogoUri } from "./logo-uri.ts";

test("builds Trust Wallet logo URLs from a token address and chain", () => {
  assert.equal(
    trustWalletTokenLogoUri({
      address: "0x4186BFC76E2E237523CBC30FD220FE055156b41F",
      chainId: 42161,
    }),
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/assets/0x4186BFC76E2E237523CBC30FD220FE055156b41F/logo.png",
  );
});

test("accepts known HTTPS token-list image hosts", () => {
  assert.equal(
    normalizeTokenLogoUri(
      "https://assets.coingecko.com/coins/images/12645/thumb/AAVE.png?1601374110",
    ),
    "https://assets.coingecko.com/coins/images/12645/thumb/AAVE.png?1601374110",
  );
});

test("normalizes IPFS token logos through the configured gateway", () => {
  assert.equal(
    normalizeTokenLogoUri("ipfs://QmTokenLogo"),
    "https://ipfs.io/ipfs/QmTokenLogo",
  );
});

test("rejects insecure and unapproved token-list image hosts", () => {
  assert.equal(
    normalizeTokenLogoUri("http://assets.coingecko.com/logo.png"),
    undefined,
  );
  assert.equal(
    normalizeTokenLogoUri("https://untrusted.example/logo.png"),
    undefined,
  );
});
