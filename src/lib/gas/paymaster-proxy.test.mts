import assert from "node:assert/strict";
import test from "node:test";
import {
  getPaymasterRequestChainId,
  PaymasterRequestError,
  prepareAlchemyPaymasterRequest,
} from "./paymaster-proxy.ts";

test("injects the server policy into an Ethereum ERC-7677 request", () => {
  const result = prepareAlchemyPaymasterRequest(
    {
      jsonrpc: "2.0",
      id: 7,
      method: "pm_getPaymasterData",
      params: [
        {
          sender: "0x0000000000000000000000000000000000000001",
          nonce: "0x0",
          callData: "0x",
        },
        "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
        "0x1",
        { policyId: "client-controlled", extra: "preserved" },
      ],
    },
    "server-policy",
    1,
  );

  assert.deepEqual(result.params[3], {
    policyId: "server-policy",
  });
});

test("extracts Base and injects its server-selected policy", () => {
  const request = {
    jsonrpc: "2.0",
    id: 8,
    method: "pm_getPaymasterStubData",
    params: [
      {
        sender: "0x0000000000000000000000000000000000000001",
        nonce: "0x0",
        callData: "0x",
      },
      "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
      "0x2105",
      {},
    ],
  };

  assert.equal(getPaymasterRequestChainId(request), 8453);
  assert.deepEqual(
    prepareAlchemyPaymasterRequest(request, "base-policy", 8453).params[3],
    { policyId: "base-policy" },
  );
});

test("rejects methods and chains outside the paymaster boundary", () => {
  assert.throws(
    () =>
      prepareAlchemyPaymasterRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "eth_sendTransaction",
          params: [
            {
              sender: "0x0000000000000000000000000000000000000001",
              nonce: "0x0",
            },
            "entry-point",
            "0x1",
            {},
          ],
        },
        "policy",
        1,
      ),
    (error) => error instanceof PaymasterRequestError && error.code === -32601,
  );

  assert.throws(
    () =>
      prepareAlchemyPaymasterRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "pm_getPaymasterStubData",
          params: [
            {
              sender: "0x0000000000000000000000000000000000000001",
              nonce: "0x0",
            },
            "entry-point",
            "0x2105",
            {},
          ],
        },
        "policy",
        1,
      ),
    (error) => error instanceof PaymasterRequestError && error.code === -32602,
  );
});

test("rejects malformed JSON-RPC envelopes and UserOperation fields", () => {
  const validUserOp = {
    sender: "0x0000000000000000000000000000000000000001",
    nonce: "0x0",
  };
  const validParams = [
    validUserOp,
    "0x0000000071727de22e5e9d8baf0edac6f37da032",
    "0x1",
    {},
  ];

  for (const request of [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "pm_getPaymasterData",
      params: validParams.slice(0, 3),
    },
    {
      jsonrpc: "2.0",
      id: 1,
      method: "pm_getPaymasterData",
      params: [...validParams, {}],
    },
    {
      jsonrpc: "2.0",
      id: 1,
      method: "pm_getPaymasterData",
      params: [{ sender: "0x1", nonce: "0x0" }, ...validParams.slice(1)],
    },
    {
      jsonrpc: "2.0",
      id: 1,
      method: "pm_getPaymasterData",
      params: [
        { ...validUserOp, callData: "not-hex" },
        ...validParams.slice(1),
      ],
    },
  ]) {
    assert.throws(
      () => prepareAlchemyPaymasterRequest(request, "policy", 1),
      (error) =>
        error instanceof PaymasterRequestError && error.code === -32602,
    );
  }

  assert.throws(
    () =>
      prepareAlchemyPaymasterRequest(
        { jsonrpc: "2.0", method: "pm_getPaymasterData", params: validParams },
        "policy",
        1,
      ),
    (error) => error instanceof PaymasterRequestError && error.code === -32600,
  );
});
