import {
  type IntentsTokenCatalogItem,
  sourceTokensFromCatalog,
} from "@/lib/tokens/source-catalog";
import ethereum from "./tokens/1.json" with { type: "json" };
import optimism from "./tokens/10.json" with { type: "json" };
import bnb from "./tokens/56.json" with { type: "json" };
import gnosis from "./tokens/100.json" with { type: "json" };
import polygon from "./tokens/137.json" with { type: "json" };
import monad from "./tokens/143.json" with { type: "json" };
import xlayer from "./tokens/196.json" with { type: "json" };
import base from "./tokens/8453.json" with { type: "json" };
import plasma from "./tokens/9745.json" with { type: "json" };
import adi from "./tokens/36900.json" with { type: "json" };
import arbitrum from "./tokens/42161.json" with { type: "json" };
import avalanche from "./tokens/43114.json" with { type: "json" };
import berachain from "./tokens/80094.json" with { type: "json" };
import scroll from "./tokens/534352.json" with { type: "json" };
import aurora from "./tokens/1313161554.json" with { type: "json" };

/**
 * A checked-in snapshot of 1Click-supported stablecoins, partitioned by
 * origin chain ID. Run `pnpm tokens:sync` to refresh it deliberately.
 */
export const intentsTokenCatalog = Object.freeze([
  ...ethereum,
  ...arbitrum,
  ...adi,
  ...aurora,
  ...base,
  ...berachain,
  ...bnb,
  ...gnosis,
  ...optimism,
  ...plasma,
  ...polygon,
  ...avalanche,
  ...monad,
  ...xlayer,
  ...scroll,
] satisfies readonly IntentsTokenCatalogItem[]);

/** Every local ERC-20 which NEAR Intents supported when the catalog was synced. */
export const supportedTokens = Object.freeze(
  sourceTokensFromCatalog(intentsTokenCatalog),
);
