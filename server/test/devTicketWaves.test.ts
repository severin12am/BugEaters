/**
 * Playtest ticket waves: 15s join window, then a fresh Colyseus room.
 *
 * Runs with `npm run race-server:test`.
 */
import assert from 'node:assert/strict';
import { DEFAULT_RACE_CONFIG } from '../src/config/raceConfig.js';
import {
  getOrCreateRoomParams,
  PLAYTEST_JOIN_WAIT_MS,
  resetDevRoomParamsForTests,
} from '../src/dev/devTicketRoute.js';

const config = DEFAULT_RACE_CONFIG;
const lobby = 'local-practice';

resetDevRoomParamsForTests();

const now = 1_000_000;
const first = getOrCreateRoomParams(lobby, { userId: 'a' }, config, now);
const friend = getOrCreateRoomParams(lobby, { userId: 'b' }, config, now + 8_000);
assert.equal(first.startsAtMs, now + PLAYTEST_JOIN_WAIT_MS, 'default wait is 15s');
assert.equal(friend.startsAtMs, first.startsAtMs, 'friend joins the same countdown');
assert.equal(friend.raceRoomId, first.raceRoomId, 'same Colyseus room during wait');

const afterStart = first.startsAtMs + 1;
const rematch = getOrCreateRoomParams(lobby, { userId: 'dead-player' }, config, afterStart);
assert.notEqual(rematch.raceRoomId, first.raceRoomId, 'death rematch gets a new room');
assert.equal(rematch.startsAtMs, afterStart + PLAYTEST_JOIN_WAIT_MS, 'rematch waits 15s');

const friendRematch = getOrCreateRoomParams(lobby, { userId: 'friend' }, config, afterStart + 5_000);
assert.equal(friendRematch.raceRoomId, rematch.raceRoomId, 'friend rematch meets in the new wait');

resetDevRoomParamsForTests();
const reloadNow = 5_000_000;
const wave = getOrCreateRoomParams(lobby, { userId: 'reload-me' }, config, reloadNow);
wave.seats.set('reload-me', 0);
const reload = getOrCreateRoomParams(
  lobby,
  { userId: 'reload-me' },
  config,
  wave.startsAtMs + 10_000,
);
assert.equal(reload.raceRoomId, wave.raceRoomId, 'same userId can reconnect mid-race');

console.log('dev ticket waves OK');
