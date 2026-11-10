# Testnet wallet operations and remaining gates

NIMAURA does not enable payments or configure wallets automatically. Mainnet payment paths are rejected. Testnet delivery is not real savings.

## Separate official web Wallets

Nimiq Pay selects its own signing account. Neither entering a Reserve address nor selecting a NIMAURA address selects Pay's signer. The collector stays logged in; no recovery-word import or logout is required or requested.

Separate web-Wallet Reserve proof and treasury signing now use browser-only Hub actions. Open NIMAURA in the same Safari/browser context as the official testnet web Wallet and sign in to NIMAURA there. Collector Pay stays signed in and collector payments are unchanged. Native Pay-WebView handoff is gated; no device interoperability is claimed. A collector-funded second transfer is never a payout substitute.

## Implemented minimal Hub adapter

Official sources:
- https://nimiq.dev/hub/getting-started
- https://nimiq.dev/hub/api-reference
- https://nimiq.dev/hub/guide/integration
- https://nimiq.dev/hub/guide/transactions

Use the documented testnet Hub from a user action in the browser context owning the separate web Wallet. `hub.signMessage({ appName, signer, message })` selects the claimed address; convert returned public-key/signature bytes to hex and verify the existing durable ownership challenge server-side.

The endpoint is fixed to `https://hub.nimiq-testnet.com`. Treasury ownership derives the signer from the payout server-side, never from a client override. Payout `signTransaction` requests bind sender, Reserve snapshot, integer Luna, fee zero, public reference and server height. Only reference-bearing extended transactions with basic accounts and single Ed25519 proofs are supported. Multisig, contracts, WebAuthn, other fees/networks and multiple returned transactions fail closed.

The backend decodes signed bytes and verifies signer, signature, content hash and every intent field against the stored claim, not Hub raw metadata. Installed official Core supplies cryptographic parity fixtures in tests only; server verification uses portable JavaScript, not server WASM.

One-use expiring owner-bound redirect state is consumed atomically with private signed-byte storage and hash pinning before one trusted-RPC `sendRawTransaction` attempt. Crashes between storage and broadcast intentionally remain unresolved; no resend path exists. Unknown broadcasts and reloads only reconcile the pinned hash and canonical macro finality. No client database role can read the signed bytes.

Mobile browser requests use official `RedirectRequestBehavior`, a fixed same-origin `/hub-return` URL and opaque local correlation state, not credentials. Return listeners register before `checkRedirectResponse()`. The server rechecks owner, expiry, state consumption, roles and treasury proof. SessionStorage temporarily retains the return for reload/sign-in recovery and clears signed bytes after confirmation; it contains no signing key.

Actual iOS browser wallet-session access, redirects and device approval remain untested. Mock redirect tests are not device validation. Sign into NIMAURA separately in the browser; do not transfer collector credentials in URLs or import recovery words.

## Authorized manual demo — November 10, 2026

Only `NIMIQ_TESTNET_MANUAL_PAYOUTS_ENABLED=true` was added; collector payment configuration was not changed, mainnet remains rejected, and no automatic payouts were enabled. Existing treasury ownership is not yet proven by the admin account; this is the next required user action, not a reason to overwrite wallet links.

Selected existing payout: `58ea448c-eba6-45ac-96d0-3f40d9c75ba8`, still queued and unclaimed, for **1,906.57770 testnet NIM** (190,657,770 Luna), exactly half its fulfilled incoming payment. Sender: `NQ67 X8Y3 PBLP K1S7 EA8P A8P2 61TS J4HU HCQC`. Verified Reserve: `NQ65 PTY8 0HC8 9E0M PKGJ NT1L BD6M SB04 HU9P`. Reference: `NIMAURA:58ea448c-eba6-45ac-96d0-3f40d9c75ba8`.

Read-only trusted testnet checks confirmed consensus, a canonical macro checkpoint, the successful incoming transfer, and no outgoing transaction with this reference. No claim, wallet request, signing, broadcast, or delivery was performed. Existing baseline: 9 collectibles, 0 credits, 7 queued payouts, no delivered payouts. All 38 existing Hub orchestration, signed-intent, and database replay tests passed.

Safari operator steps:
1. Use the same normal Safari context that already owns the treasury in the official testnet web Wallet; keep Nimiq Pay signed in. Do not import recovery words. If Safari cannot access this wallet, stop.
2. Open `https://nimaura.sha-i.com/account` and sign in with the existing admin account.
3. Find reference `NIMAURA:58ea448c-eba6-45ac-96d0-3f40d9c75ba8` (1,906.5777 test NIM). Tap **Verify treasury · browser only** on that row. Approve only the ownership message for the exact treasury address; this message does not send funds. Wait for ownership verification and return to Account.
4. Tap **Approve payout · browser only** on that same row once. This claims the original payout and opens the testnet wallet approval. Compare the exact sender, Reserve, 1,906.57770 NIM, zero fee, testnet network, and reference. Stop here to review. No funds move until the wallet transaction is approved.
5. When ready, approve that one transaction and allow the return to NIMAURA. After signing, acceptance may broadcast once; a broadcast or unknown result is not finalized delivery. Use **Reconcile delivery** on the same row if needed. Never approve a different payout as a retry; expired or interrupted claims remain unresolved.
6. Report the original transaction hash or reference for verification. Delivery is confirmed only when this row becomes `paid` with on-chain finalized evidence and Reserve shows delivered testnet savings. Actual phone approval, broadcast, and finalized delivery remain pending.

## Existing manually sent payout reconciliation

For an already claimed (`uncertain`) payout, enter its known hash in the admin queue, then choose **Reconcile delivery**. With no hash, the server searches trusted treasury history for the unique public reference. Neither action sends funds.

Recognition still requires exact treasury sender, Reserve snapshot, allocation, reference, testnet network, claimed validity-start height, successful execution, canonical inclusion during the five-minute claim window, and macro finality/ancestry. Verification may occur after expiry if inclusion happened within the window. A supplied hash cannot override those requirements or be reused for another payout.

Once Hub acceptance pins a hash, reconciliation always uses it and rejects replacement. Legacy manually sent claims without a pinned hash still accept the original hash or reference lookup; neither operation broadcasts.

A transfer sent before the claim, with a different validity height, without the reference, outside the claim window, or beyond bounded ancestry/history coverage remains unresolved. Do not send again. Keep its original hash/reference; a separately reviewed historical recovery/accounting path is required. No permissive historical import is implemented.

## Trusted verification source provenance

https://www.nimiq.com/developers/rpc/open-servers lists **Nimiq Watch Testnet**, maintained by **sisou**. It is community-operated, not Nimiq-operated, with no production uptime guarantee. Confirm endpoint network, history/index coverage, method support and operator trust before configuration; no endpoint is installed by this task.

Alternatively operate an Albatross testnet history node from the official https://github.com/nimiq/core-rs-albatross implementation behind an authenticated HTTPS gateway under your control. Ownership comes from your hosting and gateway control; official source provenance alone does not establish ownership of a third-party endpoint.