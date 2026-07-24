/**
 * Loads KEY=VALUE pairs from a .env file into process.env.
 * Avoids adding a dotenv dependency.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadEnvFile(relativePath: string, overwrite = false): void {
  const fullPath = resolve(process.cwd(), relativePath);
  if (!existsSync(fullPath)) {
    return;
  }
  const text = readFileSync(fullPath, 'utf8');
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined || overwrite) {
      process.env[key] = value;
    }
  }
}

/**
 * Loads server/.env and overwrites matching keys so a leftover shell PORT=
 * cannot silently bind the race server to the wrong port.
 */
export function loadServerEnv(): void {
  loadEnvFile('server/.env', true);
  loadEnvFile('.env', false);
}
