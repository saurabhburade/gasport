import { Check } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DestinationChain } from "@/config/chains";
import { tokenKey } from "@/lib/tokens/source-catalog";
import { getVirtualLayout } from "@/lib/tokens/virtual-list";
import type { Token } from "@/types/tokens";
import { TokenMark } from "./asset-marks";

type TokenPickerRow = { kind: "token"; token: Token };

const tokenPickerRowHeight = 56;

export function VirtualTokenList({
  balanceLabel,
  groups,
  onOpenChange,
  onTokenChange,
  selectedToken,
}: {
  balanceLabel: (token: Token) => string;
  groups: readonly {
    chain: DestinationChain;
    tokens: readonly Token[];
  }[];
  onOpenChange: (open: boolean) => void;
  onTokenChange: (token: Token) => void;
  selectedToken: Token;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(390);
  const rows = useMemo<TokenPickerRow[]>(
    () =>
      groups.flatMap((group) =>
        group.tokens.map((item) => ({
          kind: "token" as const,
          token: item,
        })),
      ),
    [groups],
  );
  const sizes = useMemo(() => rows.map(() => tokenPickerRowHeight), [rows]);
  const layout = useMemo(
    () => getVirtualLayout(sizes, scrollTop, viewportHeight),
    [scrollTop, sizes, viewportHeight],
  );

  useEffect(() => {
    const element = scrollContainerRef.current;
    if (!element) return;
    const updateHeight = () => setViewportHeight(element.clientHeight);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      aria-label="Available source tokens"
      className="min-h-0 flex-1 overscroll-contain overflow-y-auto pt-2 sm:h-[min(390px,calc(100dvh-13rem))] sm:min-h-48 sm:flex-none"
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      ref={scrollContainerRef}
      role="listbox"
      tabIndex={-1}
    >
      <div className="relative" style={{ height: layout.totalSize }}>
        {layout.items.map(({ index, size, start }) => {
          const row = rows[index];
          if (!row) return null;
          return (
            <div
              className="absolute inset-x-0 px-2"
              key={tokenKey(row.token)}
              style={{ height: size, transform: `translateY(${start}px)` }}
            >
              <button
                aria-selected={tokenKey(row.token) === tokenKey(selectedToken)}
                className="flex h-full w-full items-center gap-3 rounded-full px-3 text-left transition-colors hover:bg-muted"
                onClick={() => {
                  onTokenChange(row.token);
                  onOpenChange(false);
                }}
                role="option"
                type="button"
              >
                <TokenMark size="small" token={row.token} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {row.token.symbol}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {row.token.name}
                  </span>
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {balanceLabel(row.token)}
                </span>
                {tokenKey(row.token) === tokenKey(selectedToken) && (
                  <Check className="size-4" aria-label="Selected" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
