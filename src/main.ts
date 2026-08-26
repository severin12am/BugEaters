import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';
import { initTelegramViewport } from './utils/telegram';

/** Bootstraps Telegram viewport sizing before Phaser attaches to the DOM. */
initTelegramViewport();

/**
 * Application entry point.
 * Scale Manager handles full-screen layout; avoid manual canvas resize hacks.
 */
const game = new Phaser.Game(gameConfig);

// Expose for local tooling + playtest builds (Pages with VITE_ALLOW_DEV_SESSION).
// Omit from true production builds when that flag is off.
if (import.meta.env.DEV || import.meta.env.VITE_ALLOW_DEV_SESSION === 'true') {
  (window as unknown as { game?: Phaser.Game }).game = game;
}

window.addEventListener('resize', () => {
  game.scale.refresh();
});

export default game;
