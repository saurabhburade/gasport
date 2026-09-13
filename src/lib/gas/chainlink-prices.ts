import { decodeAbiParameters, formatUnits, isAddress } from "viem";
import type { ChainlinkUsdFeed } from "@/types/tokens";

type RpcRequest = (
  url: string,
  method: string,
  params: unknown[],
) => Promise<unknown>;

const roundDataParameters = [
  { type: "uint80" },
  { type: "int256" },
  { type: "uint256" },
  { type: "uint256" },
  { type: "uint80" },
] as const;

export function parseChainlinkUsdPrice({
  decimalsResult,
  heartbeatSeconds,
  nowSeconds,
  roundResult,
}: {
  decimalsResult: unknown;
  heartbeatSeconds: number;
  nowSeconds: number;
  roundResult: unknown;
}): string | undefined {
  const decimalsHex =
    decimalsResult &&
    typeof decimalsResult === "object" &&
    "result" in decimalsResult
      ? decimalsResult.result
      : undefined;
  const roundHex =
    roundResult && typeof roundResult === "object" && "result" in roundResult
      ? roundResult.result
      : undefined;
  if (
    typeof decimalsHex !== "string" ||
    !/^0x[\da-fA-F]+$/.test(decimalsHex) ||
    typeof roundHex !== "string" ||
    !/^0x[\da-fA-F]+$/.test(roundHex) ||
    !Number.isFinite(heartbeatSeconds) ||
    heartbeatSeconds <= 0
  ) {
    return undefined;
  }

  try {
    const decimals = Number(BigInt(decimalsHex));
    if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 36) {
      return undefined;
    }
    const [roundId, answer, , updatedAt, answeredInRound] = decodeAbiParameters(
      roundDataParameters,
      roundHex as `0x${string}`,
    );
    const maxAgeSeconds = Math.max(Math.ceil(heartbeatSeconds * 1.5), 300);
    if (
      roundId === 0n ||
      answer <= 0n ||
      answeredInRound < roundId ||
      updatedAt === 0n ||
      updatedAt > BigInt(nowSeconds + 60) ||
      BigInt(nowSeconds) - updatedAt > BigInt(maxAgeSeconds)
    ) {
      return undefined;
    }
    return formatUnits(answer, decimals);
  } catch {
    return undefined;
  }
}

export async function getChainlinkUsdPrice({
  feed,
  rpcRequest,
  rpcUrl,
}: {
  feed: ChainlinkUsdFeed | undefined;
  rpcRequest: RpcRequest;
  rpcUrl: string;
}): Promise<string | undefined> {
  if (!feed || !isAddress(feed.address)) return undefined;

  try {
    const [decimalsResult, roundResult] = await Promise.all([
      rpcRequest(rpcUrl, "eth_call", [
        { to: feed.address, data: "0x313ce567" },
        "latest",
      ]),
      rpcRequest(rpcUrl, "eth_call", [
        { to: feed.address, data: "0xfeaf968c" },
        "latest",
      ]),
    ]);
    return parseChainlinkUsdPrice({
      decimalsResult,
      heartbeatSeconds: feed.heartbeatSeconds,
      nowSeconds: Math.floor(Date.now() / 1000),
      roundResult,
    });
  } catch {
    return undefined;
  }
}
