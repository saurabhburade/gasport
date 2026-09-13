import assert from "node:assert/strict";
import test from "node:test";
import type { SIWXMessage } from "@reown/appkit";
import {
  ChainController,
  ModalController,
  OptionsController,
  SIWXUtil,
} from "@reown/appkit-controllers";
import { TERMS_VERSION } from "./terms.ts";
import { addTermsToMessage, GasportTermsAuthentication } from "./terms-auth.ts";

function reownMessage(): SIWXMessage {
  const message: SIWXMessage = {
    accountAddress: "0x0000000000000000000000000000000000000001",
    chainId: "eip155:8453",
    domain: "gasport.example",
    uri: "https://gasport.example",
    version: "1",
    nonce: "12345678",
    resources: ["email:user@example.com"],
    toString: () =>
      `Sign in\n${message.statement ?? ""}\n${message.resources?.join("\n") ?? ""}`,
  };
  return message;
}

test("Reown sign-in message includes the Gasport agreement without a version label", () => {
  const message = addTermsToMessage(reownMessage(), "https://gasport.example");
  assert.match(message.toString(), /By signing this message/);
  assert.ok(!message.toString().includes(TERMS_VERSION));
  assert.ok(message.toString().includes("https://gasport.example/terms"));
  assert.deepEqual(message.resources, [
    "email:user@example.com",
    "https://gasport.example/terms",
  ]);
});

test("the installed Reown messenger renders the custom terms in the wallet text", async () => {
  const auth = new GasportTermsAuthentication(async () => "0xsignature");
  const messenger = (
    auth as unknown as { messenger: { getNonce: () => Promise<string> } }
  ).messenger;
  messenger.getNonce = async () => "12345678";

  const message = await auth.createMessage({
    accountAddress: "0x0000000000000000000000000000000000000001",
    chainId: "eip155:8453",
  });
  assert.ok(message.toString().includes("By signing this message"));
  assert.ok(message.toString().includes(`/terms`));
});

test("Reown will not submit a session without the current terms", async () => {
  const auth = new GasportTermsAuthentication(async () => "0xsignature");
  const data = reownMessage();
  await assert.rejects(
    auth.addSession({ data, message: data.toString(), signature: "0x" }),
    /current Gasport terms/,
  );
});

test("wallet signing errors retain the provider's actual cause", async () => {
  const providerError = new Error("Popup blocked");
  const auth = new GasportTermsAuthentication(async () => {
    throw providerError;
  });
  await assert.rejects(
    auth.signMessage({
      message: "Gasport terms",
      chainId: "eip155:8453",
      accountAddress: "0x0000000000000000000000000000000000000001",
    }),
    (error) => error === providerError,
  );
});

test("a transaction network change does not reopen terms for the same wallet", async () => {
  const address = "0x0000000000000000000000000000000000000001";
  const auth = new GasportTermsAuthentication(async () => "0xsignature");
  const internals = auth as unknown as {
    getStorageToken: () => string;
    request: () => Promise<{
      address: string;
      caip2Network: string;
      domain: string;
      uri: string;
      nonce: string;
    }>;
  };
  internals.getStorageToken = () => "signed-terms-token";
  internals.request = async () => ({
    address,
    caip2Network: "eip155:1",
    domain: "gasport.example",
    uri: "https://gasport.example",
    nonce: "12345678",
  });

  const previousSIWX = OptionsController.state.siwx;
  const previousCheck = ChainController.checkIfSupportedNetwork;
  const previousOpen = ModalController.open;
  let signInPrompts = 0;
  try {
    OptionsController.setSIWX(auth);
    ChainController.checkIfSupportedNetwork = () => true;
    ModalController.open = async (options) => {
      if (options?.view === "SIWXSignMessage") signInPrompts += 1;
    };
    await SIWXUtil.initializeIfEnabled(`eip155:8453:${address}`);
    assert.equal(signInPrompts, 0);
    await SIWXUtil.initializeIfEnabled(
      "eip155:8453:0x0000000000000000000000000000000000000002",
    );
    assert.equal(signInPrompts, 1);
    internals.getStorageToken = () => "";
    await SIWXUtil.initializeIfEnabled(`eip155:8453:${address}`);
    assert.equal(signInPrompts, 2);
  } finally {
    OptionsController.setSIWX(previousSIWX);
    ChainController.checkIfSupportedNetwork = previousCheck;
    ModalController.open = previousOpen;
  }
});
