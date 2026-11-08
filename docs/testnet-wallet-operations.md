# Testnet wallet operations and remaining gates

NIMAURA does not enable payments or configure wallets automatically. Mainnet payment paths are rejected. Testnet delivery is not real savings.

## Separate official web Wallets

Nimiq Pay selects its own signing account. Neither entering a Reserve address nor selecting a NIMAURA address selects Pay's signer. The collector stays logged in; no recovery-word import or logout is required or requested.

Separate web-Wallet Reserve proof and treasury payouts are **not supported by the current Pay-only adapter**. The payout UI proves the current Pay signer matches the treasury before claiming or opening a transaction request. A collector-funded second transfer is never a payout substitute.

## Minimal future Hub adapter (not implemented)

Official sources:
- https://nimiq.dev/hub/getting-started
- https://nimiq.github.io/hub/api-reference/sign-message
- https://nimiq.dev/hub/guide/transactions

Use the documented testnet Hub from a user action in the browser context owning the separate web Wallet. `hub.signMessage({ appName, signer, message })` selects the claimed address; convert returned public-key/signature bytes to hex and verify the existing durable ownership challenge server-side.

For payouts, `hub.signTransaction({ appName, sender, recipient, value, fee, extraData, validityStartHeight })` must preserve the durable claim, treasury sender, Reserve snapshot, integer allocation and unique public reference. Hub returns signed transaction data, not a broadcast. Validate its returned raw fields against the claim before a single explicitly approved broadcast using the documented testnet Web Client `sendRawTransaction(signed.serializedTx)`. Never import a signing key. Capture uncertain state before broadcast; reconcile rather than retry. Hub checkout is not a drop-in replacement because it does not preserve this queue's exact validity-start-height binding.

Device handoff/session availability and protocol signature fixtures must be tested before enabling this path. A web Wallet session is not assumed to be available in Pay's iOS WebView.

## Existing manually sent payout reconciliation

For an already claimed (`uncertain`) payout, enter its known hash in the admin queue, then choose **Reconcile delivery**. With no hash, the server searches trusted treasury history for the unique public reference. Neither action sends funds.

Recognition still requires exact treasury sender, Reserve snapshot, allocation, reference, testnet network, claimed validity-start height, successful execution, canonical inclusion during the five-minute claim window, and macro finality/ancestry. Verification may occur after expiry if inclusion happened within the window. A supplied hash cannot override those requirements or be reused for another payout.

A transfer sent before the claim, with a different validity height, without the reference, outside the claim window, or beyond bounded ancestry/history coverage remains unresolved. Do not send again. Keep its original hash/reference; a separately reviewed historical recovery/accounting path is required. No permissive historical import is implemented.

## Trusted verification source provenance

https://www.nimiq.com/developers/rpc/open-servers lists **Nimiq Watch Testnet**, maintained by **sisou**. It is community-operated, not Nimiq-operated, with no production uptime guarantee. Confirm endpoint network, history/index coverage, method support and operator trust before configuration; no endpoint is installed by this task.

Alternatively operate an Albatross testnet history node from the official https://github.com/nimiq/core-rs-albatross implementation behind an authenticated HTTPS gateway under your control. Ownership comes from your hosting and gateway control; official source provenance alone does not establish ownership of a third-party endpoint.