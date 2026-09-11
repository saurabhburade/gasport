import { CHAIN_LIST, type DestinationChain } from "@/config/chains";
import { ChainIcon } from "./chain-icon";

export function NativeGasMark({ chain }: { chain: DestinationChain }) {
  const ethereumChain = CHAIN_LIST[0];
  const primaryChain = chain.symbol === "ETH" ? ethereumChain : chain;
  return (
    <span className="relative block size-9 shrink-0">
      <ChainIcon
        chain={primaryChain}
        className="size-9 rounded-full"
        pixels={36}
      />
      {chain.symbol === "ETH" && chain.id !== 1 && (
        <ChainIcon
          chain={chain}
          className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full border-2 border-secondary"
          pixels={16}
        />
      )}
    </span>
  );
}
