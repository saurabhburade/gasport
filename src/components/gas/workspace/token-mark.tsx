"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { CHAIN_LIST } from "@/config/chains";
import {
  normalizeTokenLogoUri,
  trustWalletTokenLogoUri,
} from "@/lib/tokens/logo-uri";
import type { Token } from "@/types/tokens";
import { ChainIcon } from "./chain-icon";
import { tokenIconBySymbol } from "./constants";

const TOKEN_LOGO_CACHE = "gasport-token-logos-v1";
const cacheableTokenLogoPrefixes = [
  "https://coin-images.coingecko.com/",
  "https://raw.githubusercontent.com/trustwallet/assets/",
];

function CachedTokenLogo({
  alt,
  className,
  height,
  onError,
  src,
  width,
}: {
  alt: string;
  className: string;
  height: number;
  onError: () => void;
  src: string;
  width: number;
}) {
  const [cachedLogo, setCachedLogo] = useState<
    { source: string; url: string } | undefined
  >();
  const displaySource = cachedLogo?.source === src ? cachedLogo.url : src;

  useEffect(() => {
    if (
      !cacheableTokenLogoPrefixes.some((prefix) => src.startsWith(prefix)) ||
      typeof window === "undefined" ||
      !("caches" in window)
    ) {
      return;
    }

    let cancelled = false;
    let objectUrl: string | undefined;
    void (async () => {
      try {
        const cache = await window.caches.open(TOKEN_LOGO_CACHE);
        let response = await cache.match(src);
        if (!response) {
          response = await fetch(src, { cache: "force-cache" });
          if (!response.ok) return;
          await cache.put(src, response.clone());
        }
        objectUrl = URL.createObjectURL(await response.blob());
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setCachedLogo({ source: src, url: objectUrl });
      } catch {
        // The original URL remains available when Cache Storage is unavailable.
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  return (
    <Image
      alt={alt}
      className={className}
      height={height}
      onError={onError}
      src={displaySource}
      unoptimized
      width={width}
    />
  );
}

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
    tokenListIcon,
    trustWalletIcon,
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
        <CachedTokenLogo
          alt={`${token.name} logo`}
          className={`${dimensions.token} rounded-full`}
          height={dimensions.pixels}
          onError={() => {
            setFailedIcons((current) =>
              current.includes(icon) ? current : [...current, icon],
            );
          }}
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
