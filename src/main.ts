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

// Dev-only handle so local tooling can inspect live race state. Never in prod.
if (import.meta.env.DEV) {
  (window as unknown as { game?: Phaser.Game }).game = game;
}

window.addEventListener('resize', () => {
  game.scale.refresh();
});

export default game;
