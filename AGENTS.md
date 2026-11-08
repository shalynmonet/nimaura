<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## NIMAURA project rules
- Credit spends and collectible issuance happen only in SECURITY DEFINER SQL functions (`unseal_with_credit`, `simulate_paid_unseal`); profiles.credits has no client UPDATE grant. Why: prevents duplicate/forged credits and enforces drop windows server-side.
- Manifestations render from `buildManifestation(seed, intention)` in src/lib/manifest.ts; stored config is a snapshot only. Why: reproducibility.
- Nimiq code lives in src/lib/nimiq/; never call SDK functions not verified against nimiq.dev docs, and simulated rows must keep `is_simulated`/`source='simulated'`. Why: no fake claims of real payments.
- Wallet proof and payment orchestration use authenticated server functions with server-only durable challenges/quotes; privileged writes authorize collector ownership first. Why: client wallet responses cannot confer ownership or issue collectibles.
- Network-scoped verified wallet links replace legacy Reserve addresses; only service-role atomic challenge consumption may write links. Why: unauthenticated address editing must not masquerade as ownership proof.
- Paid issuance uses service-only `fulfill_verified_nimiq_payment` after canonical finalized mainnet verification; testnet quotes never enter production ledgers and fulfillment never creates savings transfers. Why: allocation is not delivery and client transaction hashes are not proof.
- Nimiq message verification uses portable Ed25519/SHA-256 and Blake2b-256 matching official Keyguard/Core protocol sources; SDK imports are deferred to browser events. Why: avoid server WASM/host globals and guessed signing formats.
- Testnet payment fulfillment and manual payouts use separate service-only atomic SQL functions and an isolated testnet ledger; uncertain wallet claims never reset automatically. Why: retries cannot create duplicate deliveries or contaminate production savings.
- Albatross verification uses a server-only configured HTTPS adapter, validated consensus/network/canonical macro finality and unique public payout references; admin authorization is stored in user_roles. Why: browser claims and transaction hashes never authorize issuance or payouts.
- Separate testnet web wallets use browser-only fixed-endpoint Hub redirects with server-bound one-use requests; narrow portable transaction decoding validates signatures and all snapshotted intent fields. Why: Pay account selection cannot select a web-wallet signer.
- Hub signed payout bytes are service-only; atomic result acceptance pins the hash and reserves one broadcast attempt, with all recovery paths limited to reconciliation. Why: ambiguous sends and reloads must never create duplicate treasury delivery.
