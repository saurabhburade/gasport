import { type Address, numberToHex } from "viem";
import type { PreparedRoute, RouteCall } from "../../routes/types.ts";
import { encodeErc20Transfer, isSponsoredSourceChain } from "./common.ts";
import { validatePaymasterUrl } from "./sponsorship.ts";
import type {
  SourceGasFeeTransfer,
  SponsoredWalletCallsRequest,
  WalletCallsRequest,
} from "./types.ts";

function buildWalletCallsRequest({
  account,
  calls,
  chainId,
  paymasterUrl,
  sponsorshipRequired,
}: {
  account: Address;
  calls: readonly RouteCall[];
  chainId: number;
  paymasterUrl?: string;
  sponsorshipRequired: boolean;
}): WalletCallsRequest {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error("The source chain is invalid.");
  }
  if (calls.length === 0) {
    throw new Error("The prepared route contains no wallet calls.");
  }
  const capabilities = sponsorshipRequired
    ? (() => {
        if (!paymasterUrl) {
          throw new Error("A paymaster URL is required for sponsored calls.");
        }
        validatePaymasterUrl(paymasterUrl);
        return { paymasterService: { url: paymasterUrl } };
      })()
    : undefined;

  return {
    method: "wallet_sendCalls",
    params: [
      {
        version: "2.0.0",
        from: account,
        chainId: numberToHex(chainId),
        atomicRequired: true,
        calls,
        ...(capabilities ? { capabilities } : {}),
      },
    ],
  };
}

export function createWalletCallsRequest({
  account,
  paymasterUrl,
  preparedRoute,
  sourceGasFee,
  sponsorshipRequired = false,
}: {
  account: Address;
  paymasterUrl?: string;
  preparedRoute: PreparedRoute;
  sourceGasFee?: SourceGasFeeTransfer;
  sponsorshipRequired?: boolean;
}): WalletCallsRequest {
  if (sourceGasFee && sourceGasFee.amount <= 0n) {
    throw new Error("The source gas fee amount must be positive.");
  }

  const calls: RouteCall[] = sourceGasFee
    ? [
        {
          to: sourceGasFee.token,
          value: "0x0",
          data: encodeErc20Transfer(
            sourceGasFee.recipient,
            sourceGasFee.amount,
          ),
        },
        ...preparedRoute.calls,
      ]
    : [...preparedRoute.calls];

  return buildWalletCallsRequest({
    account,
    calls,
    chainId: preparedRoute.sourceChainId,
    paymasterUrl,
    sponsorshipRequired,
  });
}

export const createPreparedRouteCallsRequest = createWalletCallsRequest;
export const createWalletSendCallsRequest = createWalletCallsRequest;
export const buildWalletSendCallsRequest = createWalletCallsRequest;

export function createSponsoredTransferRequest({
  account,
  token,
  recipient,
  amount,
  chainId,
  paymasterUrl,
}: {
  account: Address;
  token: Address;
  recipient: Address;
  amount: bigint;
  chainId: number;
  paymasterUrl: string;
}): SponsoredWalletCallsRequest {
  if (!isSponsoredSourceChain(chainId)) {
    throw new Error(
      `Chain ${chainId} is not supported for sponsored deposits.`,
    );
  }
  return buildWalletCallsRequest({
    account,
    calls: [
      {
        to: token,
        value: "0x0",
        data: encodeErc20Transfer(recipient, amount),
      },
    ],
    chainId,
    paymasterUrl,
    sponsorshipRequired: true,
  }) as SponsoredWalletCallsRequest;
}

export function createSponsoredDepositRequest({
  account,
  token,
  depositAddress,
  depositAmount,
  feeRecipient,
  feeAmount,
  chainId,
  paymasterUrl,
}: {
  account: Address;
  token: Address;
  depositAddress: Address;
  depositAmount: bigint;
  feeRecipient: Address;
  feeAmount: bigint;
  chainId: number;
  paymasterUrl: string;
}): SponsoredWalletCallsRequest {
  if (depositAmount <= 0n || feeAmount <= 0n) {
    throw new Error("The deposit and source gas fee must both be positive.");
  }

  return buildWalletCallsRequest({
    account,
    calls: [
      {
        to: token,
        value: "0x0",
        data: encodeErc20Transfer(feeRecipient, feeAmount),
      },
      {
        to: token,
        value: "0x0",
        data: encodeErc20Transfer(depositAddress, depositAmount),
      },
    ],
    chainId,
    paymasterUrl,
    sponsorshipRequired: true,
  }) as SponsoredWalletCallsRequest;
}
