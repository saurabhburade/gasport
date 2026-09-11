"use client";

import Image from "next/image";
import { useState } from "react";
import { CHAIN_LIST } from "@/config/chains";
import {
  normalizeTokenLogoUri,
  trustWalletTokenLogoUri,
} from "@/lib/tokens/logo-uri";
import type { Token } from "@/types/tokens";
import { ChainIcon } from "./chain-icon";
import { tokenIconBySymbol } from "./constants";

export function TokenMark({
  token,
  size = "default",
}: {
  token: Token;
  size?: "default" | "small" | "tiny";
}) {
  const tokenListIcon = normalizeTokenLogoUri(token.logoUri);
  const trustWalletIcon = trustWalletTokenLogoUri(token);
  const [failedIcons, setFailedIcons] = useState<string[]>([]);
  const icon = [
    trustWalletIcon,
    tokenListIcon,
    tokenIconBySymbol[token.symbol.toUpperCase()],
  ].find((candidate) => candidate && !failedIcons.includes(candidate));
  const tokenChain = CHAIN_LIST.find((chain) => chain.id === token.chainId);
  const dimensions =
    size === "tiny"
      ? { token: "size-6", network: "size-3", pixels: 24, networkPixels: 12 }
      : size === "small"
        ? {
            token: "size-7",
            network: "size-3.5",
            pixels: 28,
            networkPixels: 14,
          }
        : { token: "size-9", network: "size-4", pixels: 36, networkPixels: 16 };
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center ${dimensions.token}`}
    >
      {icon ? (
        <Image
          alt={`${token.name} logo`}
          className={`${dimensions.token} rounded-full`}
          height={dimensions.pixels}
          onError={() => {
            setFailedIcons((current) =>
              current.includes(icon) ? current : [...current, icon],
            );
          }}
          sizes={`${dimensions.pixels}px`}
          src={icon}
          width={dimensions.pixels}
        />
      ) : (
        <span
          aria-label={`${token.name} logo`}
          className={`flex ${dimensions.token} items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-background`}
          role="img"
        >
          {token.symbol.slice(0, 3).toUpperCase()}
        </span>
      )}
      {tokenChain && token.chainId !== 1 && (
        <ChainIcon
          chain={tokenChain}
          className={`absolute -bottom-0.5 -right-0.5 ${dimensions.network} rounded-full border-2 border-secondary`}
          pixels={dimensions.networkPixels}
        />
      )}
    </span>
  );
}
