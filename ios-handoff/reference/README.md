# Reference TypeScript

Portable modules copied from the Phaser Telegram client. **No Phaser imports.**

When copying into the Expo app:

1. Copy `config/` → `src/config/`
2. Copy `utils/` → `src/utils/`
3. Copy `net/types.ts` → `src/net/types.ts`
4. Fix imports: `characterAssets.ts` and `raceRoster.ts` expect `../utils/constants` — use the portable `constants.ts` here, not the web `layout.ts` version.

Do not edit tuning values in the iOS app — keep parity with the web game.
