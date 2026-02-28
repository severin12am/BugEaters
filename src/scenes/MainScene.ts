import { Client, Room } from '@colyseus/sdk';
import { GameState, Player } from '../schema/GameState';
import Phaser from 'phaser';

// --- WORLD GRID CONFIGURATION ---
const X_MULT = 1;
const BUG_LANES = 6 * X_MULT;
const MAN_LANES = 2 * X_MULT;
const KLAUS_LANES = 1 * X_MULT;
const MICRO_PER_LANE = 3;
const MICRO_WIDTH = 60;
const LANE_WIDTH = MICRO_WIDTH * MICRO_PER_LANE;
const TOTAL_MICRO = (BUG_LANES + MAN_LANES + KLAUS_LANES) * MICRO_PER_LANE;
const BARRIER_1_X = BUG_LANES * LANE_WIDTH;
const BARRIER_2_X = BARRIER_1_X + (MAN_LANES * LANE_WIDTH);
const B_CYCLE = 1200;
const B_SOLID = 900;
type Species = 'BUG' | 'MAN' | 'KLAUS';
const ZONE_SPEEDS = { BUG: 250, MAN: 250, KLAUS: 250 };
const RACE_DURATION_SEC = 70;
const FINISH_LINE_Y = -(RACE_DURATION_SEC * ZONE_SPEEDS.BUG);

interface PlayerEntity {
  container: Phaser.GameObjects.Container;
  serverState: any;
}

// --- UI SCENE ---
class UIScene extends Phaser.Scene {
  private zoneText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private dilemmaContainer!: Phaser.GameObjects.Container;
  private dilemmaTimerText!: Phaser.GameObjects.Text;

  constructor() { super({ key: 'UIScene', active: false }); }

  create() {
    this.zoneText = this.add.text(16, 16, 'ZONE: BUG (Guest) | SPD: 250', {
      fontSize: '24px', color: '#4caf50', fontStyle: 'bold', backgroundColor: '#000000aa', padding: { x: 10, y: 5 }
    }).setDepth(1000);

    this.timerText = this.add.text(this.scale.width / 2, 16, `${RACE_DURATION_SEC.toFixed(1)}s`, {
      fontSize: '32px', color: '#ffffff', fontStyle: 'bold', backgroundColor: '#000000aa', padding: { x: 15, y: 5 }
    }).setOrigin(0.5, 0).setDepth(1000);

    const mainScene = this.scene.get('MainScene') as MainScene;
    mainScene.events.on('zone_changed', (zone: string, speed: number) => {
      this.zoneText.setText(`ZONE: ${zone} | SPD: ${speed}`);
      if (zone.includes('BUG')) this.zoneText.setColor('#4caf50');
      else if (zone.includes('MAN')) this.zoneText.setColor('#2196f3');
      else this.zoneText.setColor('#f44336');
    });

    mainScene.events.on('time_update', (timeLeft: number) => {
      this.timerText.setText(`${Math.max(0, timeLeft).toFixed(1)}s`);
      this.timerText.setColor(timeLeft <= 3 ? '#f44336' : timeLeft <= 10 ? '#ffeb3b' : '#ffffff');
    });

    this.createDilemmaUI(mainScene);
  }

  createDilemmaUI(mainScene: Phaser.Scene) {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    this.dilemmaContainer = this.add.container(cx, cy).setDepth(2000).setVisible(false);

    const bg = this.add.rectangle(0, 0, 360, 200, 0x000000, 0.9).setStrokeStyle(4, 0xffffff);
    const title = this.add.text(0, -60, 'SAME SPECIES!\nEat or Cooperate?', { fontSize: '22px', color: '#ffffff', fontStyle: 'bold', align: 'center' }).setOrigin(0.5);
    this.dilemmaTimerText = this.add.text(0, -10, '3.0s', { fontSize: '32px', color: '#ffeb3b', fontStyle: 'bold' }).setOrigin(0.5);

    const eatBtn = this.add.rectangle(-80, 50, 130, 50, 0xf44336).setInteractive();
    const eatTxt = this.add.text(-80, 50, 'EAT', { fontSize: '20px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
    const coopBtn = this.add.rectangle(80, 50, 130, 50, 0x4caf50).setInteractive();
    const coopTxt = this.add.text(80, 50, 'COOP', { fontSize: '20px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);

    eatBtn.on('pointerdown', () => mainScene.events.emit('dilemma_choice', 'EAT'));
    coopBtn.on('pointerdown', () => mainScene.events.emit('dilemma_choice', 'COOP'));

    this.dilemmaContainer.add([bg, title, this.dilemmaTimerText, eatBtn, eatTxt, coopBtn, coopTxt]);

    mainScene.events.on('dilemma_start', () => { this.dilemmaContainer.setVisible(true); this.dilemmaTimerText.setText('3.0s'); });
    mainScene.events.on('dilemma_update', (timeLeft: number) => { this.dilemmaTimerText.setText((timeLeft / 1000).toFixed(1) + 's'); });
    mainScene.events.on('dilemma_end', () => { this.dilemmaContainer.setVisible(false); });
  }
}

// --- MAIN GAME SCENE ---
export class MainScene extends Phaser.Scene {
  private client!: Client;
  private room!: Room;
  private roadGraphics!: Phaser.GameObjects.Graphics;
  private playerEntities = new Map<string, PlayerEntity>();
  private localSessionId: string = "";
  private isDead: boolean = false;
  private isFinished: boolean = false;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private isSwiping: boolean = false;
  private swipeStartX: number = 0;
  private isAnimating: boolean = false;
  private dilemma = { active: false, timer: 3000 };

  constructor() { super('MainScene'); }

  init() {
    let serverUrl = import.meta.env.VITE_SERVER_URL;
    if (!serverUrl) {
      console.warn("VITE_SERVER_URL not set. Using default HTTPS URL.");
      serverUrl = 'https://bugeaters-production.up.railway.app';
    }
    console.log("🔗 Colyseus connecting to:", serverUrl);
    this.client = new Client(serverUrl);
    console.log("✅ Colyseus client created with SDK 0.17");

    if (!this.scene.get('UIScene')) {
      this.scene.add('UIScene', UIScene, true);
    }
  }

  async create() {
    const { width } = this.scale;
    const zoom = width / 540;
    this.cameras.main.setZoom(zoom);

    this.roadGraphics = this.add.graphics().setDepth(0);

    const loadingText = this.add.text(0, 0, "Connecting...", { fontSize: '40px', color: '#ffffff' })
      .setOrigin(0.5).setDepth(1000);
    this.cameras.main.centerOn(loadingText.x, loadingText.y);

    console.log("🚀 Attempting joinOrCreate('global_room')...");

    try {
      this.room = await this.client.joinOrCreate("global_room");
      console.log("✅ Joined room! roomId:", this.room.roomId, "sessionId:", this.room.sessionId);

      loadingText.destroy();
      this.setupNetwork(this.room);   // ← called exactly as the instruction said
    } catch (e) {
      console.error("❌ joinOrCreate failed:", e);
      loadingText.setText("Connection Failed – refresh page");
      return;
    }

    // Input handlers
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { this.isSwiping = true; this.swipeStartX = p.x; });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!this.isSwiping || this.isAnimating || this.isDead || this.isFinished) return;
      this.isSwiping = false;
      const swipeDist = p.x - this.swipeStartX;
      if (swipeDist > 40) this.sendMove(1);
      else if (swipeDist < -40) this.sendMove(-1);
    });

    if (this.input.keyboard) this.cursors = this.input.keyboard.createCursorKeys();

    this.events.on('dilemma_choice', (choice: string) => {
      if (this.dilemma.active && this.room) this.room.send('dilemma_choice', choice);
    });
  }

  // === CLEAN OFFICIAL COLYSEUS 0.17 SETUP (called with this.setupNetwork(this.room)) ===
  private setupNetwork(room: Room<GameState>) {
    this.localSessionId = room.sessionId!;

    console.log("🔗 setupNetwork started – local sessionId:", this.localSessionId);

    // 1. Race Timer (primitive)
    room.state.listen("raceTimer", (value: number, previousValue?: number) => {
      console.log("⏱️ raceTimer updated →", value);
      this.events.emit('time_update', value);
    });

    // 2. Players Map
    const playersMap = room.state.players;

    playersMap.onAdd((serverPlayer: any, sessionId: string) => {
      console.log("👤 Player ADDED → sessionId:", sessionId, "type:", serverPlayer.type, "microPos:", serverPlayer.microPos);

      const container = this.createCharacter(serverPlayer.type, serverPlayer.microPos, serverPlayer.y);
      container.setDepth(100);
      this.playerEntities.set(sessionId, { container, serverState: serverPlayer });

      if (sessionId === this.localSessionId) this.updateUI(serverPlayer);
    });

    playersMap.onRemove((serverPlayer: any, sessionId: string) => {
      console.log("❌ Player REMOVED → sessionId:", sessionId);
      const entity = this.playerEntities.get(sessionId);
      if (entity) {
        entity.container.destroy();
        this.playerEntities.delete(sessionId);
      }
    });

    // Listen to ANY change on players (position, death, zone, etc.)
    playersMap.onChange((serverPlayer: any, sessionId: string) => {
      const entity = this.playerEntities.get(sessionId);
      if (!entity) return;

      console.log("🔄 Player CHANGED → sessionId:", sessionId, "microPos:", serverPlayer.microPos, "y:", serverPlayer.y);

      const newX = this.getMicroPosX(serverPlayer.microPos);
      if (entity.container.x !== newX) {
        if (sessionId === this.localSessionId) this.isAnimating = true;
        this.tweens.add({
          targets: entity.container,
          x: newX,
          duration: 150,
          ease: 'Cubic.easeOut',
          onComplete: () => { if (sessionId === this.localSessionId) this.isAnimating = false; }
        });
      }

      if (serverPlayer.isDead) entity.container.setAlpha(0);
      if (Math.abs(entity.container.y - serverPlayer.y) > 50) {
        entity.container.y = serverPlayer.y;
      }
      if (sessionId === this.localSessionId) this.updateUI(serverPlayer);
    });

    // Room messages
    room.onMessage("dilemma_start", () => {
      this.dilemma.active = true;
      this.dilemma.timer = 3000;
      this.events.emit('dilemma_start');
    });
    room.onMessage("dilemma_end", () => {
      this.dilemma.active = false;
      this.events.emit('dilemma_end');
    });
    room.onMessage("chomp", (msg) => this.showFloatingText(msg || "CHOMP!", 0x4caf50));
    room.onMessage("eaten", (msg) => this.triggerDeath(msg || "EATEN!"));
    room.onMessage("coop_success", (msg) => this.showFloatingText(msg, 0x2196f3));
    room.onMessage("finished", () => this.winGame());
    room.onMessage("race_reset", () => window.location.reload());

    console.log("✅ All Colyseus 0.17 listeners registered (official native style)");
  }

  // ALL OTHER METHODS UNCHANGED
  createCharacter(type: Species, microPos: number, y: number): Phaser.GameObjects.Container {
    let color, emoji;
    if (type === 'BUG') { color = 0x4caf50; emoji = '🐛'; }
    else if (type === 'MAN') { color = 0x2196f3; emoji = '🏃‍♂️'; }
    else { color = 0xf44336; emoji = '🧛‍♂️'; }
    const body = this.add.circle(0, 0, 24, color).setStrokeStyle(3, 0xffffff);
    const icon = this.add.text(0, 0, emoji, { fontSize: '30px' }).setOrigin(0.5);
    return this.add.container(this.getMicroPosX(microPos), y, [body, icon]);
  }

  getMicroPosX(index: number): number { return index * MICRO_WIDTH + (MICRO_WIDTH / 2); }

  getZoneInfo(index: number) {
    if (index <= 17) return { name: 'BUG (Guest)', speed: ZONE_SPEEDS.BUG, type: 'BUG' };
    if (index <= 23) return { name: 'MAN', speed: ZONE_SPEEDS.MAN, type: 'MAN' };
    return { name: 'KLAUS', speed: ZONE_SPEEDS.KLAUS, type: 'KLAUS' };
  }

  updateUI(serverPlayer: any) {
    const info = this.getZoneInfo(serverPlayer.microPos);
    this.events.emit('zone_changed', info.name, info.speed);
  }

  isBarrierSolid(barrierNum: number, yPos: number): boolean {
    const offset = barrierNum === 2 ? 600 : 0;
    const localY = ((yPos - offset) % B_CYCLE + B_CYCLE) % B_CYCLE;
    return localY < B_SOLID;
  }

  sendMove(direction: number) {
    const localEntity = this.playerEntities.get(this.localSessionId);
    if (!localEntity) return;
    const currentMicroPos = localEntity.serverState.microPos;
    const targetM = currentMicroPos + direction;
    if (targetM < 0 || targetM >= TOTAL_MICRO) return;

    let barrierCrossed = 0;
    if ((currentMicroPos === 17 && targetM === 18) || (currentMicroPos === 18 && targetM === 17)) barrierCrossed = 1;
    if ((currentMicroPos === 23 && targetM === 24) || (currentMicroPos === 24 && targetM === 23)) barrierCrossed = 2;

    if (barrierCrossed > 0 && this.isBarrierSolid(barrierCrossed, localEntity.container.y)) {
      this.isAnimating = true;
      const bumpOffset = direction * 15;
      this.tweens.add({
        targets: localEntity.container,
        x: this.getMicroPosX(currentMicroPos) + bumpOffset,
        duration: 50,
        yoyo: true,
        ease: 'Sine.easeInOut',
        onComplete: () => { this.isAnimating = false; }
      });
      return;
    }
    this.room.send("move", direction);
  }

  winGame() {
    this.isFinished = true;
    const localEntity = this.playerEntities.get(this.localSessionId);
    if (!localEntity) return;
    this.add.rectangle(localEntity.container.x, localEntity.container.y, 2000, 2000, 0x000000, 0.8).setDepth(999);
    this.add.text(localEntity.container.x, localEntity.container.y - 100, 'STAGE CLEARED!\nYou Advance', { fontSize: '40px', color: '#4caf50', fontStyle: 'bold', align: 'center' }).setOrigin(0.5).setDepth(1000);
  }

  triggerDeath(msg: string) {
    this.isDead = true;
    const localEntity = this.playerEntities.get(this.localSessionId);
    if (!localEntity) return;
    localEntity.container.setAlpha(0);
    this.showFloatingText(msg, 0xf44336);
    this.add.text(localEntity.container.x, localEntity.container.y - 100, 'GAME OVER\nWait for global reset', { fontSize: '32px', color: '#ff0000', fontStyle: 'bold', align: 'center', backgroundColor: '#000000aa' }).setOrigin(0.5).setDepth(1000);
  }

  showFloatingText(msg: string, color: number) {
    const localEntity = this.playerEntities.get(this.localSessionId);
    if (!localEntity) return;
    const floatText = this.add.text(localEntity.container.x, localEntity.container.y - 50, msg, { fontSize: '24px', color: `#${color.toString(16).padStart(6, '0')}`, fontStyle: 'bold', align: 'center' }).setOrigin(0.5).setDepth(200);
    this.tweens.add({ targets: floatText, y: floatText.y - 80, alpha: 0, duration: 1500, onComplete: () => floatText.destroy() });
  }

  update(time: number, delta: number) {
    if (!this.room) return;

    this.playerEntities.forEach((entity) => {
      if (entity.serverState.isDead || entity.serverState.isFinished) return;
      const speed = this.getZoneInfo(entity.serverState.microPos).speed;
      entity.container.y -= (speed * delta) / 1000;
    });

    if (this.dilemma.active) {
      this.dilemma.timer -= delta;
      this.events.emit('dilemma_update', this.dilemma.timer);
    }

    if (this.cursors && !this.isAnimating && !this.isDead && !this.isFinished) {
      if (Phaser.Input.Keyboard.JustDown(this.cursors.right)) this.sendMove(1);
      else if (Phaser.Input.Keyboard.JustDown(this.cursors.left)) this.sendMove(-1);
    }

    const localEntity = this.playerEntities.get(this.localSessionId);
    if (localEntity) {
      const cam = this.cameras.main;
      cam.centerOn(localEntity.container.x, localEntity.container.y - (cam.height / cam.zoom) * 0.25);
    }

    this.drawRoad();
  }

  drawRoad() {
    this.roadGraphics.clear();
    const view = this.cameras.main.worldView;
    const startY = view.top - 200;
    const endY = view.bottom + 200;

    for (let i = 0; i <= TOTAL_MICRO; i++) {
      const x = i * MICRO_WIDTH;
      if (x === BARRIER_1_X || x === BARRIER_2_X) continue;
      if (i % MICRO_PER_LANE === 0) this.roadGraphics.lineStyle(3, 0xffffff, 0.8);
      else this.roadGraphics.lineStyle(1, 0xffffff, 0.3);
      this.roadGraphics.beginPath();
      this.roadGraphics.moveTo(x, startY);
      this.roadGraphics.lineTo(x, endY);
      this.roadGraphics.strokePath();
    }

    this.roadGraphics.fillStyle(0xffffff, 1);
    const startCycle = Math.floor(startY / B_CYCLE);
    const endCycle = Math.ceil(endY / B_CYCLE);

    for (let k = startCycle; k <= endCycle; k++) {
      const cycleY = k * B_CYCLE;
      this.roadGraphics.fillRect(BARRIER_1_X - 4, cycleY, 8, B_SOLID);
      this.roadGraphics.fillRect(BARRIER_2_X - 4, cycleY + 600, 8, B_SOLID);
    }

    if (FINISH_LINE_Y >= startY && FINISH_LINE_Y <= endY + 200) {
      const sqSize = 30;
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < (TOTAL_MICRO * MICRO_WIDTH) / sqSize; col++) {
          const color = (row + col) % 2 === 0 ? 0xffffff : 0x000000;
          this.roadGraphics.fillStyle(color, 1);
          this.roadGraphics.fillRect(col * sqSize, FINISH_LINE_Y - (row * sqSize), sqSize, sqSize);
        }
      }
    }
  }
}