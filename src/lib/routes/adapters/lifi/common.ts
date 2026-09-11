import { formatUnits, type Hex, isAddress } from "viem";
import { RouteAdapterError } from "../../types.ts";
import { NATIVE_TOKEN_ADDRESS } from "./constants.ts";
import type { JsonRecord } from "./types.ts";

export function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function isNonNegativeIntegerString(value: unknown): value is string {
  return typeof value === "string" && /^(?:0|[1-9]\d*)$/.test(value);
}

export function isPositiveIntegerString(value: unknown): value is string {
  return isNonNegativeIntegerString(value) && value !== "0";
}

export function isHexBytes(value: unknown): value is Hex {
  return typeof value === "string" && /^0x(?:[\da-fA-F]{2})*$/.test(value);
}

export function isHexQuantity(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[\da-fA-F]+$/.test(value);
}

export function isTransactionHash(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[\da-fA-F]{64}$/.test(value);
}

export function isNativeToken(address: string) {
  return address.toLowerCase() === NATIVE_TOKEN_ADDRESS;
}

export function invalidRequest(message: string): RouteAdapterError {
  return new RouteAdapterError("lifi", "invalid_request", message);
}

export function providerError(
  message: string,
  cause?: unknown,
): RouteAdapterError {
  return new RouteAdapterError("lifi", "provider_error", message, cause);
}

export function requireRecord(value: unknown, message: string): JsonRecord {
  if (!isRecord(value)) throw providerError(message);
  return value;
}

export function requireString(
  record: JsonRecord,
  key: string,
  message: string,
): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw providerError(message);
  }
  return value;
}

export function requireAddress(
  record: JsonRecord,
  key: string,
  message: string,
) {
  const value = requireString(record, key, message);
  if (!isAddress(value)) throw providerError(message);
  return value;
}

export function requireChainId(
  record: JsonRecord,
  key: string,
  message: string,
) {
  const value = record[key];
  if (!isPositiveInteger(value)) throw providerError(message);
  return value;
}

export function formatAmount(amount: string, decimals: number) {
  try {
    return formatUnits(BigInt(amount), decimals);
  } catch {
    throw providerError("LI.FI returned an unformattable amount.");
  }
}
