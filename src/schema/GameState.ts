import { Schema, type, MapSchema } from "@colyseus/schema";

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