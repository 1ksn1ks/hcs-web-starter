/**
 * STEAL THIS FILE — copy into any Hedera web app.
 * Each export is one network action. Pair with wallet.js.
 *
 * Hedera helpers — getting-started template
 *
 * Copy this file into a new Hedera app. Each export is one real network
 * action. The playground UI calls these so you can see inputs, HashPack
 * prompts, and mirror-node results.
 *
 * Install:
 *   npm i @hashgraph/sdk @hashgraph/hedera-wallet-connect
 *
 * Pairing:
 *   Writes use `signer` from wallet.js (HashPack / WalletConnect).
 *   Reads use MIRROR_BASE from wallet.js. Keep wallet network and mirror in sync.
 *
 * Suggested first run:
 *   1. generate_private_and_public_key  (local, no wallet)
 *   2. create_topic                     (wallet)
 *   3. send_message                     (wallet)
 *   4. get_messages                     (mirror, no wallet)
 */

import {
  TopicMessageSubmitTransaction,
  TopicId,
  PrivateKey,
  TopicCreateTransaction,
  TopicUpdateTransaction,
  TopicDeleteTransaction,
  AccountId,
  CustomFixedFee,
  KeyList,
} from '@hashgraph/sdk';
import { signer, MIRROR_BASE } from './wallet.js';

/**
 * Mirror REST host is exported from wallet.js so wallet network and reads stay in sync.
 * Re-export here so apps that only import hedera.js still get MIRROR_BASE.
 */
export { MIRROR_BASE } from './wallet.js';

async function fetchWithRetry(url, retries = 3, delay = 1000) {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (err) {
      if (i === retries) throw err;
      console.warn(`Retry ${i + 1}/${retries} for ${url}: ${err.message}`);
      await new Promise((res) => setTimeout(res, delay * 2 ** i));
    }
  }
}

function requireSigner() {
  if (!signer) {
    throw new Error('Connect a wallet first — signer is empty.');
  }
  return signer;
}

function parse_private_key(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('key is empty');
  try {
    return PrivateKey.fromStringDer(raw);
  } catch {
    return PrivateKey.fromStringED25519(raw);
  }
}

function split_key_strings(value) {
  if (Array.isArray(value)) {
    return value.map((row) => String(row || '').trim()).filter(Boolean);
  }
  return String(value || '')
    .split(/[\n,]+/)
    .map((row) => row.trim())
    .filter(Boolean);
}

function parse_private_keys(value) {
  return split_key_strings(value).map(parse_private_key);
}

function public_from_privates(privates, threshold) {
  if (!privates.length) return null;
  if (privates.length === 1 && (threshold == null || threshold === '')) {
    return privates[0].publicKey;
  }
  const n = threshold == null || threshold === '' ? privates.length : Number(threshold);
  if (!Number.isInteger(n) || n < 1 || n > privates.length) {
    throw new Error(`threshold must be a whole number 1..${privates.length}`);
  }
  return new KeyList(privates.map((key) => key.publicKey), n);
}

async function sign_with_keys(transaction, privates) {
  for (const key of privates) {
    await transaction.sign(key);
  }
  return transaction;
}

function as_account_id(value) {
  if (value instanceof AccountId) return value;
  if (typeof value === 'string') {
    const id = value.includes(':') ? value.split(':').pop() : value.trim();
    return AccountId.fromString(id || '0.0.3');
  }
  if (value && typeof value === 'object') {
    const printed = typeof value.toString === 'function' ? value.toString() : '';
    if (/^\d+\.\d+\.\d+/.test(printed)) return AccountId.fromString(printed);
    const num = value.num ?? value.accountNum;
    if (num != null) {
      return new AccountId(Number(value.shard ?? 0), Number(value.realm ?? 0), Number(num));
    }
  }
  return AccountId.fromString('0.0.3');
}

async function node_for_freeze() {
  return AccountId.fromString('0.0.3');
}

async function freeze_for_wallet(transaction, activeSigner) {
  transaction.setNodeAccountIds([await node_for_freeze()]);
  return transaction.freezeWithSigner(activeSigner);
}

function with_wallet_timeout(promise, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            `${label} timed out waiting for HashPack. Open the HashPack extension, approve the request, or Disconnect and Connect again.`
          )
        );
      }, 90000);
    }),
  ]);
}

/**
 * Create an ED25519 keypair in the browser. No transaction. No wallet.
 *
 * Use the private key as topic `adminKey` + `feeScheduleKey` on create_topic
 * / update_topic. Show it once, store it offline, never commit it.
 *
 * @returns {Promise<{ privateKey: string, publicKey: string }>}
 */
export async function generate_private_and_public_key() {
  const privateKey = await PrivateKey.generateED25519Async();
  return {
    privateKey: privateKey.toString(),
    publicKey: privateKey.publicKey.toString(),
  };
}

/**
 * Create an HCS topic. Wallet pays the create fee. HashPack will pop.
 *
 * Keys (all optional):
 * - `adminkey` / `adminKeys`: one private key, or several (array or newline list).
 *   Several keys become a KeyList. `adminThreshold` = how many must sign later
 *   (default = all). Admin is also set as fee-schedule key (HIP-991 later).
 * - `submitkey` / `submitKeys`: who may Send. Empty = anyone can submit.
 *   Same list / threshold rules as admin.
 *
 * Create must be signed by the admin private keys. Submit keys are stored on
 * the topic; they sign later on send_message, not here.
 *
 * @param {{
 *   memo?: string,
 *   adminkey?: string | string[],
 *   adminKeys?: string | string[],
 *   adminThreshold?: number,
 *   submitkey?: string | string[],
 *   submitKeys?: string | string[],
 *   submitThreshold?: number,
 * }} opts
 * @returns {Promise<string>} topic id, e.g. "0.0.123456"
 */
export async function create_topic({
  memo,
  adminkey: adminKey,
  adminKeys,
  adminThreshold,
  submitkey: submitKey,
  submitKeys,
  submitThreshold,
}) {
  const activeSigner = requireSigner();
  const adminPrivates = parse_private_keys(adminKeys ?? adminKey);
  const submitPrivates = parse_private_keys(submitKeys ?? submitKey);
  const admin = public_from_privates(adminPrivates, adminThreshold);
  const submit = public_from_privates(submitPrivates, submitThreshold);

  let transaction = new TopicCreateTransaction().setTopicMemo(memo || '');
  if (admin) {
    transaction.setAdminKey(admin).setFeeScheduleKey(admin);
  }
  if (submit) {
    transaction.setSubmitKey(submit);
  }

  transaction = await freeze_for_wallet(transaction, activeSigner);
  await sign_with_keys(transaction, adminPrivates);

  const txResponse = await with_wallet_timeout(
    transaction.executeWithSigner(activeSigner),
    'Create topic'
  );
  const receipt = await txResponse.getReceiptWithSigner(activeSigner);
  return receipt.topicId.toString();
}

/**
 * Update memo / keys / custom fees on an existing topic. Wallet + admin key.
 *
 * `customFees` is HIP-991 (paid rooms). Amount is tinybars when no token
 * id is set. `denominatingTokenId` of an HTS token charges that token instead.
 *
 * @param {{
 *   topicId: string,
 *   memo?: string,
 *   adminKey?: string | string[],
 *   adminThreshold?: number,
 *   submitkey?: string | string[],
 *   submitThreshold?: number,
 *   customFees?: Array<{ amount: number, collectorAccountId: string, denominatingTokenId?: string }>
 * }} opts
 */
export async function update_topic({
  topicId,
  memo,
  adminKey,
  adminThreshold,
  submitkey: submitKey,
  submitThreshold,
  customFees,
}) {
  const activeSigner = requireSigner();
  const adminPrivates = parse_private_keys(adminKey);
  const submitPrivates = parse_private_keys(submitKey);
  const admin = public_from_privates(adminPrivates, adminThreshold);
  const submit = public_from_privates(submitPrivates, submitThreshold);

  let transaction = new TopicUpdateTransaction()
    .setTopicId(topicId)
    .setTopicMemo(memo || '');

  if (admin) {
    transaction.setAdminKey(admin).setFeeScheduleKey(admin);
  }
  if (submit) {
    transaction.setSubmitKey(submit);
  }

  if (customFees) {
    const hederaCustomFees = customFees.map((fee) => {
      const customFee = new CustomFixedFee()
        .setAmount(fee.amount)
        .setFeeCollectorAccountId(fee.collectorAccountId);
      if (fee.denominatingTokenId) {
        customFee.setDenominatingTokenId(fee.denominatingTokenId);
      }
      return customFee;
    });
    transaction.setCustomFees(hederaCustomFees);
  }

  transaction = await freeze_for_wallet(transaction, activeSigner);
  await sign_with_keys(transaction, adminPrivates);

  await with_wallet_timeout(transaction.executeWithSigner(activeSigner), 'Update topic');
}

/**
 * Delete a topic. Wallet pays. The admin private key must sign.
 *
 * A topic with no admin key cannot be deleted. Several admin keys: pass
 * enough private keys to meet the threshold from create (array or newline
 * list). Old messages stay on the mirror. New sends and updates will fail.
 *
 * @param {string} topicId e.g. "0.0.123456"
 * @param {string | string[]} adminKey admin private key(s)
 * @example
 * await delete_topic("0.0.123456", adminPrivateKey);
 */
export async function delete_topic(topicId, adminKey) {
  const activeSigner = requireSigner();
  const id = String(topicId || '').trim();
  if (!id) throw new Error('topic id required');
  const adminPrivates = parse_private_keys(adminKey);
  if (!adminPrivates.length) throw new Error('admin private key required to delete a topic');

  let transaction = new TopicDeleteTransaction().setTopicId(TopicId.fromString(id));
  transaction = await freeze_for_wallet(transaction, activeSigner);
  await sign_with_keys(transaction, adminPrivates);

  await with_wallet_timeout(transaction.executeWithSigner(activeSigner), 'Delete topic');
  return id;
}

/**
 * Submit one message to a topic. Wallet signs TopicMessageSubmitTransaction.
 *
 * Pass a string. JSON.stringify your chat payload first. Encrypt before
 * this call if the room is private (this helper does not encrypt).
 *
 * If the topic has a submit key, pass that private key as the third argument
 * or HashPack-only send will fail. Multiple keys: array or newline list.
 * @param {string} topicId  e.g. "0.0.123456"
 * @param {string} message  raw payload written on chain
 * @param {string | string[]} [submitkey] private submit key(s) if the topic has one
 * @returns {Promise<import('@hashgraph/sdk').TransactionReceipt>}
 */
export async function send_message(topicId, message, submitkey) {
  const activeSigner = requireSigner();
  const id = String(topicId || '').trim();
  if (!id) throw new Error('topic id required');

  let transaction = new TopicMessageSubmitTransaction()
    .setTopicId(TopicId.fromString(id))
    .setMessage(message);
  transaction = await freeze_for_wallet(transaction, activeSigner);
  await sign_with_keys(transaction, parse_private_keys(submitkey));

  const txResponse = await with_wallet_timeout(
    transaction.executeWithSigner(activeSigner),
    'Send message'
  );
  const receipt = await txResponse.getReceiptWithSigner(activeSigner);
  return receipt;
}

/**
 * Read every message on a topic from the mirror node. No wallet.
 *
 * Paginates, base64-decodes, JSON-parses. Non-JSON becomes `{ text }`.
 *
 * @param {string} topicId
 * @returns {Promise<{ messages: object[], error: string }>}
 */
export async function get_messages(topicId) {
  let url = `${MIRROR_BASE}/api/v1/topics/${topicId}/messages?limit=100`;
  const allMessages = [];

  try {
    while (url) {
      const response = await fetchWithRetry(url);
      const data = await response.json();

      for (const msg of data.messages || []) {
        try {
          const decoded = atob(msg.message);
          let parsed;
          try {
            parsed = JSON.parse(decoded);
          } catch {
            parsed = { text: decoded };
          }
          allMessages.push({
            ...parsed,
            payer: msg.payer_account_id,
            created: new Date(Number(msg.consensus_timestamp) * 1000),
            consensus_timestamp: msg.consensus_timestamp,
            sequence_number: msg.sequence_number,
          });
        } catch (parseError) {
          console.warn(`Skip seq ${msg.sequence_number}: ${parseError.message}`);
        }
      }

      url = data.links?.next ? `${MIRROR_BASE}${data.links.next}` : null;
    }

    allMessages.sort((a, b) => a.sequence_number - b.sequence_number);
    return { messages: allMessages, error: '' };
  } catch (error) {
    console.error('get_messages:', error);
    return { messages: [], error: error.message || String(error) };
  }
}

/**
 * Load history then poll the mirror every 3s for new sequences. No wallet.
 *
 * Call `close()` when leaving the room so the poll stops.
 *
 * @param {string} topicId
 * @param {(msg: object) => void} [onMessageReceived] live messages only
 * @param {(err: Error) => void} [onError]
 * @param {number} [pollIntervalMs=3000]
 * @returns {Promise<{ messages: object[], close: () => void }>}
 */
export async function subscribe_to_topic(
  topicId,
  onMessageReceived = null,
  onError = null,
  pollIntervalMs = 3000
) {
  let lastSequence = 0;
  let stopped = false;
  let timeoutId = null;
  const seenSequences = new Set();
  const historyMessages = [];

  const processMessages = (messages, isHistory = false) => {
    for (const msg of messages || []) {
      const seq = msg.sequence_number;
      if (seenSequences.has(seq)) continue;
      try {
        const decoded = atob(msg.message);
        let parsed;
        try {
          parsed = JSON.parse(decoded);
        } catch {
          parsed = { text: decoded };
        }
        const formatted = {
          ...parsed,
          payer: msg.payer_account_id,
          created: new Date(Number(msg.consensus_timestamp) * 1000),
          consensus_timestamp: msg.consensus_timestamp,
          sequence_number: seq,
        };
        seenSequences.add(seq);
        if (isHistory) historyMessages.push(formatted);
        else if (typeof onMessageReceived === 'function') onMessageReceived(formatted);
        if (seq > lastSequence) lastSequence = seq;
      } catch (err) {
        console.warn('Skipping bad message:', err.message);
      }
    }
  };

  const loadHistory = async () => {
    let url = `${MIRROR_BASE}/api/v1/topics/${topicId}/messages?limit=100&order=asc`;
    while (url && !stopped) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      processMessages(data.messages, true);
      url = data.links?.next ? `${MIRROR_BASE}${data.links.next}` : null;
    }
    historyMessages.sort((a, b) => a.sequence_number - b.sequence_number);
  };

  const poll = async () => {
    if (stopped) return;
    try {
      let url = `${MIRROR_BASE}/api/v1/topics/${topicId}/messages?limit=100&order=asc`;
      if (lastSequence > 0) url += `&sequencenumber=gt:${lastSequence}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      processMessages(data.messages, false);
    } catch (error) {
      if (typeof onError === 'function') onError(error);
    } finally {
      if (!stopped) timeoutId = setTimeout(poll, pollIntervalMs);
    }
  };

  try {
    await loadHistory();
  } catch (error) {
    if (typeof onError === 'function') onError(error);
  }
  if (!stopped) poll();

  return {
    messages: historyMessages,
    close() {
      stopped = true;
      if (timeoutId) clearTimeout(timeoutId);
    },
  };
}

/**
 * Mirror GET /api/v1/topics/{id}. Memo, admin key, custom fees. No wallet.
 *
 * @param {string} topicId
 * @returns {Promise<object>} raw topic record
 */
export async function get_topic_info(topicId) {
  if (!topicId) throw new Error('Topic ID is required');
  const response = await fetchWithRetry(`${MIRROR_BASE}/api/v1/topics/${topicId}`);
  if (!response.ok) {
    throw new Error(`Topic info failed: ${response.status}`);
  }
  return response.json();
}

/**
 * Mirror GET /accounts/{id}/nfts. Optional filter by token id. No wallet.
 * Decodes metadata as ASCII `token_uri` when it is valid base64.
 *
 * @param {string} accountId
 * @param {string} [tokenId]
 * @returns {Promise<object[]>}
 */
export async function get_account_nfts(accountId, tokenId) {
  try {
    const tokenQuery = tokenId ? `&token.id=${tokenId}` : '';
    let url = `${MIRROR_BASE}/api/v1/accounts/${accountId}/nfts?limit=200${tokenQuery}`;
    const request = await fetchWithRetry(url);
    if (!request.ok) throw new Error(`NFTs fetch failed: ${request.status}`);

    const response = await request.json();
    let nextLink = response.links?.next || null;
    let nfts = response.nfts || [];

    while (nextLink) {
      const nextRequest = await fetchWithRetry(`${MIRROR_BASE}${nextLink}`);
      if (!nextRequest.ok) break;
      const nextResponse = await nextRequest.json();
      nfts = [...nfts, ...(nextResponse.nfts || [])];
      nextLink =
        nextResponse.links?.next && nextLink !== nextResponse.links.next
          ? nextResponse.links.next
          : null;
    }

    return nfts.map((nft) => {
      try {
        nft.token_uri = atob(nft.metadata);
      } catch {
        /* leave raw metadata */
      }
      return nft;
    });
  } catch {
    return [];
  }
}
