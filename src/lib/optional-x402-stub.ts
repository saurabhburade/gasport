/**
 * Empty browser target for Coinbase CDP's optional x402 peer imports.
 *
 * The application deliberately disables Base Account/CDP and exposes Coinbase
 * Wallet only through Reown AppKit. This module must never be used at runtime.
 */
export function toClientEvmSigner(): never {
  throw new Error("Coinbase CDP/x402 support is disabled in this application.");
}
