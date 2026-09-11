import { type Address, encodeFunctionData, type Hex } from "viem";

const ERC20_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
] as const;

const ADDRESS_PATTERN = /^0x[\da-fA-F]{40}$/;
const HASH_PATTERN = /^0x[\da-fA-F]{64}$/;
const UINT256_MAX = (1n << 256n) - 1n;

export type NearExecutionInput = {
  amount: bigint;
  chainId: number;
  depositAddress: Address;
  depositMemo?: string;
  sourceGasFeeAmount?: bigint;
  sourceGasFeeRecipient?: Address;
  token: Address;
};

function assertAddress(value: string, label: string) {
  if (!ADDRESS_PATTERN.test(value)) {
    throw new Error(`The NEAR Intents ${label} address is invalid.`);
  }
}

export function validateNearExecutionInput(input: NearExecutionInput) {
  if (!Number.isSafeInteger(input.chainId) || input.chainId <= 0) {
    throw new Error("The NEAR Intents source chain is invalid.");
  }
  assertAddress(input.token, "source token");
  assertAddress(input.depositAddress, "deposit");
  if (input.amount <= 0n || input.amount > UINT256_MAX) {
    throw new Error("The NEAR Intents deposit amount is invalid.");
  }
  if (input.depositMemo !== undefined && input.depositMemo.length === 0) {
    throw new Error("The NEAR Intents deposit memo is invalid.");
  }
  if (
    (input.sourceGasFeeAmount === undefined) !==
    (input.sourceGasFeeRecipient === undefined)
  ) {
    throw new Error("The sponsored source gas fee is incomplete.");
  }
  if (input.sourceGasFeeAmount !== undefined) {
    if (
      input.sourceGasFeeAmount <= 0n ||
      input.sourceGasFeeAmount > UINT256_MAX
    ) {
      throw new Error("The sponsored source gas fee amount is invalid.");
    }
    assertAddress(
      input.sourceGasFeeRecipient ?? "",
      "source gas fee recipient",
    );
  }
}

export function encodeNearDepositTransfer(input: NearExecutionInput) {
  validateNearExecutionInput(input);
  return encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: "transfer",
    args: [input.depositAddress, input.amount],
  });
}

export function parseNearTransactionHash(value: unknown): Hex {
  if (typeof value === "string" && HASH_PATTERN.test(value)) {
    return value as Hex;
  }
  throw new Error("The wallet returned no deposit transaction hash.");
}

export function classifyNearExecutionStatus(status: unknown) {
  if (status === "SUCCESS") return { kind: "settled" as const };
  if (status === "REFUNDED") {
    return {
      kind: "failed" as const,
      message:
        "The NEAR Intents swap was refunded. Check the explorer for details.",
    };
  }
  if (status === "INCOMPLETE_DEPOSIT") {
    return {
      kind: "failed" as const,
      message:
        "NEAR Intents received less than the quoted deposit amount. Check the explorer for recovery details.",
    };
  }
  if (status === "FAILED") {
    return {
      kind: "failed" as const,
      message:
        "The NEAR Intents swap failed. Check the explorer for recovery details.",
    };
  }
  return { kind: "pending" as const };
}
