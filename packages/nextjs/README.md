# nextjs — steal files live here

Product files:

- `lib/hedera.js` — HCS helpers
- `lib/wallet.js` — HashPack / WalletConnect

The playground (`components/Playground.jsx`) is a catalog. Do not copy it into a production app.

```js
import { initWallet, connectWallet } from './lib/wallet.js';
import { create_topic, send_message, get_messages } from './lib/hedera.js';

await initWallet();
await connectWallet();
const topicId = await create_topic({
  memo: 'room',
  adminkey: privateKey,       // or [key1, key2] + adminThreshold
  submitkey: submitPrivateKey, // omit = anyone can send
});
await send_message(topicId, JSON.stringify({ text: 'hello' }), submitPrivateKey);
const { messages } = await get_messages(topicId);
```

Env: copy `../../.env.example` to `.env.local`. See the root README.
