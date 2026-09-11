import assert from "node:assert/strict";
import test from "node:test";
import { getVirtualLayout } from "./virtual-list.ts";

test("returns only visible and overscanned virtual rows", () => {
  const layout = getVirtualLayout(Array(100).fill(64), 1_280, 320, 64);

  assert.equal(layout.totalSize, 6_400);
  assert.deepEqual(
    layout.items.map((item) => item.index),
    [18, 19, 20, 21, 22, 23, 24, 25, 26],
  );
});

test("supports mixed header and token row heights", () => {
  const layout = getVirtualLayout([36, 64, 64, 36, 64], 100, 80, 0);

  assert.equal(layout.totalSize, 264);
  assert.deepEqual(
    layout.items.map(({ index, size, start }) => ({ index, size, start })),
    [
      { index: 1, size: 64, start: 36 },
      { index: 2, size: 64, start: 100 },
      { index: 3, size: 36, start: 164 },
    ],
  );
});
