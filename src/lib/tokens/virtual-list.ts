export type VirtualItem = {
  index: number;
  size: number;
  start: number;
};

export type VirtualLayout = {
  items: VirtualItem[];
  totalSize: number;
};

export function getVirtualLayout(
  itemSizes: readonly number[],
  scrollTop: number,
  viewportHeight: number,
  overscan = 160,
): VirtualLayout {
  const starts: number[] = [];
  let totalSize = 0;

  for (const size of itemSizes) {
    starts.push(totalSize);
    totalSize += Math.max(0, size);
  }

  const visibleStart = Math.max(0, scrollTop - overscan);
  const visibleEnd = Math.min(
    totalSize,
    scrollTop + Math.max(0, viewportHeight) + overscan,
  );
  const items: VirtualItem[] = [];

  for (let index = 0; index < itemSizes.length; index += 1) {
    const start = starts[index] ?? 0;
    const size = Math.max(0, itemSizes[index] ?? 0);
    if (start + size < visibleStart) continue;
    if (start > visibleEnd) break;
    items.push({ index, size, start });
  }

  return { items, totalSize };
}
