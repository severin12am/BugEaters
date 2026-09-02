import Phaser from 'phaser';
import { ABILITY_MAX_SLOTS } from '../config/abilities';
import { TUNING } from '../config/tuning';
import { PERF_PROFILE } from './perf';

/**
 * Layout and coordinate scaling for mobile / Telegram Mini App.
 * Game coordinates are rendered at device pixel density for sharp visuals.
 */

/**
 * Device pixel ratio, capped to balance sharpness and performance.
 * The cap comes from the perf profile: 2 on capable phones, 1.5 on weak ones
 * (44% fewer pixels to fill every frame). Everything on screen is laid out in
 * logical px through `ux()`, so gameplay geometry is identical at either cap.
 */
export const DISPLAY_DPR = Math.min(window.devicePixelRatio || 1, PERF_PROFILE.dprCap);

/** Reference phone layout before DPR scaling. */
export const LOGICAL_WIDTH = 390;
export const LOGICAL_HEIGHT = 844;

/** Internal canvas size — higher on retina screens for crisp rendering. */
export const GAME_WIDTH = Math.round(LOGICAL_WIDTH * DISPLAY_DPR);
export const GAME_HEIGHT = Math.round(LOGICAL_HEIGHT * DISPLAY_DPR);

/** Scales a logical layout value to the internal game coordinate space. */
export function ux(value: number): number {
  return Math.round(value * DISPLAY_DPR);
}

/** Returns a font size string scaled to the internal coordinate space. */
export function fontSize(logicalPx: number): string {
  return `${ux(logicalPx)}px`;
}

export interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Reads Telegram / OS safe-area insets in CSS pixels. */
export function getSafeAreaInsets(): SafeAreaInsets {
  const tg = window.Telegram?.WebApp;
  const content = tg?.contentSafeAreaInset;
  const safe = tg?.safeAreaInset;

  const top = content?.top ?? safe?.top ?? readCssSafeAreaTop();
  const bottom = content?.bottom ?? safe?.bottom ?? 0;
  const left = content?.left ?? safe?.left ?? 0;
  const right = content?.right ?? safe?.right ?? 0;

  return { top, bottom, left, right };
}

/** Converts CSS pixels from the host webview into game Y coordinates. */
export function cssToGameY(scene: Phaser.Scene, cssPixels: number): number {
  const parentHeight = scene.scale.parentSize.height || window.innerHeight;
  if (parentHeight <= 0) {
    return ux(cssPixels);
  }
  return (cssPixels / parentHeight) * scene.scale.height;
}

/** Converts CSS pixels from the host webview into game X coordinates. */
export function cssToGameX(scene: Phaser.Scene, cssPixels: number): number {
  const parentWidth = scene.scale.parentSize.width || window.innerWidth;
  if (parentWidth <= 0) {
    return ux(cssPixels);
  }
  return (cssPixels / parentWidth) * scene.scale.width;
}

/** Left edge for menu content, inset from Telegram safe area. */
export function getMenuContentLeft(scene: Phaser.Scene, logicalPad = 16): number {
  return cssToGameX(scene, getSafeAreaInsets().left) + ux(logicalPad);
}

/** Y above the bottom safe area (logical px from home indicator). */
export function getMenuBottomY(scene: Phaser.Scene, logicalOffsetFromBottom: number): number {
  const insets = getSafeAreaInsets();
  return scene.scale.height - cssToGameY(scene, insets.bottom + logicalOffsetFromBottom);
}

/** Evenly spaced Y centers for menu character rows between title and start button. */
export function getMenuCharacterRowYs(
  scene: Phaser.Scene,
  rowCount: number,
  options?: { listTopLogical?: number; listBottomLogical?: number },
): number[] {
  const listTop = getContentTopY(scene, options?.listTopLogical ?? 168);
  const listBottom = getMenuBottomY(scene, options?.listBottomLogical ?? 210);
  const span = Math.max(listBottom - listTop, ux(80));
  const step = span / Math.max(rowCount - 1, 1);
  return Array.from({ length: rowCount }, (_, i) => listTop + i * step);
}

/** Y position for the primary HUD row (timer), below Telegram chrome. */
export function getHudTopY(scene: Phaser.Scene): number {
  return cssToGameY(scene, getSafeAreaInsets().top) + ux(TUNING.hud.topPadding);
}

/** Y position for the secondary HUD row (progress %). */
export function getHudSecondRowY(scene: Phaser.Scene): number {
  return getHudTopY(scene) + ux(TUNING.hud.rowGap);
}

/** Ability inventory slot size (briefcases are wider than tall). */
export function getAbilityHudSlotSize(): { width: number; height: number } {
  return { width: ux(72), height: ux(52) };
}

/** Y center for the bottom ability bar (above home-indicator safe area). */
export function getAbilityHudY(scene: Phaser.Scene): number {
  const insets = getSafeAreaInsets();
  const bottomCss = insets.bottom + 24;
  return scene.scale.height - cssToGameY(scene, bottomCss) - ux(28);
}

/** True when a pointer is over the bottom ability bar — lane taps must not fire. */
export function isPointerInAbilityHud(scene: Phaser.Scene, x: number, y: number): boolean {
  const { width: slotW, height: slotH } = getAbilityHudSlotSize();
  const gap = ux(10);
  const totalW = ABILITY_MAX_SLOTS * slotW + (ABILITY_MAX_SLOTS - 1) * gap;
  const left = GAME_WIDTH / 2 - totalW / 2;
  const right = left + totalW;
  const hudY = getAbilityHudY(scene);
  const top = hudY - slotH / 2 - ux(12);
  return x >= left && x <= right && y >= top && y <= scene.scale.height;
}

/** Y position for top-aligned screen content (menus, titles). */
export function getContentTopY(scene: Phaser.Scene, logicalOffset = 120): number {
  return cssToGameY(scene, getSafeAreaInsets().top) + ux(logicalOffset);
}

function readCssSafeAreaTop(): number {
  const styles = getComputedStyle(document.documentElement);
  const fromVar = parseFloat(styles.getPropertyValue('--safe-area-top'));
  if (!Number.isNaN(fromVar) && fromVar > 0) {
    return fromVar;
  }

  return 0;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        requestFullscreen?: () => void;
        viewportStableHeight?: number;
        viewportHeight?: number;
        safeAreaInset?: SafeAreaInsets;
        contentSafeAreaInset?: SafeAreaInsets;
        onEvent?: (event: string, callback: () => void) => void;
        /** Opens an external URL in the system browser (keeps the Mini App alive). */
        openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
        /** Raw signed init data string used for server-side auth verification. */
        initData?: string;
        initDataUnsafe?: {
          user?: {
            id: number;
            username?: string;
            first_name?: string;
            last_name?: string;
          };
        };
      };
    };
  }
}
