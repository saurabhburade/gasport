import { getAlchemySponsorshipConfig } from "@/lib/gas/alchemy";
import { getAlchemyNetwork } from "@/lib/gas/constants";
import {
  getJsonRpcId,
  getPaymasterRequestChainId,
  PaymasterRequestError,
  prepareAlchemyPaymasterRequest,
} from "@/lib/gas/paymaster-proxy";

const MAX_REQUEST_LENGTH = 128 * 1024;
const UPSTREAM_TIMEOUT_MS = 10_000;

const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "Content-Type, ngrok-skip-browser-warning",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
} as const;

function rpcError(
  id: string | number | null,
  code: number,
  message: string,
  status: number,
) {
  return Response.json(
    { jsonrpc: "2.0", id, error: { code, message } },
    { status, headers: CORS_HEADERS },
  );
}

function hasOversizedRequestBody(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (!contentLength) return false;
  const parsedLength = Number(contentLength);
  return (
    Number.isSafeInteger(parsedLength) && parsedLength > MAX_REQUEST_LENGTH
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function GET(request: Request) {
  const rawChainId = new URL(request.url).searchParams.get("chainId");
  const chainId = rawChainId ? Number(rawChainId) : Number.NaN;
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    return Response.json(
      { error: "A valid source chain ID is required." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const network = getAlchemyNetwork(chainId);
  if (!network) {
    return Response.json(
      { error: `Chain ${chainId} is not supported for sponsored deposits.` },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const config = getAlchemySponsorshipConfig(chainId);
  if (!config.paymasterUrl || !config.policyId) {
    const policyIdVariable = `ALCHEMY_POLICY_ID_${network.name
      .replace(/\s+(MAINNET|ONE)$/i, "")
      .toUpperCase()}`;
    return Response.json(
      {
        error: `Gas sponsorship is not configured for ${network.name}. Configure ${policyIdVariable} or ALCHEMY_POLICY_ID, or fund the connected wallet with native gas.`,
      },
      { status: 503, headers: CORS_HEADERS },
    );
  }

  return Response.json({ available: true, chainId }, { headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  if (hasOversizedRequestBody(request)) {
    return rpcError(null, -32600, "Paymaster request is too large.", 413);
  }

  let value: unknown;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_LENGTH) {
      return rpcError(null, -32600, "Paymaster request is too large.", 413);
    }
    value = JSON.parse(rawBody);
  } catch {
    return rpcError(null, -32700, "A valid JSON body is required.", 400);
  }

  const id = getJsonRpcId(value);
  let chainId: number;
  try {
    chainId = getPaymasterRequestChainId(value);
  } catch (error) {
    if (error instanceof PaymasterRequestError) {
      return rpcError(id, error.code, error.message, 400);
    }
    return rpcError(id, -32602, "Invalid paymaster chain ID.", 400);
  }
  const network = getAlchemyNetwork(chainId);
  if (!network) {
    return rpcError(
      id,
      -32602,
      `Chain ${chainId} is not supported for sponsored deposits.`,
      400,
    );
  }
  const config = getAlchemySponsorshipConfig(chainId);
  if (!config.paymasterUrl || !config.policyId) {
    return rpcError(
      id,
      -32000,
      `Alchemy sponsorship is not configured for ${network.name}.`,
      503,
    );
  }

  let body: ReturnType<typeof prepareAlchemyPaymasterRequest>;
  try {
    body = prepareAlchemyPaymasterRequest(value, config.policyId, chainId);
  } catch (error) {
    if (error instanceof PaymasterRequestError) {
      return rpcError(id, error.code, error.message, 400);
    }
    return rpcError(id, -32600, "Invalid paymaster request.", 400);
  }

  try {
    const upstream = await fetch(config.paymasterUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        ...CORS_HEADERS,
        "Content-Type":
          upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch {
    return rpcError(
      id,
      -32001,
      "The Alchemy paymaster is unavailable. Try again shortly.",
      503,
    );
  }
}
