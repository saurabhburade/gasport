# Gas

Turn ERC-20 tokens into native gas on another chain.

Gas is a focused gas-abstraction MVP: **TOKEN I HAVE → GAS I NEED → DESTINATION CHAIN**.

## Development

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

For local sponsored wallet calls, keep the development server running and
start the configured HTTPS tunnel in a second terminal:

```bash
pnpm dev:tunnel
```

The tunnel intentionally targets `127.0.0.1` because ngrok can resolve
`localhost` to IPv6 while the Next.js development server is listening on IPv4.
Set `NEXT_PUBLIC_PAYMASTER_PROXY_URL` to the HTTPS URL printed by ngrok.

The app can keep transaction execution in demo mode with `NEXT_PUBLIC_ENABLE_DEMO_MODE=true`. Connected-wallet balances and NEAR Intents quotes are still fetched live; demo mode only prevents transaction submission and never invents transaction hashes.

## Architecture

- Next.js App Router + React Server Components by default.
- Client-only wallet UX is isolated in `components/app-providers.tsx` and `components/wallet/`.
- Reown AppKit provides EVM wallet connections, including Coinbase Wallet. There is no Coinbase CDP integration or Coinbase credential.
- wagmi/viem provide live ERC-20/native balance reads, the typed EVM boundary, and bigint-safe token arithmetic.
- `app/api/intents/*` validates NEAR Intents 1Click quote, deposit, and status data at the server boundary before it reaches the browser.
- `lib/intents/` owns the NEAR 1Click request/response contracts, server-only authentication, quote-signature verification, and provider configuration.
- `lib/routes/adapters/` normalizes NEAR 1Click and LI.FI quotes, fees, prepared calls, and settlement status behind one route interface.

## Environment variables

See `.env.example`. `NEXT_PUBLIC_REOWN_PROJECT_ID` is required for a live AppKit modal. Configure `NEAR_INTENTS_API_KEY` for authenticated 1Click requests and deposit submission. It is read only on the server and sent as a bearer token; never expose it with a `NEXT_PUBLIC_` prefix. The production 1Click and explorer URLs are the defaults.

Keep demo mode enabled for UI work. Live quotes use production market data even in demo mode, while deposits remain disabled.

## Connected-wallet NEAR Intents flow

The live quote handler continuously requests one dry NEAR Intents 1Click `EXACT_INPUT` market quote for the selected ERC-20 and native destination gas token. The quote refreshes when its inputs change, retries after transient failures, and refreshes again when it expires. The app does not present multiple solver quotes because 1Click returns the selected quote.

Before quoting, the server estimates source gas from live dRPC simulation and native balance, Pimlico UserOperation gas pricing, and NEAR Intents token prices. Inputs must be worth at least $5. If the account lacks native gas and the source chain has an Alchemy policy, the app sponsors the transaction and deducts a fixed $1-$5 tier from the input before requesting route quotes. An account with enough native gas pays normally and no sponsorship fee is deducted.

After explicit confirmation, the app requests a fresh executable quote and validates it against the selected route. A sponsored execution uses a compatible EIP-5792 wallet to submit one atomic batch. The batch transfers the fixed sponsorship fee to `SPONSORED_GAS_FEE_RECIPIENT`, then executes the provider calls. LI.FI routes additionally transfer a 1% platform fee to `PLATFORM_FEE_RECIPIENT` (falling back to the sponsorship recipient) and quote LI.FI with the remaining amount. These deductions are included inside the user's entered total rather than added on top. If any call fails, the complete batch fails.

The displayed source-gas charge is a buffered pre-execution estimate, not a post-settlement measurement. Final native gas can vary before inclusion. The app never receives private keys, signs on behalf of a user, or submits a deposit before explicit wallet confirmation.

Execution progress stays in React state for the current page session. Once a transaction hash is known, retry only checks that transaction again or continues settlement polling; it never sends the deposit twice.

Learn more in the [NEAR Intents 1Click documentation](https://docs.near-intents.org/integration/distribution-channels/1click-api/sdk) or inspect swaps in the [NEAR Intents Explorer](https://explorer.near-intents.org/).

## Security

- Never request or store private keys or seed phrases.
- Token identity is contract address + chain ID, not symbol alone.
- Token quantities use `bigint`/decimal-safe representations, never floating-point transfer values.
- Never silently switch networks or execute before explicit confirmation.

## Verification

```bash
pnpm biome check .
pnpm build
```

## Git hooks

Configure the repository's dependency-free Git hooks with:

```bash
pnpm setup:hooks
```

The `commit-msg` hook validates Conventional Commit subjects, while allowing
Git-generated merge, revert, `fixup!`, and `squash!` messages. The `pre-commit`
hook runs the secret scanner and Biome in check-only mode against staged files.
Run `pnpm setup:hooks` again after cloning or when the repository's Git
configuration is recreated.

Run a full tracked-file and history secret scan independently with:

```bash
pnpm scan:secrets
```
