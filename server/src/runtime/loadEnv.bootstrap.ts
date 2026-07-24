/**
 * Side-effect import: loads server/.env before the rest of the process starts.
 * Import this FIRST in index.ts.
 */
import { loadServerEnv } from './loadEnv.js';

loadServerEnv();
