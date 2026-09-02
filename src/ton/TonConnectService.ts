/**
 * =============================================================================
 * TonConnectService — the one TON Connect UI instance for the Phaser app.
 * =============================================================================
 *
 * Phaser is not a SPA framework, so we drive TON Connect imperatively
 * (`openModal()` from a Phaser button) instead of mounting its button
 * (docs/TON_CRYPTO_IMPLEMENTATION_PLAN.md §8). The service:
 *
 *   - lazily creates the singleton `TonConnectUI` (manifest from env),
 *   - connects WITH a `ton_proof` challenge so the server can verify the user
 *     controls the address before linking it to the Telegram profile,
 *   - signs the burn transfer (`sendTransaction`) when a pass is used.
 */
import {
  TonConnectUI,
  THEME,
  type ConnectedWallet,
  type SendTransactionRequest,
  type TonProofItemReplySuccess,
} from '@tonconnect/ui';
import { TELEGRAM_BOT_USERNAME, TON_CHAIN, TONCONNECT_MANIFEST_URL, isTonConnectEnabled } from './env';

export interface ProvenWallet {
  /** Raw `0:hex` address. */
  readonly rawAddress: string;
  readonly chain: string;
  readonly publicKey: string | null;
  readonly walletStateInit: string;
  readonly proof: TonProofItemReplySuccess['proof'];
}

const CONNECT_TIMEOUT_MS = 5 * 60 * 1000;

class TonConnectServiceImpl {
  private ui: TonConnectUI | null = null;

  isEnabled(): boolean {
    return isTonConnectEnabled;
  }

  get(): TonConnectUI {
    if (this.ui) {
      return this.ui;
    }
    if (!isTonConnectEnabled) {
      throw new Error('TON Connect is not configured (VITE_TONCONNECT_MANIFEST_URL)');
    }
    const ui = new TonConnectUI({
      manifestUrl: TONCONNECT_MANIFEST_URL,
      uiPreferences: { theme: THEME.DARK },
      actionsConfiguration: TELEGRAM_BOT_USERNAME
        ? { twaReturnUrl: `https://t.me/${TELEGRAM_BOT_USERNAME}` }
        : undefined,
    });
    ui.setConnectionNetwork(TON_CHAIN);
    this.ui = ui;
    return ui;
  }

  /** Currently connected raw address (TON Connect session), or null. */
  connectedAddress(): string | null {
    return this.ui?.account?.address ?? null;
  }

  /**
   * Opens the wallet picker with a `ton_proof` challenge and resolves once the
   * wallet signed it. Any existing session is dropped first so the proof is fresh.
   */
  async connectWithProof(payload: string): Promise<ProvenWallet> {
    const ui = this.get();
    if (ui.connected) {
      await ui.disconnect();
    }
    ui.setConnectRequestParameters({ state: 'ready', value: { tonProof: payload } });

    const wallet = await new Promise<ConnectedWallet>((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        unsubscribeStatus();
        unsubscribeModal();
        clearTimeout(timer);
        fn();
      };
      const unsubscribeStatus = ui.onStatusChange(
        (connected) => {
          if (connected) {
            finish(() => resolve(connected));
          }
        },
        (error) => finish(() => reject(error)),
      );
      const unsubscribeModal = ui.onModalStateChange((state) => {
        if (state.status === 'closed' && state.closeReason === 'action-cancelled') {
          finish(() => reject(new Error('wallet_connect_cancelled')));
        }
      });
      const timer = setTimeout(() => finish(() => reject(new Error('wallet_connect_timeout'))), CONNECT_TIMEOUT_MS);
      void ui.openModal().catch((error) => finish(() => reject(error)));
    });

    ui.setConnectRequestParameters(null);

    const reply = wallet.connectItems?.tonProof;
    if (!reply || !('proof' in reply)) {
      await ui.disconnect();
      throw new Error('wallet_did_not_sign_proof');
    }
    return {
      rawAddress: wallet.account.address,
      chain: String(wallet.account.chain),
      publicKey: wallet.account.publicKey ?? null,
      walletStateInit: wallet.account.walletStateInit,
      proof: reply.proof,
    };
  }

  /** Makes sure a wallet session exists (re-opens the picker if needed). */
  async ensureConnected(): Promise<void> {
    const ui = this.get();
    await ui.connectionRestored;
    if (ui.connected) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const unsubscribe = ui.onStatusChange((wallet) => {
        if (wallet) {
          unsubscribe();
          unsubscribeModal();
          resolve();
        }
      });
      const unsubscribeModal = ui.onModalStateChange((state) => {
        if (state.status === 'closed' && state.closeReason === 'action-cancelled') {
          unsubscribe();
          unsubscribeModal();
          reject(new Error('wallet_connect_cancelled'));
        }
      });
      void ui.openModal();
    });
  }

  /** Signs + broadcasts one message. Resolves with the external message BOC. */
  async sendTransaction(message: {
    to: string;
    amount: string;
    payload?: string;
    validUntil?: number;
  }): Promise<{ boc: string }> {
    await this.ensureConnected();
    const request: SendTransactionRequest = {
      validUntil: message.validUntil ?? Math.floor(Date.now() / 1000) + 5 * 60,
      network: TON_CHAIN,
      messages: [{ address: message.to, amount: message.amount, payload: message.payload }],
    };
    const response = await this.get().sendTransaction(request);
    return { boc: response.boc };
  }

  async disconnect(): Promise<void> {
    if (this.ui?.connected) {
      await this.ui.disconnect();
    }
  }
}

export const tonConnectService = new TonConnectServiceImpl();
