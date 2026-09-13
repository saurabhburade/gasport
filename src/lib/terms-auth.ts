import type { SIWXMessage, SIWXSession } from "@reown/appkit";
import { ReownAuthentication } from "@reown/appkit-controllers/features";
import { TERMS_VERSION } from "./terms.ts";

type WalletSignInput = {
  message: string;
  chainId: string;
  accountAddress: string;
};

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

  constructor(walletSigner: (input: WalletSignInput) => Promise<string>) {
    super({
      localAuthStorageKey: `gasport:reown-auth:${TERMS_VERSION}`,
      localNonceStorageKey: `gasport:reown-nonce:${TERMS_VERSION}`,
      required: true,
    });
    this.walletSigner = walletSigner;
  }

  override async createMessage(input: SIWXMessage.Input): Promise<SIWXMessage> {
    return addTermsToMessage(await super.createMessage(input), currentOrigin());
  }

  // AppKit's Wagmi adapter replaces every wallet signing error with the same
  // generic message. Use the same Wagmi action directly so the real cause is
  // available when a wallet never opens its signing prompt.
  async signMessage(input: WalletSignInput): Promise<string> {
    return this.walletSigner(input);
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
