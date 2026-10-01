/**
 * STEAL THIS FILE
 *
 * HashPack via Hedera WalletConnect.
 * Copy into any web app. Pair with hedera.js (it imports signer from here).
 *
 *   npm i @hashgraph/sdk @hashgraph/hedera-wallet-connect @walletconnect/modal buffer
 *
 * Get a public project id: https://cloud.reown.com
 * Default network: testnet. Switch NEXT_PUBLIC_HEDERA_NETWORK=mainnet for prod.
 */

if (typeof window !== 'undefined') {
  window.alert = function (message) {
    console.warn('Blocked alert:', message);
  };
}

import {
  DAppConnector,
  HederaChainId,
  HederaJsonRpcMethod,
} from '@hashgraph/hedera-wallet-connect';
import { LedgerId, AccountId } from '@hashgraph/sdk';

if (!AccountId.fromString.__hcsPatched) {
  const orig = AccountId.fromString.bind(AccountId);
  AccountId.fromString = function fromString(text) {
    if (typeof text !== 'string') {
      if (text && typeof text.toString === 'function') {
        const asText = text.toString();
        if (/^\d+\.\d+\.\d+/.test(asText)) return orig(asText);
      }
      if (text && typeof text === 'object') {
        const num = text.num ?? text.accountNum;
        if (num != null) {
          return new AccountId(Number(text.shard ?? 0), Number(text.realm ?? 0), Number(num));
        }
      }
      throw new TypeError(`AccountId.fromString expected 0.0.x, got ${typeof text}`);
    }
    return orig(text);
  };
  AccountId.fromString.__hcsPatched = true;
}

function env(name, fallback) {
  if (typeof process !== 'undefined' && process.env && process.env[name]) {
    return process.env[name];
  }
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[name]) {
    return import.meta.env[name];
  }
  return fallback;
}

export const NETWORK = (env('NEXT_PUBLIC_HEDERA_NETWORK', 'testnet') || 'testnet').toLowerCase();
export const IS_MAINNET = NETWORK === 'mainnet';

export const MIRROR_BASE = IS_MAINNET
  ? 'https://mainnet.mirrornode.hedera.com'
  : 'https://testnet.mirrornode.hedera.com';

const PROJECT_ID = env(
  'NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID',
  env('VITE_WALLETCONNECT_PROJECT_ID', 'fdd65bec25e85908fecf7561fe42b41f')
);

const metadata = {
  name: 'HCS web starter',
  description: 'Copy-paste Hedera Consensus Service helpers',
  url: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
  icons: ['https://hedera.com/logo.svg'],
};

export const dAppConnector = new DAppConnector(
  metadata,
  IS_MAINNET ? LedgerId.MAINNET : LedgerId.TESTNET,
  PROJECT_ID,
  Object.values(HederaJsonRpcMethod),
  [],
  [IS_MAINNET ? HederaChainId.Mainnet : HederaChainId.Testnet]
);

export let connectedAccount = null;
export let signer = null;

const listeners = new Set();

export function onWalletChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn({ account: connectedAccount, signer });
}

function applySignerFromSession() {
  const signers = dAppConnector.signers;
  if (signers && signers.length > 0) {
    connectedAccount = signers[0].getAccountId().toString();
    signer = dAppConnector.getSigner(AccountId.fromString(connectedAccount));
    emit();
    return true;
  }
  connectedAccount = null;
  signer = null;
  emit();
  return false;
}

let initPromise = null;

export function initWallet() {
  if (!initPromise) {
    initPromise = dAppConnector
      .init({ logger: 'error' })
      .then(() => applySignerFromSession())
      .catch((err) => {
        console.error('Wallet init error:', err);
        emit();
      });
  }
  return initPromise;
}

export async function connectWallet() {
  await initWallet();
  await dAppConnector.openModal();
  applySignerFromSession();
  return connectedAccount;
}

export async function disconnectWallet() {
  try {
    await dAppConnector.disconnectAll();
  } catch (err) {
    console.error('Disconnect error:', err);
  }
  connectedAccount = null;
  signer = null;
  emit();
}
