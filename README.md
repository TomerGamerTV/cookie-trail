# CookieTrail

[![Powered by RustChain](https://img.shields.io/badge/Powered%20by-RustChain-orange)](https://rustchain.org)

CookieTrail is a non-custodial Cookie Chain cApp for sending COOK with a human-readable receipt embedded in the same transaction through the canonical SVM Memo program.

**Live app:** https://tomergamertv.github.io/cookie-trail/

## What it does

- Connects directly to the Nightly browser wallet.
- Requests Cookie Chain as Nightly's active custom SVM network using the live genesis hash.
- Reads live balance, slot, block height, and performance data from Cookie Chain.
- Builds an atomic transaction containing an optional COOK transfer plus a structured receipt memo.
- Tracks signing, broadcast, and confirmation states in real time.
- Links confirmed receipts to Cookiescan and keeps a local receipt history/analytics view.
- Works responsively on desktop and mobile.

No private keys, seed phrases, or custody logic are handled by the app.

## Network

- RPC: `https://rpc.cookiescan.io`
- WebSocket: `https://wss.cookiescan.io`
- Explorer: `https://cookiescan.io`
- Memo program: `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`
- Native token: COOK (9 decimals)

## Local development

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev
```

Production verification:

```bash
npm run lint
npm run build
```

## How a receipt is created

1. The sender connects Nightly and switches it to Cookie Chain.
2. CookieTrail validates the destination, COOK amount, and memo text.
3. A legacy SVM transaction is built with `SystemProgram.transfer` when the amount is non-zero.
4. A structured JSON receipt is appended with the canonical Memo program.
5. Nightly signs the unsigned transaction bytes; the app never receives private key material.
6. The signed transaction is broadcast to Cookie Chain and awaited at `confirmed` commitment.
7. The final signature is stored locally and linked to Cookiescan for public verification.

Example memo payload:

```json
{
  "app": "CookieTrail",
  "v": 1,
  "amount": "0.001",
  "to": "<recipient>",
  "note": "Design deposit",
  "createdAt": "<ISO timestamp>"
}
```

## Security model

- Non-custodial: signing happens inside Nightly.
- Network identity is derived from Cookie Chain's live genesis hash rather than hard-coded wallet state.
- Recipient addresses are parsed through `PublicKey` before transaction construction.
- Amounts are bounded and converted to integer lamports before signing.
- Transaction confirmation is checked for on-chain execution errors before a receipt is recorded.
- Receipt history is local-only; no analytics or tracking backend is used.

## Bounty fit

CookieTrail was built for the Cookie Chain cApp bounty. It demonstrates wallet connectivity, Nightly support, live Cookie Chain data, transaction execution, confirmation handling, error feedback, app-specific analytics, and open-source source code while using existing Cookie Chain infrastructure.

## License

MIT
