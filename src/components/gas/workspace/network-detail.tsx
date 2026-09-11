import type { DestinationChain } from "@/config/chains";
import { ChainIcon } from "./chain-icon";

export function NetworkDetail({
  chain,
  label,
}: {
  chain: DestinationChain;
  label: string;
}) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5 text-right font-medium text-foreground">
        <ChainIcon chain={chain} className="size-4 rounded-full" pixels={16} />
        {chain.name}
      </span>
    </div>
  );
}
