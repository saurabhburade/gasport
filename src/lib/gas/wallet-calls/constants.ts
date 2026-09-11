export const ERC20_TRANSFER_ABI = [
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

export const USER_OPERATION_REVERT_REASON_TOPIC =
  "0x1c4fada7374c0a9ee8841fc38afe82932dc0f8e69012e927f061a8bae611a201";
export const CUMULATIVE_SLIPPAGE_TOO_HIGH_SELECTOR = "0x275c273c";
export const SPONSORED_SOURCE_CHAIN_IDS = [1, 10, 143, 8453, 42161] as const;
