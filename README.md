# HCS web starter

A **copy-paste Hedera Consensus Service template** for web apps.

Most starters bury HCS behind a demo. This one is the opposite: two steal files, and a playground that only exists so you can *see* each call before you copy it.

```bash
npm create scaffold-hbar@latest -- --template 1ksn1ks/hcs-web-starter
```

Official scaffold-hbar templates talk to Hedera through EVM wallets (RainbowKit / wagmi). Chat rooms, feeds, and notifications are HCS — they need HashPack, topic admin keys, HIP-991 paid rooms, and the mirror node. That is what this template gives you as independent functions.

## Steal these

| Copy this | When | Wallet |
|---|---|---|
| `lib/wallet.js` | HashPack / WalletConnect connect + signer | — |
| `generate_private_and_public_key` | Local ED25519 pair (topic admin / submit key) | no |
| `create_topic` | New HCS topic (mailbox). Optional admin KeyList + submit key | yes |
| `update_topic` | Memo / keys / HIP-991 paid-topic fees | yes + admin key(s) |
| `send_message` | Submit one payload (pass submit key if the topic has one) | yes |
| `get_messages` | One-shot mirror history | no |
| `subscribe_to_topic` | History + 3s live poll | no |
| `get_topic_info` | Topic record | no |
| `get_account_nfts` | Account NFT list | no |

Writes need a wallet. Reads use the mirror. Keep `wallet.js` network and `MIRROR_BASE` in sync.

**Do not copy `Playground.jsx` into production apps.** That file is the demo UI. Copy `hedera.js` and `wallet.js`.

## Prerequisites

- Node.js ≥ 20.18.3 ([.nvmrc](.nvmrc) pins it)
- [HashPack](https://www.hashpack.app/) on **Hedera testnet**
- Testnet HBAR from the [Hedera faucet](https://portal.hedera.com/)
- A WalletConnect project id from [cloud.reown.com](https://cloud.reown.com) (public client id, not a secret)

## Quick start

```bash
npm install
cp .env.example packages/nextjs/.env.local
# paste NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
npm run next:dev
```

Open http://localhost:3000

### First run

1. Generate private and public key (no wallet)
2. Connect HashPack (testnet)
3. Create topic — one or more admin private keys (one per line), optional submit key
4. Send message — include the submit key if you set one
5. Get messages

Copy the HashScan topic link after step 3. That is the bounty proof.

## Steal a function

```js
import { create_topic } from './lib/hedera.js';

const topicId = await create_topic({
  memo: 'my-room',
  adminkey: [admin1, admin2], // optional — KeyList of owners
  adminThreshold: 1,          // optional — 1 of 2 can update
  submitkey: submitPrivateKey, // optional — empty = anyone can send
});

await send_message(topicId, JSON.stringify({ text: 'hello' }), submitPrivateKey);
```

Each export is documented at the top of the function in `hedera.js`. The playground `?` button shows the same text plus a try-this example.

## Architecture

```
Playground.jsx  →  hedera.js  →  HashPack signer   (writes)
                              →  Mirror REST       (reads)
                →  wallet.js  →  DAppConnector     (testnet default)
```

| Layer | What |
|---|---|
| Writes | `TopicCreateTransaction`, `TopicUpdateTransaction`, `TopicMessageSubmitTransaction` via `executeWithSigner` |
| Reads | Mirror `/api/v1/topics/{id}/messages`, `/topics/{id}`, `/accounts/{id}/nfts` |
| Paid rooms | HIP-991 `CustomFixedFee` on topic update. Amount is tinybars when no token id. `100000000` = 1 HBAR |
| Admin / submit keys | ED25519 from `generate_private_and_public_key`. Several keys → `KeyList` + threshold. Admin is also `feeScheduleKey`. Empty submit key = anyone can send. |

HCS is not a Solidity contract. The Hardhat package is a compile/test placeholder so the scaffold-hbar monorepo gate is green.

## Network

Default is **testnet** (required for the scaffold-hbar bounty HashScan proof).

| Env | Values | Notes |
|---|---|---|
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Reown Cloud id | Public client id. Copy from `.env.example` |
| `NEXT_PUBLIC_HEDERA_NETWORK` | `testnet` (default) or `mainnet` | Must match HashPack. `wallet.js` and `hedera.js` share this |

To use mainnet, set `NEXT_PUBLIC_HEDERA_NETWORK=mainnet` and switch HashPack to mainnet.

Never commit `.env`, `.env.local`, or private keys.

## Project layout

```
packages/
  nextjs/                 frontend — steal lib/hedera.js + lib/wallet.js
    lib/hedera.js         all HCS helpers
    lib/wallet.js         HashPack connector
    components/Playground.jsx   demo UI only
  hardhat/                compiles so the monorepo gate is green
    contracts/            HCS does not need Solidity; placeholder only
```

## Scripts

| Command | |
|---|---|
| `npm run next:dev` | Playground at http://localhost:3000 |
| `npm run next:build` | Production build |
| `npm run next:lint` | ESLint |
| `npm run hardhat:compile` | Compile placeholder |
| `npm run hardhat:test` | Placeholder tests |
| `npm run lint` | Frontend lint + hardhat tests |

## Testnet proof

After you create a topic or send a message, copy the HashScan link (testnet) and keep it for the bounty form.

Example: `https://hashscan.io/testnet/topic/0.0.xxxxx`

## Troubleshooting

- **Connect does nothing / wrong network.** HashPack must be on the same network as `NEXT_PUBLIC_HEDERA_NETWORK` (testnet by default).
- **`Connect a wallet first — signer is empty.`** Writes need HashPack. Reads do not.
- **Topic not found right after create.** Mirror lag. Wait a few seconds, then Get messages / Get topic info.
- **Update topic fails.** You need the admin private key from step 1. Create the topic with that key, then reuse it.
- **No WalletConnect modal.** Put a project id in `packages/nextjs/.env.local`. Restart `next:dev`.
- **Private key leaked.** That key *is* topic ownership. Generate a new pair and create a new topic.

## License

MIT
