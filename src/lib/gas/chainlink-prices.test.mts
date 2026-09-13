import assert from "node:assert/strict";
import test from "node:test";
import { encodeAbiParameters } from "viem";
import ethereumChain from "../../config/chains/ethereum.json" with {
  type: "json",
};
import gnosisChain from "../../config/chains/gnosis.json" with { type: "json" };
import ethereumTokens from "../../config/tokens/1.json" with { type: "json" };
import {
  getChainlinkUsdPrice,
  parseChainlinkUsdPrice,
} from "./chainlink-prices.ts";

const roundDataParameters = [
  { type: "uint80" },
  { type: "int256" },
  { type: "uint256" },
  { type: "uint256" },
  { type: "uint80" },
] as const;
const nowSeconds = 1_000_000;

function roundData(answer: bigint, updatedAt = BigInt(nowSeconds - 60)) {
  return {
    result: encodeAbiParameters(roundDataParameters, [
      5n,
      answer,
      0n,
      updatedAt,
      5n,
    ]),
  };
}

function parsedPrice(roundResult: unknown) {
  return parseChainlinkUsdPrice({
    decimalsResult: { result: "0x08" },
    heartbeatSeconds: 3_600,
    nowSeconds,
    roundResult,
  });
}

test("reads a fresh positive Chainlink answer as a decimal USD price", () => {
  assert.equal(parsedPrice(roundData(253_971_050_000n)), "2539.7105");
});

test("rejects stale, future, nonpositive, and malformed feed answers", () => {
  assert.equal(
    parsedPrice(roundData(100_000_000n, BigInt(nowSeconds - 5_401))),
    undefined,
  );
  assert.equal(
    parsedPrice(roundData(100_000_000n, BigInt(nowSeconds + 61))),
    undefined,
  );
  assert.equal(parsedPrice(roundData(0n)), undefined);
  assert.equal(parsedPrice({ result: "0x" }), undefined);
  assert.equal(
    parseChainlinkUsdPrice({
      decimalsResult: { result: "0x64" },
      heartbeatSeconds: 3_600,
      nowSeconds,
      roundResult: roundData(100_000_000n),
    }),
    undefined,
  );
});

test("reads feeds from the token and native chain records", async () => {
  const feed = ethereumChain.chainlinkUsdFeed;
  assert.equal(
    feed.address,
    ethereumTokens.find((token) => token.symbol === "WETH")?.chainlinkUsdFeed
      ?.address,
  );
  assert.equal("chainlinkUsdFeed" in gnosisChain, false);

  const calls: unknown[][] = [];
  const price = await getChainlinkUsdPrice({
    feed,
    rpcUrl: "https://example.invalid",
    rpcRequest: async (_url, method, params) => {
      assert.equal(method, "eth_call");
      calls.push(params);
      const call = params[0] as { to: string; data: string };
      assert.equal(call.to, feed?.address);
      return call.data === "0x313ce567"
        ? { result: "0x08" }
        : roundData(253_971_050_000n, BigInt(Math.floor(Date.now() / 1000)));
    },
  });
  assert.equal(price, "2539.7105");
  assert.equal(calls.length, 2);
});
