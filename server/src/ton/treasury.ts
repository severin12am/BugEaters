/**
 * Treasury wallet — the only account that WRITES to TON on behalf of BugEaters.
 *
 * It owns the pass collection, so it is the only address allowed to mint. It is
 * a standard wallet v4r2 derived from a 24-word mnemonic kept in server secrets
 * (never shipped to the client). Sends are serialized through `seqno`, so the
 * minter must not run in parallel across machines (Fly stays at 1 machine).
 */
import { Address, internal, SendMode, type Cell, type StateInit } from '@ton/core';
import { mnemonicToPrivateKey, type KeyPair } from '@ton/crypto';
import { TonClient, WalletContractV4 } from '@ton/ton';
import { waitUntil } from './tonClient.js';

export interface Treasury {
  readonly address: Address;
  readonly keyPair: KeyPair;
  /** Sends one internal message and resolves once the wallet's seqno advanced. */
  sendInternal(params: {
    to: Address;
    value: bigint;
    body?: Cell;
    init?: StateInit;
    bounce?: boolean;
  }): Promise<void>;
  balance(): Promise<bigint>;
}

export async function openTreasury(client: TonClient, mnemonic: string): Promise<Treasury> {
  const words = mnemonic.trim().split(/\s+/u);
  if (words.length !== 24) {
    throw new Error(`TON_TREASURY_MNEMONIC must have 24 words (got ${words.length})`);
  }
  const keyPair = await mnemonicToPrivateKey(words);
  const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
  const contract = client.open(wallet);

  return {
    address: wallet.address,
    keyPair,
    async balance() {
      return contract.getBalance();
    },
    async sendInternal(params) {
      const seqno = await contract.getSeqno();
      await contract.sendTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        sendMode: SendMode.PAY_GAS_SEPARATELY | SendMode.IGNORE_ERRORS,
        messages: [
          internal({
            to: params.to,
            value: params.value,
            body: params.body,
            init: params.init,
            bounce: params.bounce ?? true,
          }),
        ],
      });
      const advanced = await waitUntil(async () => (await contract.getSeqno()) > seqno, {
        timeoutMs: 90_000,
        intervalMs: 3_000,
      });
      if (!advanced) {
        throw new Error('treasury transfer was not confirmed within 90s');
      }
    },
  };
}
