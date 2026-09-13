import assert from "node:assert/strict";
import test from "node:test";
import { QuoteUpdateGate } from "./quote-update-gate.ts";

test("confirmation freezes a pending quote and its expiry callback", () => {
  const gate = new QuoteUpdateGate();
  const pendingQuote = new AbortController();
  gate.track(pendingQuote);

  gate.pause();

  assert.equal(pendingQuote.signal.aborted, true);
  assert.equal(gate.accepts(pendingQuote), false);
  assert.equal(gate.canUpdate, false);
});

test("resuming quotes cannot accept a result from the previous request", () => {
  const gate = new QuoteUpdateGate();
  const previousQuote = new AbortController();
  gate.track(previousQuote);
  gate.pause();
  gate.resume();

  assert.equal(gate.accepts(previousQuote), false);

  const nextQuote = new AbortController();
  gate.track(nextQuote);
  assert.equal(gate.accepts(nextQuote), true);
});

test("a request started after confirmation is aborted immediately", () => {
  const gate = new QuoteUpdateGate();
  gate.pause();
  const lateQuote = new AbortController();

  gate.track(lateQuote);

  assert.equal(lateQuote.signal.aborted, true);
  assert.equal(gate.accepts(lateQuote), false);
});
