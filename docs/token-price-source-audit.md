# Token price source audit - 2026-09-12T15:25:03.010Z

This is a point-in-time, read-only comparison. Rerun with
`node scripts/audit-token-prices.mjs`. It matches NEAR prices by `assetId`,
LI.FI prices by chain ID and contract address, and CoinGecko prices by the
checked-in `coingeckoId` (a coin-level price, not a chain-specific quote).
Prices and availability will change.

**Use for this app:** live source gas estimates now run in the browser. USD
stablecoins use one token for the sponsored $1 fee without a source price read.
Other source tokens use a fresh Chainlink USD feed when mapped. Native gas USD
pricing also uses Chainlink when mapped. Feed addresses and
heartbeats live directly in `src/config/tokens/*.json` for ERC-20s and
`src/config/chains/*.json` for native assets. The mapping covers 34 of 39
source tokens and 10 of 13 native assets. Missing non-stable feeds, missing
native feeds, or feeds that return stale or invalid data fall back to NEAR `/v0/tokens` with a
ten-minute price freshness limit. When the required prices are available from
Chainlink or the stablecoin rule, the estimate makes no `/v0/tokens` request.
The feed contracts were read onchain
on 2026-09-12; the mapping should be rechecked when token catalogs or feeds
change. A DAI/USD feed was deliberately not used as an xDAI/USD feed.

Source tokens without a mapped feed: Ethereum WBTC; Gnosis EURe and GBPe;
Arbitrum USDT0; Berachain USDT0. Native assets without a mapped feed: Gnosis
xDAI, Polygon POL, and Berachain BERA. USD stablecoins use the one-token rule;
the other unmapped assets use the NEAR fallback.

LI.FI `/v1/token` covered every token too, but this audit used one request per
token and Gnosis GBPe diverged materially. CoinGecko's 14 unique coin IDs
covered all 39 entries in one batched request, but prices for deployments of
the same coin share an ID. The NEAR and CoinGecko values are often nearly
identical, so agreement between them is not proof of independent price
discovery.

For a client quote, compare gas cost and native balance in wei; that decision
does not need USD prices. If the balance read fails, the quote waits instead of
assuming sponsorship. To deduct a fixed **$1** from a source token, use a
fresh USD price with integer rounding (`ceil(10^decimals / priceUSD)` in token
base units). Deducting exactly one token only approximates $1 for USD-pegged
assets; it is wrong for EURe, GBPe, WETH, BTC wrappers, and other volatile
assets. If the price is stale, missing, or materially disagrees with the
selected route's price, disable the sponsored quote rather than silently
assuming a peg.

All three sampled public endpoints returned `Access-Control-Allow-Origin: *`
when queried with an Origin header. This is a header check, not a full browser
integration test. A representative onchain oracle check read Ethereum
Chainlink ETH/USD at **$2539.7105**, updated **2026-09-12T15:04:11Z**; it was
close to NEAR's **$2540.16**. All configured feed addresses were subsequently
read onchain and checked against their directory heartbeat. The estimator
requires a positive answer and a recent update before accepting one.

References: [NEAR token prices](https://docs.near-intents.org/api-reference/oneclick/get-supported-tokens),
[LI.FI token prices](https://docs.li.fi/api-reference/fetch-all-known-tokens),
[CoinGecko public prices](https://docs.coingecko.com/docs/keyless-public-api),
[Chainlink feed directory](https://docs.chain.link/data-feeds/price-feeds/addresses),
[Chainlink ETH/USD](https://data.chain.link/feeds/ethereum/mainnet/eth-usd).

39 listed tokens; NEAR 39 (39 updated within 10 min), LI.FI 39, CoinGecko 39.

| Chain | Token | NEAR USD (age min) | LI.FI USD | CoinGecko USD | Max difference vs NEAR | Note |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | AAVE | 126.030 (1) | 125.494 | 126.020 | 0.43% |  |
| 1 | cbBTC | 77436.0 (1) | 77130.1 | 77416.0 | 0.39% |  |
| 1 | DAI | 0.999765 (1) | 0.998243 | 0.999765 | 0.15% |  |
| 1 | LINK | 11.6000 (1) | 11.5417 | 11.6000 | 0.50% |  |
| 1 | UNI | 6.50000 (1) | 6.44823 | 6.52000 | 0.80% |  |
| 1 | USD1 | 0.999758 (1) | 0.996594 | 0.999755 | 0.32% |  |
| 1 | USDC | 0.999860 (1) | 1.00014 | 0.999862 | 0.03% |  |
| 1 | USDf | 0.996656 (1) | 0.995960 | 0.996656 | 0.07% |  |
| 1 | USDT | 0.999802 (1) | 0.998334 | 0.999803 | 0.15% |  |
| 1 | WBTC | 77419.0 (1) | 77412.2 | 77419.0 | 0.01% |  |
| 1 | WETH | 2540.16 (1) | 2540.45 | 2539.94 | 0.01% |  |
| 10 | USDC | 0.999860 (1) | 1.00422 | 0.999862 | 0.44% |  |
| 10 | USDT | 0.999802 (1) | 0.999510 | 0.999803 | 0.03% |  |
| 10 | WETH | 2540.16 (1) | 2540.98 | 2539.94 | 0.03% |  |
| 56 | USDC | 0.999860 (1) | 0.999885 | 0.999862 | 0.00% |  |
| 56 | USDT | 0.999802 (1) | 1.00015 | 0.999803 | 0.03% |  |
| 100 | EURe | 1.16000 (1) | 1.16015 | 1.16000 | 0.01% |  |
| 100 | GBPe | 1.36000 (1) | 1.51784 | 1.36000 | 11.61% | price divergence >2% |
| 100 | USDC | 0.999860 (1) | 0.999999 | 0.999862 | 0.01% |  |
| 100 | USDT | 0.999802 (1) | 0.997433 | 0.999803 | 0.24% |  |
| 100 | WETH | 2540.16 (1) | 2532.01 | 2539.94 | 0.32% |  |
| 137 | USDC | 0.999860 (1) | 0.999317 | 0.999862 | 0.05% |  |
| 137 | USDT | 0.999802 (1) | 1.00035 | 0.999803 | 0.06% |  |
| 137 | WETH | 2540.16 (1) | 2540.42 | 2539.94 | 0.01% |  |
| 143 | USDC | 0.999860 (1) | 1.00023 | 0.999862 | 0.04% |  |
| 143 | USDT0 | 1.00000 (1) | 0.999955 | 1.00000 | 0.00% |  |
| 196 | USDC | 0.999860 (1) | 0.995679 | 0.999862 | 0.42% |  |
| 196 | USDT0 | 1.00000 (1) | 1.00304 | 1.00000 | 0.30% |  |
| 8453 | cbBTC | 77436.0 (1) | 77444.7 | 77416.0 | 0.03% |  |
| 8453 | USDC | 0.999860 (1) | 0.998355 | 0.999862 | 0.15% |  |
| 8453 | WETH | 2540.16 (1) | 2539.99 | 2539.94 | 0.01% |  |
| 9745 | USDT0 | 1.00000 (1) | 0.999348 | 1.00000 | 0.07% |  |
| 42161 | USDC | 0.999860 (1) | 1.00070 | 0.999862 | 0.08% |  |
| 42161 | USDT0 | 1.00000 (1) | 0.999202 | 1.00000 | 0.08% |  |
| 42161 | WETH | 2540.16 (1) | 2540.45 | 2539.94 | 0.01% |  |
| 43114 | USDC | 0.999860 (1) | 0.999850 | 0.999862 | 0.00% |  |
| 43114 | USDT | 0.999802 (1) | 1.00223 | 0.999803 | 0.24% |  |
| 80094 | USDT0 | 1.00000 (1) | 1.00225 | 1.00000 | 0.22% |  |
| 534352 | USDT | 0.999802 (1) | 0.999777 | 0.999803 | 0.00% |  |
