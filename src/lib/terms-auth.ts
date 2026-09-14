import type { SIWXMessage, SIWXSession } from "@reown/appkit";
import { ReownAuthentication } from "@reown/appkit-controllers/features";
import { stringToHex } from "viem";
import { TERMS_VERSION } from "./terms.ts";

type WalletSignInput = {
  message: string;
  chainId: string;
  accountAddress: string;
};

type WalletProvider = {
  request(args: {
    method: string;
    params?: readonly unknown[];
  }): Promise<unknown>;
};

function isWalletProvider(value: unknown): value is WalletProvider {
  return (
    value !== null &&
    typeof value === "object" &&
    "request" in value &&
    typeof value.request === "function"
  );
}

function termsUrl(origin: string): string {
  return new URL("/terms", origin).toString();
}

export function termsStatement(origin: string): string {
  return `By signing this message, you confirm that you have read and accept the Gasport Terms and Conditions at ${termsUrl(origin)}. Signing is free and does not authorize a transaction.`;
}

export function addTermsToMessage(
  message: SIWXMessage,
  origin: string,
): SIWXMessage {
  const statement = termsStatement(origin);
  const resource = termsUrl(origin);
  message.statement = statement;
  message.resources = [
    ...(message.resources ?? []).filter((item) => item !== resource),
    resource,
  ];

  // Reown's messenger serializes the message data through toString(). Fail
  // closed if a future SDK release stops including our terms in that string.
  const signedText = message.toString();
  if (!signedText.includes(statement) || !signedText.includes(resource)) {
    throw new Error("The wallet message does not include the Gasport terms.");
  }
  return message;
}

function currentOrigin(): string {
  return typeof window === "undefined"
    ? (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000")
    : window.location.origin;
}

export class GasportTermsAuthentication extends ReownAuthentication {
  private readonly walletSigner: (input: WalletSignInput) => Promise<string>;
  private readonly getWalletProvider?: () => unknown;

  constructor(
    walletSigner: (input: WalletSignInput) => Promise<string>,
    getWalletProvider?: () => unknown,
  ) {
    super({
      localAuthStorageKey: `gasport:reown-auth:${TERMS_VERSION}`,
      localNonceStorageKey: `gasport:reown-nonce:${TERMS_VERSION}`,
      required: true,
    });
    this.walletSigner = walletSigner;
    this.getWalletProvider = getWalletProvider;
  }

  override async createMessage(input: SIWXMessage.Input): Promise<SIWXMessage> {
    return addTermsToMessage(await super.createMessage(input), currentOrigin());
  }

  // Keep Wagmi's original error unless its cached connection chain disagrees
  // with the connector. In that case, sign through AppKit's active provider.
  async signMessage(input: WalletSignInput): Promise<string> {
    try {
      return await this.walletSigner(input);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.name !== "ConnectorChainMismatchError"
      ) {
        throw error;
      }
      const provider = this.getWalletProvider?.();
      if (!isWalletProvider(provider)) throw error;
      const accounts = await provider.request({ method: "eth_accounts" });
      if (
        !Array.isArray(accounts) ||
        !accounts.some(
          (address) =>
            typeof address === "string" &&
            address.toLowerCase() === input.accountAddress.toLowerCase(),
        )
      ) {
        throw new Error(
          "The connected wallet account changed. Reconnect it and sign the terms again.",
        );
      }
      const signature = await provider.request({
        method: "personal_sign",
        params: [stringToHex(input.message), input.accountAddress],
      });
      if (typeof signature !== "string" || !/^0x[\da-f]+$/i.test(signature)) {
        throw new Error("The wallet returned an invalid terms signature.");
      }
      return signature;
    }
  }

  override async addSession(session: SIWXSession): Promise<void> {
    const origin = currentOrigin();
    if (
      session.data.statement !== termsStatement(origin) ||
      !session.data.resources?.includes(termsUrl(origin)) ||
      !session.message.includes(termsStatement(origin))
    ) {
      throw new Error(
        "The signed message does not accept the current Gasport terms.",
      );
    }
    await super.addSession(session);
  }

  override async getSessions(
    chainId: Parameters<ReownAuthentication["getSessions"]>[0],
    address: string,
  ): Promise<SIWXSession[]> {
    const sessions = await super.getSessions(chainId, address);
    if (sessions.length > 0) return sessions;

    // Reown binds its auth session to the chain used for signing. Gasport's
    // terms acceptance is wallet-wide, so retain it when that wallet switches
    // EVM networks to submit a transaction. The token is still checked with
    // Reown and a different wallet must sign its own terms message.
    if (!chainId.startsWith("eip155:")) return [];
    try {
      const account = await this.getSessionAccount();
      if (
        account.caip2Network?.startsWith("eip155:") &&
        account.address.toLowerCase() === address.toLowerCase()
      ) {
        return [
          {
            data: {
              accountAddress: account.address,
              chainId: account.caip2Network as SIWXSession["data"]["chainId"],
              domain: account.domain,
              uri: account.uri,
              version: "1",
              nonce: account.nonce,
            },
            message: "",
            signature: "",
          },
        ];
      }
    } catch {
      // An expired or missing Reown session still requires signing.
    }
    return [];
  }
}
