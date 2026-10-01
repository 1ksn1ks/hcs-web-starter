'use client';

/**
 * Demo UI only. Steal lib/hedera.js and lib/wallet.js, not this file.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  connectWallet,
  disconnectWallet,
  initWallet,
  onWalletChange,
  connectedAccount as walletAccount,
  MIRROR_BASE,
} from '../lib/wallet.js';
import {
  generate_private_and_public_key,
  create_topic,
  update_topic,
  delete_topic,
  send_message,
  get_messages,
  subscribe_to_topic,
  get_topic_info,
  get_account_nfts,
} from '../lib/hedera.js';

function hbarToTinybars(text) {
  const raw = String(text || '').trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) return '';
  const [whole, frac = ''] = raw.split('.');
  const padded = (frac + '00000000').slice(0, 8);
  return String(BigInt(whole) * 100000000n + BigInt(padded));
}

function tinybarsToHbar(text) {
  if (!/^\d+$/.test(String(text || ''))) return '';
  const n = BigInt(text);
  const whole = n / 100000000n;
  const frac = n % 100000000n;
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(8, '0').replace(/0+$/, '')}`;
}
function fitField(el) {
  if (!el || el.getClientRects().length === 0) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function ClearX({ onClick }) {
  return (
    <button className="btn tiny key-x field-clear" type="button" aria-label="Clear field" onClick={onClick}>x</button>
  );
}

function Field({ label, onClear, children }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="field-control">
        {children}
        <ClearX onClick={onClear} />
      </div>
    </div>
  );
}

const HELP = {
  keys: {
    title: 'Generate private and public key',
    wallet: 'Wallet: no. This never talks to Hedera. HashPack stays closed.',
    body: 'Think of a lock and a key.\n\nThe public key is the lock. You can show it.\nThe private key is the real key. Anyone who has it can act as the topic owner — rename the room, add a send-fee, or lock you out.\n\nYou make this pair first so Create topic can set you as admin. The playground copies the private key into the admin field for you.\n\nWant two owners? Press Generate again, copy the new private key onto a second line in Admin keys. That becomes a KeyList (threshold = how many must sign).\n\nWant only some people to Send? Generate another pair and paste it as Submit key. Empty submit key = anyone can post.\n\nThis is not your HashPack account key. It is a separate ED25519 pair.',
    example: 'Press Generate. Two long strings appear. Admin field is filled. Optional: Generate again and paste the new private key as a second admin line, or into Submit key. Next: Connect Wallet, then Create topic. Never commit these keys.',
    call: 'const { privateKey, publicKey } = await generate_private_and_public_key();',
  },
  create: {
    title: 'Create topic',
    wallet: 'Wallet: yes. HashPack pays a tiny testnet HBAR fee and must pop to sign.',
    body: 'A topic is a public mailbox on Hedera Consensus Service. Anyone can read the notes. Who can write, and who can change the box, depends on keys.\n\nMemo is just a short name.\n\nAdmin keys (optional, one private key per line): owners. They can later Update topic (rename, fees, keys). Several lines = KeyList. Admin threshold = how many of those keys must sign an update (empty = all of them). Admin is also the fee-schedule key so you can add HIP-991 later.\n\nSubmit keys (optional, one per line): who is allowed to Send a message. Empty = anyone with a wallet can post. If you set this, Send must also sign with that private key or Hedera rejects it. Submit threshold works the same as admin (e.g. 1 of 3).\n\nWhen it succeeds Hedera gives 0.0.xxxxx. This app pastes it into the other steps. HashScan testnet → that id is the bounty proof.\n\nThen: Send (include the submit key if you set one), Subscribe, or Get topic info to see admin_key + submit_key on the mirror.',
    example: 'Connect HashPack. Memo = my-first-room. Paste one or more admin private keys (one per line). Optional: paste a submit private key so only that key can post. Threshold 1 = any one of the listed keys is enough. Press Create, approve HashPack. Next: Send — if you set a submit key, paste it there too.',
    call: 'const topicId = await create_topic({\n  memo: "room",\n  adminkey: [admin1, admin2],\n  adminThreshold: 1,\n  submitkey: submitPrivateKey,\n});',
  },
  update: {
    title: 'Update topic',
    wallet: 'Wallet: yes, plus the same owner private key you used on Create topic.',
    body: 'This changes a mailbox you already own. You cannot update a topic if you created it without an admin key, or if you lost that key. Several admin keys: paste them all (one per line) and meet the threshold.\n\nMemo changes the name.\nYou can also set / change submit keys here (who may Send).\nFee amount + collector turns on HIP-991: senders pay a small fee so spam costs money.\nAmount is tinybars when token id is empty. 100000000 tinybars = 1 HBAR.\n\nAfter update: press 7. Get topic info. Check admin_key, submit_key, custom_fees.',
    example: 'Paste your topic id. Memo = paid-room. Admin key = step 1 private key. Fee amount 10000000, collector = your account (top bar). Leave token id empty. Press Update, approve HashPack, then Get topic info.',
    call: 'await update_topic({ topicId, memo, adminKey, submitkey, customFees });',
  },
  send: {
    title: 'Send message',
    wallet: 'Wallet: yes. HashPack signs this one note. Reads do not.',
    body: 'This puts one note in the mailbox you created.\n\nTopic id must be the 0.0.xxxxx from Create topic.\nHashPack pays and signs as the payer. If you set a submit key on Create, you must also paste that private submit key here — HashPack alone is not enough and the send will fail.\nSeveral submit keys: one per line, same threshold you used on create.\n\nThe playground wraps your text as JSON: { type, text, from, at }.\nAnyone can read it. This helper does not encrypt.\n\nSend does not put the note on the right. Press 5. Get messages after a few seconds. Subscribe is the only way new notes appear by themselves.',
    example: 'Need a topic id from step 2. If the topic has a submit key, paste it. Type hello hedera. Press Send and approve HashPack. The right panel stays unchanged. Then press 5. Get messages.',
    call: 'await send_message(topicId, JSON.stringify({ text: "hello" }), submitPrivateKey);',
  },
  read: {
    title: 'Get messages',
    wallet: 'Wallet: no. Mirror read only. No HashPack popup, no HBAR.',
    body: 'Hedera keeps a public history book called the mirror.\n\nGet messages asks that book for every note already in the topic. It is a snapshot, not a live watch. New notes after you press the button will not appear until you press it again (or use Subscribe).\n\nUse this after Send if you were not subscribed. Use it to catch up when you open the app later.\nThe list logs on the right in the same panel as Send / Subscribe / Topic info / NFTs.\nIf you just created the topic, wait a few seconds — the mirror can lag. Empty list usually means lag or a wrong topic id.',
    example: 'Paste 0.0.xxxxx. Press Get messages. Old notes show on the right. No wallet. Next: 6. Subscribe if you want new Send notes to appear by themselves.',
    call: 'const { messages, error } = await get_messages("0.0.xxxxx");',
  },
  sub: {
    title: 'Subscribe to topic',
    wallet: 'Wallet: no. Reads, then polls. Stop unsubscribes.',
    body: 'This does Get messages first (loads history), then peeks the mirror every 3 seconds for new notes.\n\nThe messages panel stays open even if you switch to Send, Create, or anything else. New notes append on the right. Topic info and NFTs also log into that same list.\n\nPress Stop when you leave, or the poll keeps running.\nThis is how a chat app feels: Subscribe once, then keep using 4. Send. You do not press Get messages after every send.\nMirror lag of a few seconds is normal on testnet.',
    example: 'Paste topic id. Press Subscribe (pill turns subscribed). Open 4. Send, type a note, approve HashPack. After a few seconds it should appear on the right without Get messages. Press Stop when you are done.',
    call: 'const sub = await subscribe_to_topic(topicId, onMsg, onErr);\nsub.close();',
  },
  info: {
    title: 'Get topic info',
    wallet: 'Wallet: no. Mirror read only.',
    body: 'This looks up the mailbox card, not the notes inside it.\n\nYou get memo (name), admin_key, submit_key, fee-schedule keys, and HIP-991 custom fees.\nUse it after Create to confirm several admin keys or a submit key stuck. Use it after Update to confirm a fee or new memo landed.\nThe JSON is logged as a bubble in the same messages panel — it does not wipe the chat.\nIf admin_key is null, you cannot Update. If submit_key is set, Send needs that private key.',
    example: 'Paste your topic id. Press Get topic info. A Topic info bubble appears on the right under the chat. Check memo and custom_fees. Then Send or Subscribe as usual.',
    call: 'const info = await get_topic_info("0.0.xxxxx");',
  },
  nfts: {
    title: 'Get account NFTs',
    wallet: 'Wallet: no. Mirror read only. Connect is optional (fills the account for you).',
    body: 'NFTs on Hedera are HTS collectibles (art, tickets, badges).\n\nThis lists the NFTs an account owns. Leave account empty to use the connected HashPack id. Or paste a friend’s 0.0.xxxxx.\nToken id filter is optional: set it if you only want one collection, leave it empty for every NFT on that account.\nThe result is logged as a bubble in the same messages panel, next to chat and topic info. It does not send anything and does not need a topic id.\nThis is a bonus helper so you can steal get_account_nfts the same way as the HCS functions.',
    example: 'Connect wallet, leave account empty, press Get NFTs. A bubble with count + list appears on the right. Optional: paste another account or a token id to filter. Chat on the topic is unchanged.',
    call: 'const nfts = await get_account_nfts(accountId, tokenId);',
  },
  del: {
    title: 'Delete topic',
    wallet: 'Wallet: yes, plus the admin private key. HashPack must pop to sign.',
    body: 'This closes the mailbox. You cannot Send or Update it after this.\n\nIt only works if the topic has an admin key. No admin key means the topic stays forever.\nPaste enough admin private keys to meet the threshold from Create. One key is enough when you only set one admin, or when the threshold is 1.\n\nNotes already written stay on the mirror. Get messages can still read them. New notes will fail.\nHashPack paying the fee is not enough. The admin key has to sign too.',
    example: 'Paste the topic id. Paste the same admin private key from step 1. Press Delete topic and approve HashPack. Then Get topic info — the topic is gone.',
    call: 'await delete_topic(topicId, adminPrivateKey);',
  },
};

const LIVE_TITLES = { send: 'Messages', read: 'Messages', sub: 'Messages', info: 'Messages', nfts: 'Messages', del: 'Messages' };

function messageBody(msg) {
  if (msg == null) return '';
  if (typeof msg.text === 'string' && msg.text) return msg.text;
  if (typeof msg.message === 'string' && msg.message) return msg.message;
  const copy = { ...msg };
  delete copy.payer;
  delete copy.created;
  delete copy.consensus_timestamp;
  delete copy.sequence_number;
  try {
    return JSON.stringify(copy, null, 2);
  } catch {
    return String(msg);
  }
}

function dedupeMessages(list) {
  const seen = new Set();
  const out = [];
  for (const row of list) {
    if (!row || row.kind === 'log' || row.sequence_number == null || row.sequence_number === '') {
      out.push(row);
      continue;
    }
    const id = String(row.sequence_number);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

export default function Playground() {
  const [account, setAccount] = useState(walletAccount);
  const [openFn, setOpenFn] = useState('keys');
  const [helpKey, setHelpKey] = useState(null);
  const [canAnimate, setCanAnimate] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [privateKey, setPrivateKey] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [memo, setMemo] = useState('getting-started-room');
  const [adminKeys, setAdminKeys] = useState(['']);
  const [submitKeys, setSubmitKeys] = useState(['']);
  const [adminThreshold, setAdminThreshold] = useState('');
  const [submitThreshold, setSubmitThreshold] = useState('');
  const [showSendKey, setShowSendKey] = useState(false);
  const [createdTopic, setCreatedTopic] = useState('');
  const [topicId, setTopicId] = useState('');
  const [updateMemo, setUpdateMemo] = useState('');
  const [feeAmount, setFeeAmount] = useState('');
  const [feeCollector, setFeeCollector] = useState('');
  const [feeToken, setFeeToken] = useState('');
  const [showFeeCalc, setShowFeeCalc] = useState(false);
  const [hbarFee, setHbarFee] = useState('0.1');
  const [message, setMessage] = useState('');
  const [nftAccount, setNftAccount] = useState('');
  const [nftToken, setNftToken] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [liveTitle, setLiveTitle] = useState('Messages');
  const [panelItems, setPanelItems] = useState(null);
  const [messageList, setMessageList] = useState([]);
  const [subscribed, setSubscribed] = useState(false);
  const [toasts, setToasts] = useState([]);
  const toastTimers = useRef([]);
  const lastToast = useRef({ key: '', at: 0 });

  const pushToast = (title, detail = '', kind = 'ok') => {
    if (!title) return;
    if (detail === 'err' || detail === 'ok') {
      kind = detail;
      detail = '';
    }
    const key = `${kind}|${title}|${detail}`;
    const now = Date.now();
    if (lastToast.current.key === key && now - lastToast.current.at < 700) return;
    lastToast.current = { key, at: now };
    const id = `${now}-${Math.random().toString(16).slice(2)}`;
    setToasts((cur) => {
      if (cur.some((row) => row.title === title && row.detail === detail)) return cur;
      return [...cur.slice(-2), { id, title, detail, kind }];
    });
    const timer = setTimeout(() => {
      setToasts((cur) => cur.filter((row) => row.id !== id));
    }, 3400);
    toastTimers.current.push(timer);
  };

  useEffect(() => {
    initWallet();
    return onWalletChange(({ account: next }) => setAccount(next));
  }, []);

  useLayoutEffect(() => {
    document.querySelectorAll('textarea.key-field').forEach((el) => fitField(el));
  }, [privateKey, publicKey, adminKeys, submitKeys, openFn]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setCanAnimate(true));
    return () => {
      cancelAnimationFrame(id);
      toastTimers.current.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    if (subscribed || openFn === 'send' || openFn === 'read' || openFn === 'sub') {
      setLiveTitle('Messages');
    } else {
      setLiveTitle(LIVE_TITLES[openFn] || 'Output');
    }
  }, [openFn, subscribed]);

  const showLive = subscribed || openFn === 'send' || Boolean(LIVE_TITLES[openFn]);

  const toggle = (fn) => {
    const next = openFn === fn ? null : fn;
    setOpenFn(next);
    setHelpKey(null);
    if (next) {
      const item = HELP[next];
      pushToast(`Opened · ${item?.title || next}`, item?.wallet || 'Fill the fields, then press the green button.');
    } else {
      pushToast('Closed', 'Open another function to run it. Messages stay if you are subscribed.');
    }
  };
  const toggleHelp = (key, e) => {
    e.stopPropagation();
    const next = helpKey === key ? null : key;
    setHelpKey(next);
    setOpenFn(key);
    if (next) {
      const item = HELP[next];
      pushToast(`Help · ${item?.title || next}`, item?.example || 'Kid-simple explanation for this function.');
    }
  };

  const applyTopic = (id) => {
    if (id) setTopicId(id);
  };

  const appendLog = (title, data) => {
    setMessageList((list) => [
      ...list,
      { kind: 'log', title, data, created: Date.now() },
    ]);
  };

  const onConnect = async () => {
    setConnecting(true);
    setError('');
    try {
      const acc = await connectWallet();
      pushToast(
        acc ? 'HashPack connected' : 'Wallet connected',
        acc ? `${acc} on Hedera testnet. Writes will pop HashPack to sign.` : 'HashPack is ready. Writes will ask you to sign.'
      );
    } catch (err) {
      setError(err.message || String(err));
      pushToast('Connect failed', err.message || String(err), 'err');
    } finally {
      setConnecting(false);
    }
  };

  const onGenerate = async () => {
    setBusy('keys');
    setError('');
    try {
      const keys = await generate_private_and_public_key();
      setPrivateKey(keys.privateKey);
      setPublicKey(keys.publicKey);
      setAdminKeys((cur) => (cur.some((row) => row.trim()) ? cur : [keys.privateKey]));
      pushToast('Key pair ready', 'Private key is admin key 1. Press Add admin key for another owner.');
    } catch (err) {
      setError(err.message || String(err));
      pushToast('Generate failed', err.message || String(err), 'err');
    } finally {
      setBusy('');
    }
  };

  const onCreate = async () => {
    setBusy('create');
    setError('');
    try {
      const id = await create_topic({
        memo,
        adminkey: adminKeys.map((row) => row.trim()).filter(Boolean),
        adminThreshold: adminThreshold ? Number(adminThreshold) : undefined,
        submitkey: submitKeys.map((row) => row.trim()).filter(Boolean),
        submitThreshold: submitThreshold ? Number(submitThreshold) : undefined,
      });
      setCreatedTopic(id);
      applyTopic(id);
      pushToast('Topic created', `${id} is pasted into the other steps. Open HashScan testnet for that id — that is the bounty proof.`);
    } catch (err) {
      setError(err.message || String(err));
      pushToast('Create topic failed', err.message || String(err), 'err');
    } finally {
      setBusy('');
    }
  };

  const onUpdate = async () => {
    setBusy('update');
    setError('');
    try {
      const customFees =
        feeAmount && feeCollector
          ? [{
              amount: Number(feeAmount),
              collectorAccountId: feeCollector,
              denominatingTokenId: feeToken || undefined,
            }]
          : undefined;
      await update_topic({
        topicId,
        memo: updateMemo,
        adminKey: adminKeys.map((row) => row.trim()).filter(Boolean),
        adminThreshold: adminThreshold ? Number(adminThreshold) : undefined,
        submitkey: submitKeys.map((row) => row.trim()).filter(Boolean),
        submitThreshold: submitThreshold ? Number(submitThreshold) : undefined,
        customFees,
      });
      pushToast('Topic updated', 'Memo, keys, and HIP-991 fees were signed. Use Get topic info to confirm they landed.');
    } catch (err) {
      setError(err.message || String(err));
      pushToast('Update topic failed', err.message || String(err), 'err');
    } finally {
      setBusy('');
    }
  };

  const onSend = async (e) => {
    e?.preventDefault();
    if (!topicId || !message.trim()) {
      setError('topic id and message required');
      pushToast('Nothing to send', 'Paste a topic id (0.0.xxxxx) and type a note first.', 'err');
      return;
    }
    setBusy('send');
    setError('');
    const text = message.trim();
    try {
      await send_message(
        topicId,
        JSON.stringify({ type: 'chat', text, from: account, at: Date.now() }),
        submitKeys.map((row) => row.trim()).filter(Boolean)
      );
      setMessage('');
      pushToast('Message sent', 'HashPack signed the note. It is not shown yet. Press Get messages to load it.');
    } catch (err) {
      setError(err.message || String(err));
      pushToast('Send failed', err.message || String(err), 'err');
    } finally {
      setBusy('');
    }
  };

  const onGetMessages = async () => {
    if (!topicId) {
      setError('paste a topic id first');
      pushToast('Need a topic id', 'Paste 0.0.xxxxx from Create topic, then try again.', 'err');
      return;
    }
    setBusy('read');
    setError('');
    try {
      const result = await get_messages(topicId);
      setMessageList((list) => dedupeMessages([
        ...(result.messages || []),
        ...list.filter((row) => row.kind === 'log'),
      ]));
      setPanelItems({ kind: 'messages', list: result.messages });
      pushToast(
        'Messages loaded',
        `${result.messages?.length || 0} note${(result.messages?.length || 0) === 1 ? '' : 's'} from the mirror. This is history, not a live watch.`
      );
      if (result.error) setError(result.error);
    } catch (err) {
      setError(err.message || String(err));
      pushToast('Get messages failed', err.message || String(err), 'err');
    } finally {
      setBusy('');
    }
  };

  const onSubscribe = async () => {
    if (!topicId) {
      setError('topic id required');
      pushToast('Need a topic id', 'Paste 0.0.xxxxx so Subscribe knows which mailbox to watch.', 'err');
      return;
    }
    setBusy('sub');
    setError('');
    try {
      if (window.__hcsSub) window.__hcsSub.close();
      const sub = await subscribe_to_topic(
        topicId,
        (msg) => {
          setMessageList((list) => {
            if (list.some((row) => String(row.sequence_number) === String(msg.sequence_number))) return list;
            const rest = list.filter((row) => row.sequence_number || row.kind === 'log' || row.text !== msg.text);
            return dedupeMessages([...rest, msg]);
          });
        },
        (err) => setError(err.message || String(err))
      );
      window.__hcsSub = sub;
      setMessageList((list) => {
        const logs = list.filter((row) => row.kind === 'log');
        const history = sub.messages || [];
        const seen = new Set(history.map((m) => String(m.sequence_number)));
        const newer = list.filter((row) => row.sequence_number != null && !seen.has(String(row.sequence_number)));
        return dedupeMessages([...history, ...newer, ...logs]);
      });
      setPanelItems({ kind: 'messages', list: sub.messages });
      setSubscribed(true);
      pushToast('Subscribed', 'Live panel stays open. New notes appear on the right every few seconds. Press Stop when you leave.');
    } catch (err) {
      setError(err.message || String(err));
      pushToast('Subscribe failed', err.message || String(err), 'err');
    } finally {
      setBusy('');
    }
  };

  const onStop = () => {
    if (window.__hcsSub) window.__hcsSub.close();
    window.__hcsSub = null;
    setSubscribed(false);
    pushToast('Unsubscribed', 'Stopped polling. Old notes stay until you load them again.');
  };

  const onInfo = async () => {
    setBusy('info');
    setError('');
    try {
      if (!topicId) throw new Error('topic id required');
      const info = await get_topic_info(topicId);
      appendLog(`Topic info · ${topicId}`, info);
      setPanelItems({ kind: 'json', title: 'Topic info', data: info });
      pushToast('Topic info loaded', 'Logged in the messages panel, same as a chat note.');
    } catch (err) {
      setError(err.message || String(err));
      pushToast('Topic info failed', err.message || String(err), 'err');
      appendLog('Topic info error', err.message || String(err));
    } finally {
      setBusy('');
    }
  };

  const onNfts = async () => {
    const acc = nftAccount || account;
    if (!acc) {
      setError('account id required');
      pushToast('Need an account', 'Connect HashPack or paste 0.0.xxxxx, then Get NFTs.', 'err');
      return;
    }
    setBusy('nfts');
    setError('');
    try {
      const nfts = await get_account_nfts(acc, nftToken || undefined);
      const payload = { account: acc, count: nfts.length, nfts };
      appendLog(`NFTs · ${acc}`, payload);
      setPanelItems({ kind: 'json', title: 'NFTs', data: payload });
      pushToast(
        'NFTs loaded',
        `${nfts.length} item${nfts.length === 1 ? '' : 's'} logged in the messages panel.`
      );
    } catch (err) {
      setError(err.message || String(err));
      pushToast('Get NFTs failed', err.message || String(err), 'err');
    } finally {
      setBusy('');
    }
  };

  const onDelete = async () => {
    const keys = adminKeys.map((row) => row.trim()).filter(Boolean);
    if (!topicId || !keys.length) {
      setError('topic id and admin key required');
      pushToast('Cannot delete', 'Paste a topic id and the admin private key. No admin key means it cannot be deleted.', 'err');
      return;
    }
    setBusy('del');
    setError('');
    try {
      const id = await delete_topic(topicId, keys);
      if (window.__hcsSub) window.__hcsSub.close();
      window.__hcsSub = null;
      setSubscribed(false);
      appendLog(`Topic deleted · ${id}`, { topicId: id, deleted: true });
      pushToast('Topic deleted', `${id} is closed. Old notes stay on the mirror. Send and Update will fail.`);
    } catch (err) {
      setError(err.message || String(err));
      pushToast('Delete topic failed', err.message || String(err), 'err');
    } finally {
      setBusy('');
    }
  };

  const copyKey = async () => {
    if (!privateKey) return;
    await navigator.clipboard.writeText(privateKey);
    pushToast('Private key copied', 'Paste it as an admin line or as a submit key. Never commit it.');
  };
  const placeKey = (cur) => {
    if (!privateKey || cur.includes(privateKey)) return cur;
    const empty = cur.findIndex((row) => !row.trim());
    if (empty >= 0) return cur.map((row, i) => (i === empty ? privateKey : row));
    return [...cur, privateKey];
  };
  const addToAdmin = () => {
    if (!privateKey) return;
    setAdminKeys(placeKey);
    pushToast('Added admin key', 'Another owner field. Threshold is how many of those keys must sign.');
  };
  const addToSubmit = () => {
    if (!privateKey) return;
    setSubmitKeys(placeKey);
    pushToast('Added submit key', 'Another submit field. Empty means anyone can send.');
  };
  const setKeyAt = (setter, index, value) => {
    setter((cur) => cur.map((row, i) => (i === index ? value : row)));
  };
  const addKeyField = (setter, label) => {
    setter((cur) => [...cur, '']);
    pushToast('Field added', `Another ${label} is open. Press again for as many as you need.`);
  };
  const removeKeyField = (setter, index, keys, threshold, setThreshold) => {
    if (keys.length <= 1) return;
    const nextLen = keys.length - 1;
    setter((cur) => (cur.length <= 1 ? cur : cur.filter((_, i) => i !== index)));
    if (setThreshold && (nextLen < 2 || Number(threshold) > nextLen)) setThreshold('');
  };
  const keyFields = (label, keys, setter, threshold, setThreshold, { allowAdd = true } = {}) => (
    <div className="key-box">
      {keys.map((value, index) => (
        <div className="field" key={`${label}-${index}`}>
          <span className="field-head">
            <span>{label} {index + 1}{index === 0 ? ' (private)' : ''}</span>
            {index > 0 ? (
              <button className="btn tiny key-x" type="button" aria-label="Remove key" onClick={() => removeKeyField(setter, index, keys, threshold, setThreshold)}>x</button>
            ) : null}
          </span>
          <div className="field-control">
            <textarea
              ref={fitField}
              className="key-field"
              rows={1}
              value={value}
              placeholder={allowAdd && label === 'submit key' && index === 0 ? 'empty = anyone can send' : ''}
              onChange={(e) => {
                setKeyAt(setter, index, e.target.value);
                fitField(e.target);
              }}
            />
            <ClearX onClick={() => setKeyAt(setter, index, '')} />
          </div>
        </div>
      ))}
      {setThreshold && keys.length > 1 ? (
        <div className="field">
          <span>how many of those keys must sign</span>
          <div className="threshold-picks">
            {keys.map((_, index) => {
              const n = index + 1;
              const on = String(threshold) === String(n);
              return (
                <button
                  key={`${label}-pick-${n}`}
                  className={`pick${on ? ' on' : ''}`}
                  type="button"
                  onClick={() => setThreshold(on ? '' : String(n))}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {allowAdd ? (
        <button className="btn ghost" type="button" onClick={() => addKeyField(setter, label)}>Add {label}</button>
      ) : null}
    </div>
  );

  const onDisconnect = async () => {
    await disconnectWallet();
    pushToast('Wallet disconnected', 'Reads still work. Connect again before Create, Update, or Send.');
  };

  const card = (fn, title, body, helpId) => {
    const h = HELP[helpId];
    return (
      <article
        className={`fn-item${openFn === fn ? ' open' : ''}${helpKey === helpId ? ' help-open' : ''}${canAnimate ? ' anim' : ''}`}
        data-fn={fn}
      >
        <div className="fn-head">
          <button className="fn-toggle" type="button" onClick={() => toggle(fn)}>{title}</button>
          <button className="fn-help" type="button" onClick={(e) => toggleHelp(helpId, e)} aria-label="What this does">?</button>
        </div>
        <div className="help-slot" aria-hidden={helpKey !== helpId}>
          <div className="help-slot-inner">
            <aside className="help-drawer">
              <div className="help-head">
                <h2>{h.title}</h2>
                <button className="btn ghost" type="button" onClick={() => setHelpKey(null)}>Close</button>
              </div>
              <p className="help-meta">{h.wallet}</p>
              <p className="hint" style={{ whiteSpace: 'pre-wrap' }}>{h.body}</p>
              <p className="help-example">{h.example}</p>
              <span className="field"><span>Call (hedera.js)</span></span>
              <p className="hint">This is the matching function in lib/hedera.js. Copy that file into your own app, not this page.</p>
              <pre className="keys">{h.call}</pre>
            </aside>
          </div>
        </div>
        <section className="card fn fn-body">
          <div className="fn-body-inner">{body}</div>
        </section>
      </article>
    );
  };

  const panel = useMemo(() => {
    if (!messageList.length) return <div className="empty-hint">No messages on this topic yet.</div>;
    return messageList.map((msg, i) => {
      if (msg.kind === 'log') {
        return (
          <article className="bubble log" key={`log-${msg.created}-${i}`}>
            <div className="bubble-meta">{msg.title} · {msg.created ? new Date(msg.created).toLocaleString() : ''}</div>
            <pre className="bubble-body">{typeof msg.data === 'string' ? msg.data : JSON.stringify(msg.data, null, 2)}</pre>
          </article>
        );
      }
      return (
        <article className="bubble" key={`seq-${msg.sequence_number ?? 'local'}-${i}`}>
          <div className="bubble-meta">{String(msg.from || msg.payer || '')} · #{msg.sequence_number ?? ''} · {msg.created ? new Date(msg.created).toLocaleString() : ''}</div>
          <pre className="bubble-body">{messageBody(msg)}</pre>
        </article>
      );
    });
  }, [messageList]);

  return (
    <div className="app">
      <main className="main">
        <header className="topbar">
          <div className="brand">
            <div className="logo">H</div>
            <div>
              <h1>HCS web starter</h1>
              <p className="muted">Open a row to run it. The ? on that row explains what it does.</p>
            </div>
          </div>
          <div className="top-actions">
            <div className="mono">{MIRROR_BASE.replace('https://', '')}</div>
            <div className="account">{account || 'Not connected'}</div>
            {subscribed ? <div className="status-pill online">subscribed</div> : null}
            {!account ? (
              <button className="btn primary" type="button" onClick={onConnect} disabled={connecting}>
                {connecting ? 'Connecting…' : 'Connect Wallet'}
              </button>
            ) : (
              <button className="btn ghost" type="button" onClick={onDisconnect}>Disconnect</button>
            )}
          </div>
        </header>

        {error ? <p className="hint" style={{ padding: '0 28px', color: '#fb7185' }}>{error}</p> : null}

        <div className={`workspace ${showLive ? 'show-live' : ''}`}>
          <div className="stack">
            {card('keys', '1. Generate private and public key', (
              <>
                <div className="row">
                  <button className="btn primary" type="button" onClick={onGenerate} disabled={busy === 'keys'}>Generate</button>
                  <button className="btn ghost" type="button" onClick={copyKey}>Copy private key</button>
                  <button className="btn ghost" type="button" onClick={addToAdmin}>Add to admin keys</button>
                  <button className="btn ghost" type="button" onClick={addToSubmit}>Add to submit keys</button>
                </div>
                <Field label="private key" onClear={() => setPrivateKey('')}>
                  <textarea ref={fitField} className="key-field" rows={1} readOnly value={privateKey} />
                </Field>
                <Field label="public key" onClear={() => setPublicKey('')}>
                  <textarea ref={fitField} className="key-field" rows={1} readOnly value={publicKey} />
                </Field>
              </>
            ), 'keys')}

            {card('create', '2. Create topic', (
              <>
                <Field label="memo" onClear={() => setMemo('')}>
                  <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="getting-started-room" />
                </Field>
                {keyFields('admin key', adminKeys, setAdminKeys, adminThreshold, setAdminThreshold)}
                {keyFields('submit key', submitKeys, setSubmitKeys, submitThreshold, setSubmitThreshold)}
                <button className="btn primary" type="button" onClick={onCreate} disabled={busy === 'create'}>Create topic</button>
                <p className="mono">{createdTopic}</p>
              </>
            ), 'create')}

            {card('update', '3. Update topic', (
              <>
                <Field label="topic id" onClear={() => setTopicId('')}>
                  <input value={topicId} onChange={(e) => setTopicId(e.target.value)} placeholder="0.0.xxxxx" />
                </Field>
                <Field label="memo" onClear={() => setUpdateMemo('')}>
                  <input value={updateMemo} onChange={(e) => setUpdateMemo(e.target.value)} />
                </Field>
                {keyFields('admin key', adminKeys, setAdminKeys, adminThreshold, setAdminThreshold)}
                {keyFields('submit key', submitKeys, setSubmitKeys, submitThreshold, setSubmitThreshold)}
                <Field label="fee amount" onClear={() => setFeeAmount('')}>
                  <input value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} placeholder="tinybars" />
                </Field>
                {showFeeCalc ? (
                  <div className="key-box">
                    <div className="field">
                      <span className="field-head">
                        <span>HBAR to tinybars</span>
                        <button className="btn tiny key-x" type="button" aria-label="Close calculator" onClick={() => setShowFeeCalc(false)}>x</button>
                      </span>
                      <div className="field-control">
                        <input value={hbarFee} onChange={(e) => setHbarFee(e.target.value)} placeholder="0.1" inputMode="decimal" />
                        <button className="btn tiny key-x field-clear" type="button" aria-label="Clear HBAR" onClick={() => setHbarFee('')}>x</button>
                      </div>
                      <p className="mono">{hbarToTinybars(hbarFee) ? `${hbarToTinybars(hbarFee)} tinybars` : 'Enter an HBAR amount, like 0.1'}</p>
                      <button
                        className="btn ghost"
                        type="button"
                        disabled={!hbarToTinybars(hbarFee)}
                        onClick={() => {
                          const tiny = hbarToTinybars(hbarFee);
                          setFeeAmount(tiny);
                          setShowFeeCalc(false);
                          pushToast('Fee set', `${hbarFee} HBAR = ${tiny} tinybars. Token id stays empty for HBAR.`);
                        }}
                      >
                        Use this amount
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="btn ghost send-key-toggle"
                    type="button"
                    onClick={() => {
                      if (!hbarFee && feeAmount) setHbarFee(tinybarsToHbar(feeAmount));
                      setShowFeeCalc(true);
                    }}
                  >
                    Fee calculator
                  </button>
                )}
                <Field label="fee collector account" onClear={() => setFeeCollector('')}>
                  <input value={feeCollector} onChange={(e) => setFeeCollector(e.target.value)} />
                </Field>
                <Field label="token id (optional HTS)" onClear={() => setFeeToken('')}>
                  <input value={feeToken} onChange={(e) => setFeeToken(e.target.value)} placeholder="leave empty for HBAR" />
                </Field>
                <button className="btn primary" type="button" onClick={onUpdate} disabled={busy === 'update'}>Update topic</button>
              </>
            ), 'update')}

            {card('send', '4. Send message', (
              <>
                <Field label="topic id" onClear={() => setTopicId('')}>
                  <input value={topicId} onChange={(e) => setTopicId(e.target.value)} placeholder="0.0.xxxxx" />
                </Field>
                {showSendKey ? (
                  <div className="key-box">
                    <div className="field">
                      <span className="field-head">
                        <span>submit key</span>
                        <button className="btn tiny key-x" type="button" aria-label="Hide submit key" onClick={() => setShowSendKey(false)}>x</button>
                      </span>
                      <div className="field-control">
                        <textarea
                          ref={fitField}
                          className="key-field"
                          rows={1}
                          value={submitKeys[0] || ''}
                          onChange={(e) => {
                            setKeyAt(setSubmitKeys, 0, e.target.value);
                            fitField(e.target);
                          }}
                        />
                        <ClearX onClick={() => setKeyAt(setSubmitKeys, 0, '')} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <button className="btn ghost send-key-toggle" type="button" onClick={() => setShowSendKey(true)}>Submit key</button>
                )}
                <form className="compose-inline" onSubmit={onSend}>
                  <div className="field-control">
                    <textarea name="message" rows={1} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="hello hedera" />
                    <ClearX onClick={() => setMessage('')} />
                  </div>
                  <button className="btn primary" type="submit" disabled={busy === 'send'}>Send</button>
                </form>
              </>
            ), 'send')}

            {card('read', '5. Get messages', (
              <>
                <Field label="topic id" onClear={() => setTopicId('')}>
                  <input value={topicId} onChange={(e) => setTopicId(e.target.value)} placeholder="0.0.xxxxx" />
                </Field>
                <button className="btn primary" type="button" onClick={onGetMessages} disabled={busy === 'read'}>Get messages</button>
              </>
            ), 'read')}

            {card('sub', '6. Subscribe to topic', (
              <>
                <Field label="topic id" onClear={() => setTopicId('')}>
                  <input value={topicId} onChange={(e) => setTopicId(e.target.value)} placeholder="0.0.xxxxx" />
                </Field>
                <div className="row">
                  <button className="btn primary" type="button" onClick={onSubscribe} disabled={busy === 'sub'}>Subscribe</button>
                  <button className="btn ghost" type="button" onClick={onStop}>Stop</button>
                </div>
              </>
            ), 'sub')}

            {card('info', '7. Get topic info', (
              <>
                <Field label="topic id" onClear={() => setTopicId('')}>
                  <input value={topicId} onChange={(e) => setTopicId(e.target.value)} placeholder="0.0.xxxxx" />
                </Field>
                <button className="btn primary" type="button" onClick={onInfo} disabled={busy === 'info'}>Get topic info</button>
              </>
            ), 'info')}

            {card('nfts', '8. Get account NFTs', (
              <>
                <Field label="account id" onClear={() => setNftAccount('')}>
                  <input value={nftAccount} onChange={(e) => setNftAccount(e.target.value)} placeholder="0.0.xxxxx" />
                </Field>
                <Field label="token id filter (optional)" onClear={() => setNftToken('')}>
                  <input value={nftToken} onChange={(e) => setNftToken(e.target.value)} />
                </Field>
                <button className="btn primary" type="button" onClick={onNfts} disabled={busy === 'nfts'}>Get NFTs</button>
              </>
            ), 'nfts')}

            {card('del', '9. Delete topic', (
              <>
                <Field label="topic id" onClear={() => setTopicId('')}>
                  <input value={topicId} onChange={(e) => setTopicId(e.target.value)} placeholder="0.0.xxxxx" />
                </Field>
                {keyFields('admin key', adminKeys, setAdminKeys)}
                <button className="btn primary" type="button" onClick={onDelete} disabled={busy === 'del'}>Delete topic</button>
              </>
            ), 'del')}
          </div>

          <div className="live" id="live-panel" hidden={!showLive}>
            <section className="panel chat-panel">
              <div className="chat-head">
                <h2>{liveTitle}</h2>
                <button
                  className="btn ghost chat-clear"
                  type="button"
                  onClick={() => {
                    setMessageList([]);
                    pushToast('Messages cleared', 'The panel is empty. Get messages or Subscribe to load them again.');
                  }}
                >
                  Clear
                </button>
              </div>
              <div className="messages">{panel}</div>
            </section>
          </div>
        </div>
      </main>
      <div className="toasts" aria-live="polite">
        {toasts.map((row) => (
          <div className={`toast ${row.kind === 'err' ? 'err' : 'ok'}`} key={row.id}>
            <span className="toast-dot" aria-hidden="true" />
            <div className="toast-copy">
              <strong>{row.title}</strong>
              {row.detail ? <p>{row.detail}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}