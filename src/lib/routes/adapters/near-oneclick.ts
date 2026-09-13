import { type Address, type Hex, isAddress } from "viem";
import { encodeNearDepositTransfer } from "../../gas/near-execution.ts";
import type {
  NearClientConfig,
  PreparedRoute,
  RouteAdapter,
  RouteExecutionStatus,
  RouteQuoteRequest,
  RouteSettlement,
} from "../types.ts";
import { adapterError } from "./near-oneclick/common.ts";
import { requestNearQuote } from "./near-oneclick/quote.ts";
import { getNearRouteStatus } from "./near-oneclick/status.ts";

export class NearOneClickRouteAdapter implements RouteAdapter {
  readonly id = "near-1click" as const;
  private readonly config: NearClientConfig;

  constructor(config: NearClientConfig = {}) {
    this.config = config;
  }

  async getQuote(request: RouteQuoteRequest, signal?: AbortSignal) {
    return (await requestNearQuote(request, true, this.config, signal)).quote;
  }

  async prepare(
    request: RouteQuoteRequest,
    signal?: AbortSignal,
  ): Promise<PreparedRoute> {
    const result = await requestNearQuote(request, false, this.config, signal);
    const depositAddress = result.response.quote.depositAddress;
    if (!depositAddress || !isAddress(depositAddress)) {
      return adapterError(
        "provider_error",
        "NEAR 1Click returned no valid EVM deposit address. No transaction was prepared.",
      );
    }
    const expiresAt = Date.parse(
      result.response.quote.timeWhenInactive ??
        result.response.quote.deadline ??
        result.response.quoteRequest.deadline,
    );
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return adapterError(
        "no_route",
        "NEAR 1Click returned an expired quote. No transaction was prepared.",
      );
    }

    let data: Hex;
    try {
      data = encodeNearDepositTransfer({
        amount: BigInt(result.quote.amountIn),
        chainId: request.sourceAsset.chainId,
        depositAddress: depositAddress as Address,
        token: request.sourceAsset.address,
      });
    } catch (error) {
      return adapterError(
        "invalid_request",
        "The NEAR 1Click deposit transfer could not be prepared safely.",
        error,
      );
    }

    return {
      calls: [
        {
          data,
          to: request.sourceAsset.address,
          value: "0x0" as Hex,
        },
      ],
      provider: "near-1click",
      quote: result.quote,
      settlement: {
        depositAddress: depositAddress as Address,
        ...(result.response.quote.depositMemo
          ? { depositMemo: result.response.quote.depositMemo }
          : {}),
        kind: "near-1click",
        quoteId: result.response.correlationId,
      },
      sourceChainId: request.sourceAsset.chainId,
    };
  }

  getStatus(
    settlement: RouteSettlement,
    sourceTxHash: Hex,
    signal?: AbortSignal,
  ): Promise<RouteExecutionStatus> {
    return getNearRouteStatus(settlement, sourceTxHash, this.config, signal);
  }
}

export const nearOneClickAdapter: RouteAdapter = new NearOneClickRouteAdapter();

export default nearOneClickAdapter;
