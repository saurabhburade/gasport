"use client";

import Image from "next/image";
import { useState } from "react";
import type { DestinationChain } from "@/config/chains";

export function ChainIcon({
  chain,
  className,
  pixels,
}: {
  chain: DestinationChain;
  className: string;
  pixels: number;
}) {
  const [failedLogoURIs, setFailedLogoURIs] = useState<string[]>([]);
  const icon = failedLogoURIs.includes(chain.logoURI)
    ? undefined
    : chain.logoURI;
  return icon ? (
    <Image
      alt={`${chain.name} logo`}
      className={className}
      height={pixels}
      onError={() => {
        setFailedLogoURIs((current) =>
          current.includes(icon) ? current : [...current, icon],
        );
      }}
      sizes={`${pixels}px`}
      src={icon}
      width={pixels}
    />
  ) : (
    <span
      aria-label={`${chain.name} logo`}
      className={`${className} flex items-center justify-center text-[9px] font-bold uppercase`}
      role="img"
      style={{
        backgroundColor: chain.accent,
        color: chain.id === 534352 ? "#1f1f1f" : "#ffffff",
      }}
    >
      {chain.shortName.slice(0, 2)}
    </span>
  );
}
