/**
 * TON wallet environment for the browser client.
 *
 *   VITE_TONCONNECT_MANIFEST_URL  Public URL of tonconnect-manifest.json. When set,
 *                                 the real TON Connect wallet flow replaces the
 *                                 playtest mock (src/tournament/chain/MockChainService).
 *   VITE_TON_NETWORK              testnet | mainnet (default testnet)
 *   VITE_TELEGRAM_BOT_USERNAME    Bot username for the TON Connect return URL (t.me/<bot>)
 */
import { CHAIN } from '@tonconnect/ui';

const manifestRaw = (import.meta.env.VITE_TONCONNECT_MANIFEST_URL as string | undefined)?.trim() ?? '';
const networkRaw = (import.meta.env.VITE_TON_NETWORK as string | undefined)?.trim().toLowerCase() ?? '';
const botRaw = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined)?.trim().replace(/^@/u, '') ?? '';

export type TonNetworkName = 'testnet' | 'mainnet';

export const TON_NETWORK: TonNetworkName = networkRaw === 'mainnet' ? 'mainnet' : 'testnet';
export const TON_CHAIN: CHAIN = TON_NETWORK === 'mainnet' ? CHAIN.MAINNET : CHAIN.TESTNET;
export const TONCONNECT_MANIFEST_URL = manifestRaw;
export const TELEGRAM_BOT_USERNAME = botRaw;

/** True when the real TON Connect flow is configured (otherwise the mock chain is used). */
export const isTonConnectEnabled = manifestRaw.length > 0;

export function tonviewerUrl(address: string): string {
  return TON_NETWORK === 'mainnet'
    ? `https://tonviewer.com/${address}`
    : `https://testnet.tonviewer.com/${address}`;
}

/** Short `UQAb…12Cd` form for chips. */
export function shortAddress(address: string | null | undefined): string {
  if (!address) {
    return '';
  }
  return address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}
