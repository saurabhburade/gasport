import assert from "node:assert/strict";
import test from "node:test";
import { CHAIN_BY_ID, CHAIN_LIST } from "./chains.ts";

test("includes every EVM chain documented by NEAR Intents", () => {
  assert.deepEqual(
    CHAIN_LIST.map((chain) => chain.id),
    [
      1, 42161, 8453, 80094, 56, 100, 10, 9745, 137, 43114, 143, 196, 534352,
      36900, 1313161554,
    ],
  );
  assert.equal(new Set(CHAIN_LIST.map((chain) => chain.id)).size, 15);
});

test("only enables native gas destinations present in the live 1Click catalog", () => {
  const aurora = CHAIN_BY_ID[1313161554];
  assert.equal(aurora?.intentsAssetId, undefined);
  assert.equal(CHAIN_LIST.filter((chain) => chain.intentsAssetId).length, 14);
});

test("loads UI metadata and GitHub logo sources from per-chain JSON", () => {
  const monad = CHAIN_BY_ID[143];
  assert.equal(
    monad?.logoURI,
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/monad/info/square_logo.png",
  );
  assert.ok(CHAIN_LIST.every((chain) => chain.logoURI.startsWith("https://")));
  assert.ok(
    CHAIN_LIST.every((chain) => chain.logoSourceUrl.includes("github.com/")),
  );
  assert.ok(CHAIN_LIST.every((chain) => chain.decimals === 18));
  assert.ok(Object.isFrozen(CHAIN_LIST));
  assert.ok(Object.isFrozen(CHAIN_LIST[0]));
  assert.ok(Object.isFrozen(CHAIN_LIST[0]?.fees));
});
