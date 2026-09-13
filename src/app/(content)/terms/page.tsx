import type { Metadata } from "next";
import { TermsShell } from "@/components/terms-shell";
import { TERMS_VERSION } from "@/lib/terms";

export const metadata: Metadata = {
  title: "Terms of Use | Gasport",
};

export default function TermsPage() {
  return (
    <TermsShell>
      <main className="mx-auto w-full max-w-2xl px-6 py-12 text-sm leading-7 sm:py-20">
        <h1 className="text-balance text-3xl font-semibold tracking-tight">
          Terms of Use
        </h1>
        <p className="mt-2 text-muted-foreground">
          Last updated {TERMS_VERSION}
        </p>
        <div className="mt-8 space-y-8 text-pretty">
          <p>
            Gasport helps you exchange tokens on one network for native gas on
            another. By using Gasport, you agree to these terms. Please read
            them before making a transaction.
          </p>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">
              Wallet connection and acceptance
            </h2>
            <p>
              When you connect an EVM wallet, Gasport asks you to sign a message
              accepting these terms. The signature confirms control of the
              connected wallet and records your agreement. It does not transfer
              tokens or submit a transaction, and signing it does not cost gas.
              You approve any transaction separately in your wallet.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">How Gasport works</h2>
            <p>
              Gasport shows routes from third-party providers, including NEAR
              Intents and LI.FI. Your wallet holds your assets and submits the
              transaction you approve. Gasport does not hold your private keys.
              Connecting a wallet alone does not transfer your tokens.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">Quotes and fees</h2>
            <p>
              A quote shows an estimated amount of gas you will receive, a
              minimum amount, and the fees for that route. Quotes can expire or
              change as network conditions and provider prices change. Review
              the latest quote before you approve it in your wallet.
            </p>
            <p>
              Fees are reflected in the quote before confirmation. Any platform
              fee or charge for sponsored source-network gas reduces the amount
              available to exchange from the tokens you enter. If your wallet
              pays source-network gas instead, that network fee is paid
              separately from your wallet.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">Your transaction</h2>
            <p>
              Check the token and amount you are spending, both networks, the
              destination address, the minimum you will receive, and the fees.
              You are responsible for the address and network you choose. Once a
              transaction is submitted, it may not be possible to cancel or
              reverse it. A wrong address or network can lead to permanent loss
              of funds.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">
              Delays and failed routes
            </h2>
            <p>
              Blockchain networks and route providers can be slow or
              unavailable. A submitted route may take longer than estimated,
              fail, or be refunded by the provider. Gasport cannot guarantee a
              completion time or that every route will succeed. Use the
              transaction links shown after submission to track its status.
            </p>
          </section>
        </div>
      </main>
    </TermsShell>
  );
}
