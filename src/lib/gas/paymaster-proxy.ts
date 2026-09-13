const ALLOWED_PAYMASTER_METHODS = new Set([
  "pm_getPaymasterStubData",
  "pm_getPaymasterData",
]);

const ALLOWED_ENTRY_POINTS = new Set([
  "0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789",
  "0x0000000071727de22e5e9d8baf0edac6f37da032",
]);

const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;
const HEX_PATTERN = /^0x[0-9a-f]*$/i;
const USER_OPERATION_HEX_FIELDS = [
  "nonce",
  "callData",
  "callGasLimit",
  "verificationGasLimit",
  "preVerificationGas",
  "maxFeePerGas",
  "maxPriorityFeePerGas",
  "initCode",
  "factoryData",
  "accountGasLimits",
  "gasFees",
  "paymasterAndData",
  "paymasterData",
  "paymasterVerificationGasLimit",
  "paymasterPostOpGasLimit",
  "signature",
] as const;
const USER_OPERATION_ADDRESS_FIELDS = ["factory", "paymaster"] as const;

type JsonRpcId = string | number;

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
  return isJsonRpcId(value.id) ? value.id : null;
}

function isJsonRpcId(value: unknown): value is JsonRpcId {
  return (
    (typeof value === "string" && value.length > 0) ||
    (typeof value === "number" && Number.isSafeInteger(value))
  );
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

function assertUserOperation(value: unknown) {
  if (!isRecord(value)) {
    throw new PaymasterRequestError(
      "Expected a partial ERC-4337 UserOperation.",
      -32602,
    );
  }
  if (typeof value.sender !== "string" || !ADDRESS_PATTERN.test(value.sender)) {
    throw new PaymasterRequestError(
      "Expected a valid UserOperation sender.",
      -32602,
    );
  }
  if (typeof value.nonce !== "string" || !HEX_PATTERN.test(value.nonce)) {
    throw new PaymasterRequestError(
      "Expected a hexadecimal UserOperation nonce.",
      -32602,
    );
  }

  for (const field of USER_OPERATION_HEX_FIELDS) {
    if (
      field in value &&
      (typeof value[field] !== "string" || !HEX_PATTERN.test(value[field]))
    ) {
      throw new PaymasterRequestError(
        `Expected UserOperation field ${field} in hexadecimal form.`,
        -32602,
      );
    }
  }
  for (const field of USER_OPERATION_ADDRESS_FIELDS) {
    if (
      field in value &&
      (typeof value[field] !== "string" || !ADDRESS_PATTERN.test(value[field]))
    ) {
      throw new PaymasterRequestError(
        `Expected UserOperation field ${field} to be an address.`,
        -32602,
      );
    }
  }
}

export function prepareAlchemyPaymasterRequest(
  value: unknown,
  policyId: string,
  expectedChainId: number,
) {
  if (!isRecord(value) || value.jsonrpc !== "2.0") {
    throw new PaymasterRequestError("Invalid JSON-RPC request.", -32600);
  }
  if (!Object.hasOwn(value, "id") || !isJsonRpcId(value.id)) {
    throw new PaymasterRequestError(
      "A JSON-RPC request id is required.",
      -32600,
    );
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
  if (!Array.isArray(value.params) || value.params.length !== 4) {
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
  assertUserOperation(value.params[0]);
  if (!isRecord(value.params[3])) {
    throw new PaymasterRequestError(
      "Expected an ERC-7677 paymaster context object.",
      -32602,
    );
  }
  if (typeof policyId !== "string" || policyId.trim().length === 0) {
    throw new PaymasterRequestError(
      "The paymaster policy is unavailable.",
      -32600,
    );
  }
  if (!Number.isSafeInteger(expectedChainId) || expectedChainId <= 0) {
    throw new PaymasterRequestError("Invalid paymaster chain ID.", -32602);
  }

  return {
    jsonrpc: "2.0" as const,
    id: getJsonRpcId(value),
    method: value.method,
    params: [value.params[0], value.params[1], value.params[2], { policyId }],
  };
}
