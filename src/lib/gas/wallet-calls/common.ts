import { type Address, encodeFunctionData } from "viem";
import { ERC20_TRANSFER_ABI, SPONSORED_SOURCE_CHAIN_IDS } from "./constants.ts";

export function encodeErc20Transfer(recipient: Address, amount: bigint) {
  return encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: "transfer",
    args: [recipient, amount],
  });
}

export function isSponsoredSourceChain(chainId: number) {
  return (SPONSORED_SOURCE_CHAIN_IDS as readonly number[]).includes(chainId);
}
