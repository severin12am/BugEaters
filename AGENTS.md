# Agent notes (BugEaters)

If you are an AI auditing or changing this repo:

1. **Read first:** [`docs/MODEL_AUDIT_GUIDE.md`](docs/MODEL_AUDIT_GUIDE.md)
2. **Product law:** [`docs/APP_MASTER_SPEC.md`](docs/APP_MASTER_SPEC.md)
3. **There are two race paths** — Solo (client sim) vs Local multiplayer / Colyseus (server sim). Do not assume parity.
4. **Auth wire protocol is duplicated** — keep `src/net/authoritative/protocol.ts` and `server/src/net/protocol.ts` in sync.
5. **Logical vs screen coords** — server uses logical px; client often needs `/ DISPLAY_DPR` or `ux()`.
6. **Fly race server must stay at 1 machine** until Redis (`fly scale count 1 -a bugeaters-race`).

Do not invent new architecture docs without updating `MODEL_AUDIT_GUIDE.md`.
