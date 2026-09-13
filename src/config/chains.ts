import type { ChainlinkUsdFeed } from "../types/tokens.ts";
import adi from "./chains/adi.json" with { type: "json" };
import arbitrum from "./chains/arbitrum.json" with { type: "json" };
import aurora from "./chains/aurora.json" with { type: "json" };
import avalanche from "./chains/avalanche.json" with { type: "json" };
import base from "./chains/base.json" with { type: "json" };
import berachain from "./chains/berachain.json" with { type: "json" };
import bnb from "./chains/bnb.json" with { type: "json" };
import ethereumMetadata from "./chains/ethereum.json" with { type: "json" };
import gnosis from "./chains/gnosis.json" with { type: "json" };
import monad from "./chains/monad.json" with { type: "json" };
import optimism from "./chains/optimism.json" with { type: "json" };
import plasma from "./chains/plasma.json" with { type: "json" };
import polygon from "./chains/polygon.json" with { type: "json" };
import scroll from "./chains/scroll.json" with { type: "json" };
import xlayer from "./chains/xlayer.json" with { type: "json" };

export type DestinationChain = Readonly<{
  id: number;
  key: string;
  name: string;
  shortName: string;
  nearBlockchain: string;
  symbol: string;
  decimals: number;
  accent: string;
  logoURI: string;
  logoSourceUrl: string;
  trustWalletSlug?: string;
  /** Undefined when 1Click lists the chain but not a quotable native asset. */
  intentsAssetId?: string;
  chainlinkUsdFeed?: ChainlinkUsdFeed;
  explorerUrl: string;
  publicRpcUrl: string;
  fees: Readonly<{
    selfFundedBps: number;
    sponsoredBps: number;
  }>;
}>;

const chainMetadata = [
  ethereumMetadata,
  arbitrum,
  base,
  berachain,
  bnb,
  gnosis,
  optimism,
  plasma,
  polygon,
  avalanche,
  monad,
  xlayer,
  scroll,
  adi,
  aurora,
] satisfies readonly DestinationChain[];

/**
 * The immutable, ordered catalog used by every gas-network consumer.
 * Individual records live in JSON so chain metadata stays inspectable and
 * replaceable without editing UI or routing code.
 */
export const CHAIN_LIST: readonly DestinationChain[] = Object.freeze(
  chainMetadata.map((chain) =>
    Object.freeze({ ...chain, fees: Object.freeze(chain.fees) }),
  ),
);

export const CHAIN_BY_ID: Readonly<Record<number, DestinationChain>> =
  Object.freeze(
    Object.fromEntries(CHAIN_LIST.map((chain) => [chain.id, chain])),
  );

export const ethereum = CHAIN_BY_ID[1];
