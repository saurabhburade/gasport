import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";
import type { NearQuoteResponse } from "@/lib/intents/schemas";

const ED25519_PREFIX = "ed25519:";
const DEFAULT_MANAGER_PUBLIC_KEY =
  "ed25519:reYaWhvwu8Jzo3WUM3zhn6VrhuMEF4eADL17qtRVifc";
const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

type SignedNearQuoteResponse = Omit<NearQuoteResponse, "correlationId"> & {
  correlationId?: string;
};

function decodeBase58(value: string) {
  let decoded = 0n;
  for (const character of value) {
    const index = BASE58_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("Invalid Base58 value.");
    decoded = decoded * 58n + BigInt(index);
  }

  const bytes: number[] = [];
  while (decoded > 0n) {
    bytes.push(Number(decoded & 0xffn));
    decoded >>= 8n;
  }
  bytes.reverse();

  let leadingZeros = 0;
  while (value[leadingZeros] === "1") leadingZeros += 1;
  return Buffer.from([...new Array(leadingZeros).fill(0), ...bytes]);
}

function decodeEd25519(value: string, expectedLength: number) {
  const encoded = value.startsWith(ED25519_PREFIX)
    ? value.slice(ED25519_PREFIX.length)
    : value;
  const decoded = decodeBase58(encoded);
  if (decoded.length !== expectedLength) {
    throw new Error("Invalid Ed25519 value.");
  }
  return decoded;
}

function stableStringify(value: unknown): string | undefined {
  if (value === undefined || typeof value === "function") return undefined;
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value
      .map((item) => stableStringify(item) ?? "null")
      .join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .flatMap((key) => {
      const serialized = stableStringify(record[key]);
      return serialized === undefined
        ? []
        : [`${JSON.stringify(key)}:${serialized}`];
    });
  return `{${entries.join(",")}}`;
}

function signedQuoteRequest(response: SignedNearQuoteResponse) {
  const request = response.quoteRequest;
  return {
    dry: request.dry,
    swapType: request.swapType,
    slippageTolerance: request.slippageTolerance,
    originAsset: request.originAsset,
    depositType: request.depositType,
    destinationAsset: request.destinationAsset,
    amount: request.amount,
    refundTo: request.refundTo,
    refundType: request.refundType,
    recipient: request.recipient,
    recipientType: request.recipientType,
    deadline: request.deadline,
    quoteWaitingTimeMs: request.quoteWaitingTimeMs || undefined,
    referral: request.referral || undefined,
    virtualChainRecipient: request.virtualChainRecipient || undefined,
    virtualChainRefundRecipient:
      request.virtualChainRefundRecipient || undefined,
    customRecipientMsg: request.customRecipientMsg || undefined,
  };
}

function signedQuote(response: SignedNearQuoteResponse) {
  const quote = response.quote;
  const common = {
    amountIn: quote.amountIn,
    amountInFormatted: quote.amountInFormatted,
    amountInUsd: quote.amountInUsd,
    minAmountIn: quote.minAmountIn,
    amountOut: quote.amountOut,
    amountOutFormatted: quote.amountOutFormatted,
    amountOutUsd: quote.amountOutUsd,
    minAmountOut: quote.minAmountOut,
  };
  if (response.quoteRequest.dry) return common;

  return {
    ...common,
    depositAddress: quote.depositAddress || undefined,
    depositMemo: quote.depositMemo || undefined,
    deadline: quote.deadline || undefined,
    timeWhenInactive: quote.timeWhenInactive || undefined,
    timeEstimate: quote.timeEstimate || undefined,
    virtualChainRecipient: quote.virtualChainRecipient || undefined,
    virtualChainRefundRecipient: quote.virtualChainRefundRecipient || undefined,
    customRecipientMsg: quote.customRecipientMsg || undefined,
    refundFee: quote.refundFee || undefined,
    withdrawFee: quote.withdrawFee || undefined,
  };
}

export function verifyNearQuoteSignature(
  response: SignedNearQuoteResponse,
  managerPublicKey = process.env.NEAR_INTENTS_MANAGER_PUBLIC_KEY?.trim() ||
    DEFAULT_MANAGER_PUBLIC_KEY,
) {
  try {
    const payload = stableStringify({
      ...signedQuoteRequest(response),
      ...signedQuote(response),
      timestamp: response.timestamp,
    });
    if (!payload) return false;

    const message = createHash("sha256").update(payload).digest();
    const messageBase58 = (() => {
      let value = BigInt(`0x${message.toString("hex")}`);
      let encoded = "";
      while (value > 0n) {
        encoded = BASE58_ALPHABET[Number(value % 58n)] + encoded;
        value /= 58n;
      }
      for (const byte of message) {
        if (byte !== 0) break;
        encoded = `1${encoded}`;
      }
      return encoded;
    })();

    const publicKeyBytes = decodeEd25519(managerPublicKey, 32);
    const publicKey = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, publicKeyBytes]),
      format: "der",
      type: "spki",
    });
    return verifySignature(
      null,
      Buffer.from(messageBase58),
      publicKey,
      decodeEd25519(response.signature, 64),
    );
  } catch {
    return false;
  }
}
