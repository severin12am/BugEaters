import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../utils/constants';
import { BootScene } from '../scenes/BootScene';
import { OnboardingScene } from '../scenes/OnboardingScene';
import { DevSessionScene } from '../scenes/DevSessionScene';
import { WeekHubScene } from '../scenes/WeekHubScene';
import { MenuScene } from '../scenes/MenuScene';
import { MondayWaitScene } from '../scenes/MondayWaitScene';
import { LobbyScene } from '../scenes/LobbyScene';
import { GameScene } from '../scenes/GameScene';
import { EndScene } from '../scenes/EndScene';
import { ReadyPanelScene } from '../scenes/ReadyPanelScene';
import { BlockedStateScene } from '../scenes/BlockedStateScene';
import { SundayFinaleScene } from '../scenes/SundayFinaleScene';
import { ChampionDashboardScene } from '../scenes/ChampionDashboardScene';
import { EncyclopediaScene } from '../scenes/EncyclopediaScene';

/**
 * Phaser game configuration tuned for Telegram Mini App full-screen display.
 */
export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#080808',
  antialias: true,
  roundPixels: true,
  render: {
    antialias: true,
    antialiasGL: true,
    pixelArt: false,
    roundPixels: true,
    powerPreference: 'high-performance',
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    expandParent: true,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [
    BootScene,
    OnboardingScene,
    DevSessionScene,
    WeekHubScene,
    MenuScene,
    MondayWaitScene,
    ReadyPanelScene,
    LobbyScene,
    GameScene,
    EndScene,
    BlockedStateScene,
    SundayFinaleScene,
    ChampionDashboardScene,
    EncyclopediaScene,
  ],
};
