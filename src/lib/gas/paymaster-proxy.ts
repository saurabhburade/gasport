const ALLOWED_PAYMASTER_METHODS = new Set([
  "pm_getPaymasterStubData",
  "pm_getPaymasterData",
]);

const ALLOWED_ENTRY_POINTS = new Set([
  "0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789",
  "0x0000000071727de22e5e9d8baf0edac6f37da032",
]);

export class PaymasterRequestError extends Error {
  readonly code: -32600 | -32601 | -32602;

  constructor(message: string, code: -32600 | -32601 | -32602) {
    super(message);
    this.name = "PaymasterRequestError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function getJsonRpcId(value: unknown) {
  if (!isRecord(value)) return null;
  return typeof value.id === "string" || typeof value.id === "number"
    ? value.id
    : null;
}

export function getPaymasterRequestChainId(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.params)) {
    throw new PaymasterRequestError(
      "Expected ERC-7677 paymaster parameters.",
      -32602,
    );
  }
  const chainId = value.params[2];
  if (typeof chainId !== "string" || !/^0x[0-9a-f]+$/i.test(chainId)) {
    throw new PaymasterRequestError(
      "Expected an EIP-155 chain ID in hexadecimal form.",
      -32602,
    );
  }
  const parsed = Number.parseInt(chainId.slice(2), 16);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new PaymasterRequestError("Invalid paymaster chain ID.", -32602);
  }
  return parsed;
}

export function prepareAlchemyPaymasterRequest(
  value: unknown,
  policyId: string,
  expectedChainId: number,
) {
  if (!isRecord(value) || value.jsonrpc !== "2.0") {
    throw new PaymasterRequestError("Invalid JSON-RPC request.", -32600);
  }
  if (
    typeof value.method !== "string" ||
    !ALLOWED_PAYMASTER_METHODS.has(value.method)
  ) {
    throw new PaymasterRequestError(
      "Only ERC-7677 paymaster methods are supported.",
      -32601,
    );
  }
  if (!Array.isArray(value.params) || value.params.length < 4) {
    throw new PaymasterRequestError(
      "Expected ERC-7677 paymaster parameters.",
      -32602,
    );
  }
  if (getPaymasterRequestChainId(value) !== expectedChainId) {
    throw new PaymasterRequestError(
      "The paymaster policy does not match the requested chain.",
      -32602,
    );
  }
  if (
    typeof value.params[1] !== "string" ||
    !ALLOWED_ENTRY_POINTS.has(value.params[1].toLowerCase())
  ) {
    throw new PaymasterRequestError("Unsupported ERC-4337 EntryPoint.", -32602);
  }

  return {
    jsonrpc: "2.0" as const,
    id: getJsonRpcId(value),
    method: value.method,
    params: [value.params[0], value.params[1], value.params[2], { policyId }],
  };
}
