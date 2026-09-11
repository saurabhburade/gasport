import { isAddress } from "viem";
import { RouteAdapterError } from "../../types.ts";

export function adapterError(
  code: ConstructorParameters<typeof RouteAdapterError>[1],
  message: string,
  cause?: unknown,
): never {
  throw new RouteAdapterError("near-1click", code, message, cause);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export function assertAddress(value: unknown, label: string) {
  if (typeof value !== "string" || !isAddress(value)) {
    adapterError(
      "invalid_request",
      `The ${label} must be a valid EVM address.`,
    );
  }
}

export function sameAddress(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}
