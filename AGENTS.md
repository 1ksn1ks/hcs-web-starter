# AGENTS.md — HCS web starter

This repo is a **copy-paste Hedera web template**. Treat `lib/hedera.js` and `lib/wallet.js` as the product. The playground is a catalog, not the app to extend forever.

## Layout

- `packages/nextjs/lib/hedera.js` — one export = one Hedera action. Keep functions independent so a human can copy one function.
- `packages/nextjs/lib/wallet.js` — HashPack via `@hashgraph/hedera-wallet-connect`. Exports `dAppConnector`, `signer`, `connectedAccount`, `MIRROR_BASE`, `NETWORK`.
- `packages/nextjs/components/Playground.jsx` — demo UI. Do not dump business logic here.
- `packages/hardhat` — placeholder so scaffold-hbar has a contracts package. Real work is HCS (no Solidity required).

## Network

Default **testnet**. `NEXT_PUBLIC_HEDERA_NETWORK` and HashPack must match. Mirror URL lives in `wallet.js` next to that flag. `hedera.js` re-exports `MIRROR_BASE`.

## Rules

1. Do not commit `.env`, `.env.local`, or private keys.
2. Writes (`create_topic`, `update_topic`, `send_message`) require `signer`. Reads do not.
3. Encrypt chat yourself before `send_message` if the room is private. This helper does not encrypt.
4. HIP-991 custom fees: amount is tinybars when `denominatingTokenId` is empty. `100000000` = 1 HBAR.
5. After adding a helper, add a playground card, a `?` help entry, and a README row. Same example call in JSDoc, `?` help, and README.
6. Function names in JS are `snake_case`. Human labels in the UI stay normal English.
7. `npm run lint` and `npm run next:build` must stay green.
8. Do not copy `Playground.jsx` into a new product. Copy `wallet.js` + only the functions needed from `hedera.js`.

## First-run for agents

```bash
npm install
cp .env.example packages/nextjs/.env.local
# set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
npm run next:dev
```

Need a WalletConnect project id in `.env.local`. Then generate keys → connect HashPack (testnet) → create topic (optional admin KeyList + submit key) → send (pass submit key if set) → get messages.

## Adding a helper

1. Export one function from `hedera.js`. Document inputs, wallet yes/no, and a copy-paste example in the JSDoc.
2. Import it from `Playground.jsx`. Add an accordion card + `HELP` entry (kid-simple body + Try line).
3. Add a row to the README steal table.
4. Reads go through `MIRROR_BASE`. Writes go through `requireSigner()`.

## Tests

```bash
npm run lint          # next lint + hardhat test
npm run next:build
npm run hardhat:test
```

There is no live HashPack in CI. Do not add tests that require a funded wallet.

## Steal pattern

New Hedera web app: copy `wallet.js` + only the functions you need from `hedera.js`. Pair network (`NEXT_PUBLIC_HEDERA_NETWORK`) with HashPack.
