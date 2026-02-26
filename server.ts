import path from "path";
import { fileURLToPath } from "url";
import { Server, Room, Client } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { createServer } from "http";
import express from "express";
import cors from "cors";
import { Schema, type, MapSchema } from "@colyseus/schema";

const app = express();
// Force allow all CORS so the proxy doesn't block preflight requests
app.use(cors({ origin: '*' }));
app.use(express.json());

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer })
});

// --- SCHEMA ---
export class Player extends Schema {
  @type("string") type: string = "BUG";
  @type("number") microPos: number = 9;
  @type("number") y: number = 0;
  @type("boolean") isDead: boolean = false;
  @type("boolean") isFinished: boolean = false;
  @type("string") dilemmaId: string = "";
}

export class GameState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type("number") raceTimer: number = 70;
}

// --- GLOBALS ---
const ZONE_SPEEDS = { BUG: 250, MAN: 250, KLAUS: 250 };
const RACE_DURATION_SEC = 70;
const FINISH_LINE_Y = -(RACE_DURATION_SEC * ZONE_SPEEDS.BUG);
const B_CYCLE = 1200; 
const B_SOLID = 900;

const isBarrierSolid = (barrierNum: number, yPos: number): boolean => {
  const offset = barrierNum === 2 ? 600 : 0; 
  const localY = ((yPos - offset) % B_CYCLE + B_CYCLE) % B_CYCLE;
  return localY < B_SOLID; 
};

// --- ROOM ---
export class GlobalRoom extends Room<GameState> {
  maxClients = 100;
  dilemmas = new Map<string, any>();

  onCreate() {
    this.setState(new GameState());
    this.setSimulationInterval((dt) => this.update(dt), 16); 

    this.onMessage("move", (client, direction) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || p.isDead || p.isFinished || p.dilemmaId) return; 

      const targetM = p.microPos + direction;
      if (targetM < 0 || targetM >= 27) return;

      let barrierCrossed = 0;
      if ((p.microPos === 17 && targetM === 18) || (p.microPos === 18 && targetM === 17)) barrierCrossed = 1;
      if ((p.microPos === 23 && targetM === 24) || (p.microPos === 24 && targetM === 23)) barrierCrossed = 2;

      if (barrierCrossed > 0 && isBarrierSolid(barrierCrossed, p.y)) return; 
      
      p.microPos = targetM;
    });

    this.onMessage("dilemma_choice", (client, choice) => {
      const p = this.state.players.get(client.sessionId);
      if (p && p.dilemmaId) {
        const d = this.dilemmas.get(p.dilemmaId);
        if (d) {
          if (d.p1.id === client.sessionId) d.choice1 = choice;
          if (d.p2.id === client.sessionId) d.choice2 = choice;
        }
      }
    });
  }

  onJoin(client: Client) {
    const p = new Player();
    const types =["BUG", "MAN", "KLAUS"];
    p.type = types[Math.floor(Math.random() * types.length)];
    p.microPos = p.type === "BUG" ? 9 : (p.type === "MAN" ? 20 : 25);
    p.y = 0;
    this.state.players.set(client.sessionId, p);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
  }

  update(dt: number) {
    this.state.raceTimer -= dt / 1000;
    if (this.state.raceTimer <= 0) {
       this.state.raceTimer = 70;
       this.state.players.forEach(p => { p.y = 0; p.isDead = false; p.isFinished = false; p.dilemmaId = ""; });
       this.dilemmas.clear();
       this.broadcast("race_reset");
    }

    const players = Array.from(this.state.players.entries());

    players.forEach(([id, p]) => {
      if (!p.isDead && !p.isFinished) {
        const speed = p.type === "BUG" ? ZONE_SPEEDS.BUG : (p.type === "MAN" ? ZONE_SPEEDS.MAN : ZONE_SPEEDS.KLAUS);
        p.y -= (speed * dt) / 1000;
        if (p.y <= FINISH_LINE_Y) {
          p.isFinished = true;
          const client = this.clients.find(c => c.sessionId === id);
          if (client) client.send("finished");
        }
      }
    });

    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const [id1, p1] = players[i];
        const [id2, p2] = players[j];

        if (p1.isDead || p2.isDead || p1.isFinished || p2.isFinished || p1.dilemmaId || p2.dilemmaId) continue;

        if (p1.microPos === p2.microPos && Math.abs(p1.y - p2.y) < 40) {
          if (p1.type === p2.type) {
            const dId = id1 + "_" + id2;
            p1.dilemmaId = dId; p2.dilemmaId = dId;
            this.dilemmas.set(dId, {
              p1: { id: id1, player: p1 },
              p2: { id: id2, player: p2 },
              choice1: null, choice2: null,
              timer: 3000
            });
            const c1 = this.clients.find(c => c.sessionId === id1);
            const c2 = this.clients.find(c => c.sessionId === id2);
            if (c1) c1.send("dilemma_start");
            if (c2) c2.send("dilemma_start");
          } else {
            const canEat = (att: string, vic: string) => (att==='BUG'&&vic==='KLAUS')||(att==='KLAUS'&&vic==='MAN')||(att==='MAN'&&vic==='BUG');
            if (canEat(p1.type, p2.type)) {
              p2.isDead = true;
              const c1 = this.clients.find(c => c.sessionId === id1);
              const c2 = this.clients.find(c => c.sessionId === id2);
              if (c1) c1.send("chomp"); if (c2) c2.send("eaten");
            } else if (canEat(p2.type, p1.type)) {
              p1.isDead = true;
              const c1 = this.clients.find(c => c.sessionId === id1);
              const c2 = this.clients.find(c => c.sessionId === id2);
              if (c2) c2.send("chomp"); if (c1) c1.send("eaten");
            }
          }
        }
      }
    }

    this.dilemmas.forEach((d, id) => {
      d.timer -= dt;
      if (d.timer <= 0 || (d.choice1 && d.choice2)) {
        const c1 = d.choice1 || "COOP";
        const c2 = d.choice2 || "COOP";
        const client1 = this.clients.find(c => c.sessionId === d.p1.id);
        const client2 = this.clients.find(c => c.sessionId === d.p2.id);

        if (c1 === "EAT" && c2 === "EAT") {
          d.p1.player.isDead = true; d.p2.player.isDead = true;
          if (client1) client1.send("eaten", "BOTH ATE!\nMutual Destruction!");
          if (client2) client2.send("eaten", "BOTH ATE!\nMutual Destruction!");
        } else if (c1 === "EAT" && c2 === "COOP") {
          d.p2.player.isDead = true;
          if (client1) client1.send("chomp", "BETRAYAL SUCCESS!\nYou ate them!");
          if (client2) client2.send("eaten", "BETRAYED!\nYou were eaten!");
        } else if (c1 === "COOP" && c2 === "EAT") {
          d.p1.player.isDead = true;
          if (client1) client1.send("eaten", "BETRAYED!\nYou were eaten!");
          if (client2) client2.send("chomp", "BETRAYAL SUCCESS!\nYou ate them!");
        } else {
          if (client1) client1.send("coop_success", "MUTUAL COOPERATION");
          if (client2) client2.send("coop_success", "MUTUAL COOPERATION");
        }

        d.p1.player.dilemmaId = ""; d.p2.player.dilemmaId = "";
        if (client1) client1.send("dilemma_end");
        if (client2) client2.send("dilemma_end");
        this.dilemmas.delete(id);
      }
    });
  }
}

gameServer.define("global_room", GlobalRoom);
// ====================== RAILWAY PRODUCTION SETUP ======================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 2567;

// Serve the built Phaser game (dist folder)
app.use(express.static(path.join(__dirname, "dist")));

// SPA fallback (for client-side routing)
app.get('/*path', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Start Colyseus + Express on same port
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Bugeaters multiplayer live on port ${PORT}`);
  console.log(`🌐 Play here: https://${process.env.RAILWAY_PUBLIC_DOMAIN || 'your-railway-url'}`);
});