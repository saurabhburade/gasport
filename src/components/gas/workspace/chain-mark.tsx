import type { DestinationChain } from "@/config/chains";
import { ChainIcon } from "./chain-icon";

export function ChainMark({
  chain,
  size = "md",
}: {
  chain: DestinationChain;
  size?: "sm" | "md" | "lg";
}) {
  const pixels = size === "lg" ? 48 : size === "sm" ? 28 : 36;
  return (
    <ChainIcon
      chain={chain}
      className={
        size === "lg"
          ? "size-12 rounded-full"
          : size === "sm"
            ? "size-7 rounded-full"
            : "size-9 rounded-full"
      }
      pixels={pixels}
    />
  );
}
