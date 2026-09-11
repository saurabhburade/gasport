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
        { sender: "0x1" },
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
      { sender: "0x1" },
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
          params: [{}, "entry-point", "0x1", {}],
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
          params: [{}, "entry-point", "0x2105", {}],
        },
        "policy",
        1,
      ),
    (error) => error instanceof PaymasterRequestError && error.code === -32602,
  );
});
