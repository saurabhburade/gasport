import { type Address, encodeFunctionData, type Hex, numberToHex } from "viem";
import type {
  NormalizedRouteQuote,
  PreparedRoute,
  RouteAdapter,
  RouteCall,
  RouteExecutionStatus,
  RouteQuoteRequest,
  RouteSettlement,
} from "../types.ts";
import { isNativeToken, providerError } from "./lifi/common.ts";
import { ERC20_APPROVE_ABI, ERC20_TRANSFER_ABI } from "./lifi/constants.ts";
import { getLifiQuoteWithRaw } from "./lifi/quote.ts";
import { getLifiStatus } from "./lifi/status.ts";

export class LifiRouteAdapter implements RouteAdapter {
  readonly id = "lifi" as const;
  private readonly feeRecipient?: Address;

  constructor(feeRecipient?: Address) {
    this.feeRecipient = feeRecipient;
  }

  async getQuote(
    request: RouteQuoteRequest,
    signal?: AbortSignal,
  ): Promise<NormalizedRouteQuote> {
    return (await getLifiQuoteWithRaw(request, this.feeRecipient, signal))
      .quote;
  }

  async prepare(
    request: RouteQuoteRequest,
    signal?: AbortSignal,
  ): Promise<PreparedRoute> {
    const { platformFee, raw, quote } = await getLifiQuoteWithRaw(
      request,
      this.feeRecipient,
      signal,
    );
    const transactionRequest = raw.transactionRequest;
    if (transactionRequest.chainId !== request.sourceAsset.chainId) {
      throw providerError("LI.FI returned a transaction for the wrong chain.");
    }

    const calls: RouteCall[] = [];
    const sourceIsNative = isNativeToken(request.sourceAsset.address);
    if (platformFee.recipient && platformFee.amount > 0n) {
      calls.push(
        sourceIsNative
          ? {
              to: platformFee.recipient,
              data: "0x",
              value: numberToHex(platformFee.amount),
            }
          : {
              to: request.sourceAsset.address,
              data: encodeFunctionData({
                abi: ERC20_TRANSFER_ABI,
                functionName: "transfer",
                args: [platformFee.recipient, platformFee.amount],
              }),
              value: "0x0",
            },
      );
    }
    const approvalAddress = raw.estimate.approvalAddress;
    if (!sourceIsNative && approvalAddress && isNativeToken(approvalAddress)) {
      throw providerError("LI.FI returned an invalid approval target.");
    }
    if (
      !sourceIsNative &&
      approvalAddress &&
      !isNativeToken(approvalAddress) &&
      raw.estimate.skipApproval !== true
    ) {
      calls.push({
        to: request.sourceAsset.address,
        data: encodeFunctionData({
          abi: ERC20_APPROVE_ABI,
          functionName: "approve",
          args: [approvalAddress, platformFee.providerAmount],
        }),
        value: "0x0",
      });
    }
    calls.push({
      to: transactionRequest.to,
      data: transactionRequest.data,
      value: transactionRequest.value,
    });

    return {
      calls,
      provider: "lifi",
      quote,
      settlement: {
        kind: "lifi",
        destinationChainId: request.destinationAsset.chainId,
        tool: raw.tool,
      },
      sourceChainId: request.sourceAsset.chainId,
    };
  }

  getStatus(
    settlement: RouteSettlement,
    sourceTxHash: Hex,
  ): Promise<RouteExecutionStatus> {
    return getLifiStatus(settlement, sourceTxHash);
  }
}

export const lifiAdapter = new LifiRouteAdapter();
export default lifiAdapter;
