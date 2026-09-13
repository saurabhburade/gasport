import { decodeAbiParameters, type Hex } from "viem";
import { CHAIN_LIST } from "../../config/chains.ts";
import type { WalletCallsRequest } from "./wallet-calls/types.ts";

// These public RPCs currently support eth_simulateV1 with sequential state changes.
const SIMULATION_CHAIN_IDS = new Set([
  1, 10, 56, 100, 137, 8453, 9745, 36900, 42161, 80094,
]);
const BASE_SIMULATION_URL = "https://mainnet-preconf.base.org";

export class RouteSimulationError extends Error {
  readonly refreshQuote: boolean;

  constructor(message: string, refreshQuote = false) {
    super(message);
    this.name = "RouteSimulationError";
    this.refreshQuote = refreshQuote;
  }
}

function simulationFailureMessage(error: unknown) {
  if (error && typeof error === "object") {
    const { data, message } = error as { data?: unknown; message?: unknown };
    if (typeof data === "string" && /^0x[\da-f]*$/i.test(data)) {
      try {
        if (data.slice(0, 10).toLowerCase() === "0x08c379a0") {
          const [reason] = decodeAbiParameters(
            [{ type: "string" }],
            `0x${data.slice(10)}` as Hex,
          );
          if (reason.toLowerCase() === "insufficient output") {
            return "Simulation predicts the swap will miss its minimum output. Refresh the quote before trying again.";
          }
        }
      } catch {
        // Keep a safe generic message for malformed RPC revert data.
      }
    }
    if (
      typeof message === "string" &&
      message.toLowerCase().includes("insufficient output")
    ) {
      return "Simulation predicts the swap will miss its minimum output. Refresh the quote before trying again.";
    }
  }
  return "Simulation predicts the source transaction will fail. Refresh the quote before trying again.";
}

export async function simulateRouteCalls(
  request: WalletCallsRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<"passed" | "unsupported"> {
  const batch = request.params[0];
  const chainId = Number.parseInt(batch.chainId.slice(2), 16);
  if (!SIMULATION_CHAIN_IDS.has(chainId)) return "unsupported";

  const rpcUrl =
    chainId === 8453
      ? BASE_SIMULATION_URL
      : CHAIN_LIST.find((chain) => chain.id === chainId)?.publicRpcUrl;
  if (!rpcUrl) return "unsupported";

  let response: Response;
  try {
    response = await fetchImpl(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_simulateV1",
        params: [
          {
            blockStateCalls: [
              {
                calls: batch.calls.map((call) => ({
                  from: batch.from,
                  to: call.to,
                  data: call.data,
                  value: call.value,
                })),
              },
            ],
            validation: false,
          },
          chainId === 8453 ? "pending" : "latest",
        ],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new RouteSimulationError(
      "Could not reach the simulation service. No transaction was submitted. Try again.",
    );
  }
  if (!response.ok) {
    throw new RouteSimulationError(
      "The simulation service is unavailable. No transaction was submitted. Try again.",
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new RouteSimulationError(
      "The simulation service returned an invalid response. No transaction was submitted. Try again.",
    );
  }
  const rpc = body as {
    error?: unknown;
    result?: { calls?: { error?: unknown; status?: unknown }[] }[];
  };
  if (rpc?.error || !Array.isArray(rpc?.result)) {
    throw new RouteSimulationError(
      "The simulation service could not check this transaction. No transaction was submitted. Try again.",
    );
  }
  const results = rpc.result[0]?.calls;
  if (!Array.isArray(results) || results.length !== batch.calls.length) {
    throw new RouteSimulationError(
      "The simulation service returned incomplete results. No transaction was submitted. Try again.",
    );
  }
  for (const result of results) {
    if (result?.status === "0x0") {
      throw new RouteSimulationError(
        simulationFailureMessage(result.error),
        true,
      );
    }
    if (result?.status !== "0x1") {
      throw new RouteSimulationError(
        "The simulation service returned an invalid result. No transaction was submitted. Try again.",
      );
    }
  }
  return "passed";
}
