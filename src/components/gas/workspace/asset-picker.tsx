import { Check, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { BouncyAccordion } from "@/components/motion/bouncy-accordion";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CHAIN_LIST, type DestinationChain } from "@/config/chains";
import { tokenKey } from "@/lib/tokens/source-catalog";
import type { Token } from "@/types/tokens";
import { ChainMark, TokenMark } from "./asset-marks";
import { formatBalance } from "./common";
import { VirtualTokenList } from "./virtual-token-list";

export function AssetPicker({
  balanceByTokenKey,
  balancesPending,
  connected,
  destination,
  mode,
  onDestinationChange,
  onOpenChange,
  onTokenChange,
  query,
  setQuery,
  token,
  tokens,
}: {
  balanceByTokenKey: Readonly<Record<string, bigint>>;
  balancesPending: boolean;
  connected: boolean;
  destination: DestinationChain;
  mode: "token" | "destination" | null;
  onDestinationChange: (chain: DestinationChain) => void;
  onOpenChange: (open: boolean) => void;
  onTokenChange: (token: Token) => void;
  query: string;
  setQuery: (query: string) => void;
  token: Token;
  tokens: readonly Token[];
}) {
  const [chainQuery, setChainQuery] = useState("");
  const [mobileChainsExpanded, setMobileChainsExpanded] = useState(false);
  const [selectedChainId, setSelectedChainId] = useState(token.chainId);
  const normalizedQuery = query.trim().toLowerCase();
  const sourceChainIds = new Set(tokens.map((item) => item.chainId));
  const sourceChains = CHAIN_LIST.filter((item) => sourceChainIds.has(item.id));
  const filteredTokens = tokens.filter((item) => {
    const chain = CHAIN_LIST.find((entry) => entry.id === item.chainId);
    return `${item.symbol} ${item.name} ${item.address} ${chain?.name ?? ""}`
      .toLowerCase()
      .includes(normalizedQuery);
  });
  const chains = CHAIN_LIST.filter((item) =>
    `${item.name} ${item.symbol}`.toLowerCase().includes(normalizedQuery),
  );
  const activeChain =
    sourceChains.find((chain) => chain.id === selectedChainId) ??
    sourceChains[0] ??
    CHAIN_LIST[0];
  const tokensForActiveChain = filteredTokens
    .filter((item) => item.chainId === activeChain?.id)
    .sort((first, second) => {
      const firstBalance = balanceByTokenKey[tokenKey(first)] ?? BigInt(0);
      const secondBalance = balanceByTokenKey[tokenKey(second)] ?? BigInt(0);
      if (firstBalance === secondBalance) {
        return first.symbol.localeCompare(second.symbol);
      }
      return firstBalance > secondBalance ? -1 : 1;
    });
  const trendingTokens = tokens
    .filter((item) => item.chainId === activeChain?.id)
    .slice(0, 4);
  const normalizedChainQuery = chainQuery.trim().toLowerCase();
  const visibleChains = sourceChains.filter((item) =>
    `${item.name} ${item.symbol}`.toLowerCase().includes(normalizedChainQuery),
  );
  const mobileTopChains = visibleChains.slice(0, 5);
  const mobileRemainingChains = visibleChains.slice(5);

  useEffect(() => {
    if (mode === "token") {
      setSelectedChainId(token.chainId);
      setChainQuery("");
      setMobileChainsExpanded(false);
    }
  }, [mode, token.chainId]);

  const balanceLabel = (item: Token) => {
    if (!connected) return "—";
    const balance = balanceByTokenKey[tokenKey(item)];
    if (balance === undefined) return balancesPending ? "Loading…" : "—";
    return formatBalance(formatUnits(balance, item.decimals));
  };

  const mobileRemainingChainGrid = (
    <div className="grid grid-cols-4 gap-1 px-2 py-2">
      {mobileRemainingChains.map((chain) => {
        const selected = chain.id === activeChain?.id;
        return (
          <button
            aria-label={chain.name}
            aria-pressed={selected}
            className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-center text-[10px] font-medium leading-tight transition-colors ${selected ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            key={chain.id}
            onClick={() => setSelectedChainId(chain.id)}
            type="button"
          >
            <ChainMark chain={chain} size="sm" />
            <span className="max-w-full truncate">{chain.shortName}</span>
          </button>
        );
      })}
    </div>
  );

  const destinationPicker = (
    <Dialog open={mode === "destination"} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(620px,calc(100vh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[480px]">
        <DialogHeader className="px-5 pb-2 pt-5 pr-14">
          <DialogTitle>Select gas network</DialogTitle>
        </DialogHeader>
        <div className="px-5 py-3">
          <div className="flex min-h-14 items-center gap-3 rounded-2xl bg-secondary px-4">
            <Search className="size-6 shrink-0 text-muted-foreground" />
            <Input
              aria-label="Search networks"
              autoFocus
              className="h-auto min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search networks"
              value={query}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overscroll-contain overflow-y-auto p-2 [scrollbar-gutter:stable]">
          {chains.map((item) => (
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-full px-3 py-3 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
              disabled={!item.intentsAssetId}
              key={item.id}
              onClick={() => {
                onDestinationChange(item);
                onOpenChange(false);
              }}
            >
              <ChainMark chain={item} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{item.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {item.intentsAssetId
                    ? `Native ${item.symbol}`
                    : "Native gas quote unavailable"}
                </span>
              </span>
              {item.id === destination.id && (
                <Check className="size-4" aria-label="Selected" />
              )}
            </button>
          ))}
          {chains.length === 0 && (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              No matching networks
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <>
      {destinationPicker}
      <Dialog open={mode === "token"} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-h-[min(720px,calc(100vh-2rem))] gap-0 overflow-hidden bg-popover p-0 sm:max-w-[560px]"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">Select a token</DialogTitle>
          <DialogDescription className="sr-only">
            Choose a network and token to pay with.
          </DialogDescription>
          <div className="grid min-h-0 grid-cols-1 bg-popover sm:grid-cols-[180px_minmax(0,1fr)]">
            <aside className="min-h-0 border-b border-border sm:border-b-0 sm:border-r">
              <div className="border-b border-border px-2 py-2.5">
                <div className="flex min-h-9 items-center gap-1.5 rounded-2xl bg-secondary px-2">
                  <Search className="size-3.5 shrink-0 text-muted-foreground" />
                  <Input
                    aria-label="Search chains"
                    className="h-auto min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
                    onChange={(event) => setChainQuery(event.target.value)}
                    placeholder="Search chains"
                    value={chainQuery}
                  />
                </div>
              </div>
              <div className="sm:hidden">
                {visibleChains.length > 0 ? (
                  <>
                    <div className="grid grid-cols-5 gap-1 px-2 py-2">
                      {mobileTopChains.map((chain) => {
                        const selected = chain.id === activeChain?.id;
                        return (
                          <button
                            aria-label={chain.name}
                            aria-pressed={selected}
                            className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-center text-[10px] font-medium leading-tight transition-colors ${selected ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                            key={chain.id}
                            onClick={() => setSelectedChainId(chain.id)}
                            type="button"
                          >
                            <ChainMark chain={chain} size="sm" />
                            <span className="max-w-full truncate">
                              {chain.shortName}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {mobileRemainingChains.length > 0 &&
                      (normalizedChainQuery ? (
                        mobileRemainingChainGrid
                      ) : (
                        <BouncyAccordion
                          className="border-t border-border"
                          contentClassName="border-t border-border"
                          onOpenChange={setMobileChainsExpanded}
                          open={mobileChainsExpanded}
                          title={
                            mobileChainsExpanded
                              ? "Show fewer chains"
                              : `View ${mobileRemainingChains.length} more chains`
                          }
                          triggerClassName="px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          {mobileRemainingChainGrid}
                        </BouncyAccordion>
                      ))}
                  </>
                ) : (
                  <p className="px-7 py-8 text-center text-sm text-muted-foreground">
                    No matching chains
                  </p>
                )}
              </div>

              <div className="hidden max-h-[min(608px,calc(100vh-10rem))] overflow-y-auto py-1 sm:block">
                {visibleChains.map((chain) => {
                  const selected = chain.id === activeChain?.id;
                  return (
                    <button
                      aria-pressed={selected}
                      className={`flex min-h-14 w-full items-center gap-2 px-4 text-left text-sm font-medium transition-colors ${selected ? "bg-muted" : "hover:bg-muted"}`}
                      key={chain.id}
                      onClick={() => setSelectedChainId(chain.id)}
                      type="button"
                    >
                      <ChainMark chain={chain} size="sm" />
                      <span>{chain.name}</span>
                    </button>
                  );
                })}
                {visibleChains.length === 0 && (
                  <p className="px-7 py-10 text-sm text-muted-foreground">
                    No matching chains
                  </p>
                )}
              </div>
            </aside>

            <section className="min-h-0">
              <div className="flex items-center gap-2 border-b border-border px-2 py-2.5">
                <div className="flex min-h-9 min-w-0 flex-1 items-center gap-1.5 rounded-2xl bg-secondary px-2">
                  <Search className="size-3.5 shrink-0 text-muted-foreground" />
                  <Input
                    aria-label="Search tokens or paste address"
                    autoFocus
                    className="h-auto min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search tokens or paste address"
                    value={query}
                  />
                </div>
                <DialogClose
                  aria-label="Close token picker"
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="size-4" />
                </DialogClose>
              </div>

              <div className="border-b border-border px-5 py-5">
                <p className="text-xs text-muted-foreground">Popular</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  {trendingTokens.map((item) => (
                    <button
                      className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 text-xs font-semibold transition-colors hover:bg-secondary"
                      key={tokenKey(item)}
                      onClick={() => {
                        onTokenChange(item);
                        onOpenChange(false);
                      }}
                      type="button"
                    >
                      <TokenMark size="tiny" token={item} />
                      {item.symbol}
                    </button>
                  ))}
                  {trendingTokens.length === 0 && (
                    <p className="py-3 text-sm text-muted-foreground">
                      No tokens available on this chain.
                    </p>
                  )}
                </div>
              </div>

              {tokensForActiveChain.length > 0 ? (
                <VirtualTokenList
                  balanceLabel={balanceLabel}
                  groups={[
                    { chain: activeChain, tokens: tokensForActiveChain },
                  ]}
                  key={`${activeChain?.id}-${query}`}
                  onOpenChange={onOpenChange}
                  onTokenChange={onTokenChange}
                  selectedToken={token}
                />
              ) : (
                <p className="px-5 py-14 text-center text-sm text-muted-foreground">
                  No matching tokens on {activeChain?.name}
                </p>
              )}
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
