/**
 * AuthWorldRenderer — draws the SERVER's world (hazards + dividers) for an
 * authoritative multiplayer race.
 *
 * In authoritative mode the client invents nothing: every trash bin, puddle,
 * manhole and pickup comes from the server snapshot, and the divider lines
 * open/close exactly when the server says. This is what makes two tabs show the
 * same world and removes "died for no reason" (you see the hazard the server
 * killed you with).
 *
 * Positioning: a hazard at `worldY` is drawn relative to the local player's
 * authoritative `distance`. The player is anchored at `groundY`, so:
 *
 *     screenY = groundY - (hazard.worldY - selfDistance)
 *
 * As the player advances, hazards scroll down and off the bottom — same feel as
 * the single-player road.
 */
import Phaser from 'phaser';
import { getAbility } from '../config/abilities';
import { PROP_TEXTURE_KEYS } from '../config/propAssets';
import { TUNING } from '../config/tuning';
import { GAME_HEIGHT, ux } from '../utils/constants';
import { subLaneCenterX } from './SubLaneManager';
import type { HazardSnapshotDto } from '../net/AuthoritativeRaceClient';

const DEPTH_PUDDLE = 2;
const DEPTH_MANHOLE = 2;
const DEPTH_TRASH = 3;
const DEPTH_PICKUP = 4;

export class AuthWorldRenderer {
  /** Live hazard sprites keyed by the server hazard id. */
  private readonly sprites = new Map<number, Phaser.GameObjects.Image>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly container: Phaser.GameObjects.Container,
    private readonly groundY: number,
    private readonly subLaneWidth: number,
  ) {}

  /**
   * Reconciles hazard sprites with the current server hazards. Positions are
   * relative to the local player's authoritative distance. Dividers are rendered
   * separately by the scrolling MainLaneDivider components.
   *
   * Call every frame with the local player's authoritative (smoothed) distance.
   */
  /**
   * @param selfDistance server race distance (logical px). Converted with {@link ux}
   *   so phone DPR matches desktop — without this, hazards pop in at your feet on retina.
   * @param selfUserId when set, hide pickups this player already collected on the server.
   */
  render(hazards: HazardSnapshotDto[], selfDistance: number, selfUserId?: string | null): void {
    const present = new Set<number>();
    for (const hazard of hazards) {
      // Per-player pickup resolve: keep the prop in the world for others, hide for collector.
      if (
        hazard.kind === 'pickup' &&
        selfUserId &&
        hazard.resolvedBy?.includes(selfUserId)
      ) {
        const existing = this.sprites.get(hazard.id);
        if (existing) {
          existing.setVisible(false);
        }
        continue;
      }
      present.add(hazard.id);
      // Server coords are logical; screen space is DPR-scaled.
      const screenY = this.groundY - ux(hazard.worldY - selfDistance);
      // Skip drawing hazards well off-screen (still tracked, just not shown).
      if (screenY < -ux(120) || screenY > GAME_HEIGHT + ux(120)) {
        this.sprites.get(hazard.id)?.setVisible(false);
        continue;
      }
      let sprite = this.sprites.get(hazard.id);
      if (!sprite) {
        sprite = this.createSprite(hazard);
        this.sprites.set(hazard.id, sprite);
      }
      sprite.setVisible(true);
      sprite.x = subLaneCenterX(hazard.lane, this.subLaneWidth);
      sprite.y = screenY;
    }

    // Destroy sprites for hazards the server has pruned.
    for (const [id, sprite] of this.sprites) {
      if (!present.has(id)) {
        sprite.destroy();
        this.sprites.delete(id);
      }
    }
  }

  private createSprite(hazard: HazardSnapshotDto): Phaser.GameObjects.Image {
    const cfg = TUNING.obstacles;
    let textureKey: string = PROP_TEXTURE_KEYS.trashBin;
    let displayH = ux(cfg.trashDisplayHeight * cfg.trashSizeMultiplier);
    let depth = DEPTH_TRASH;
    let origin: [number, number] = [0.5, 1];

    if (hazard.kind === 'puddle') {
      textureKey = PROP_TEXTURE_KEYS.puddle;
      displayH = ux(cfg.puddleDisplayHeightMin * 1.6);
      depth = DEPTH_PUDDLE;
    } else if (hazard.kind === 'manhole') {
      // Match ObstacleManager.spawnManhole exactly — scale from the painted disc
      // diameter (manholeSourceDiameterPx), NOT the full 500×500 texture height.
      // Using sprite.height made auth manholes ~2.5× too small.
      textureKey = hazard.open ? PROP_TEXTURE_KEYS.manholeOpen : PROP_TEXTURE_KEYS.manholeClosed;
      displayH = ux(cfg.manholeDisplayHeight * cfg.manholeSizeMultiplier);
      depth = DEPTH_MANHOLE;
      const originCfg = hazard.open ? cfg.manholeOpening : cfg.manholeClosedOrigin;
      origin = [originCfg.originXFraction, originCfg.originYFraction];
    } else if (hazard.kind === 'pickup') {
      textureKey = this.pickupTexture(hazard.abilityId);
      displayH = ux(TUNING.abilities.displayHeight);
      depth = DEPTH_PICKUP;
    } else if (hazard.kind === 'passport') {
      textureKey = PROP_TEXTURE_KEYS.passport;
      displayH = ux(34);
      depth = DEPTH_TRASH;
    } else if (hazard.kind === 'straw') {
      textureKey = PROP_TEXTURE_KEYS.paperStraw;
      displayH = ux(28);
      depth = DEPTH_TRASH;
    }

    const sprite = this.scene.add
      .image(0, 0, textureKey)
      .setOrigin(origin[0], origin[1])
      .setDepth(depth);
    if (hazard.kind === 'manhole') {
      const scale = displayH / TUNING.obstacles.manholeSourceDiameterPx;
      sprite.setScale(scale);
    } else if (sprite.height > 0) {
      sprite.setScale(displayH / sprite.height);
    } else {
      sprite.setDisplaySize(displayH, displayH);
    }
    if (typeof hazard.angle === 'number') {
      sprite.setAngle(hazard.angle);
    }
    this.container.add(sprite);
    return sprite;
  }

  private pickupTexture(abilityId?: string): string {
    if (abilityId) {
      try {
        return getAbility(abilityId).textureKey;
      } catch {
        // Unknown ability id — fall back to a neutral prop.
      }
    }
    return PROP_TEXTURE_KEYS.syringe;
  }

  destroy(): void {
    this.sprites.forEach((sprite) => sprite.destroy());
    this.sprites.clear();
  }
}
