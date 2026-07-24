# BugEaters — Tournament UI Brief (Stub)

**Status:** Placeholder — **vision rules exist; screens do not**  
**Priority:** Required before tournament client sprint  
**Rules reference:** [`TOURNAMENT_SYSTEM_SPEC.md`](./TOURNAMENT_SYSTEM_SPEC.md)  
**Principle:** **Do not hardcode** caps, ratios, or curves in UI — fetch week state + `game_config` from backend.

---

## Why this doc exists

Stakeholder: **“We need much better UI.”** Current Phaser scenes are a **prototype shell**, not a tournament product. This stub lists **required surfaces** so a designer or client engineer can fill in flows without inventing product rules.

**Replace stub sections with wireframes, copy, and state diagrams when ready.**

---

## Global UX principles

1. **One glance:** player knows *today’s weekday*, *what they need to play*, *what they hold*.
2. **Crypto only when needed:** Monday hides wallet; Tuesday+ surfaces connect/link/burn clearly.
3. **Burn is explicit:** never silent pass consumption; confirm at lobby ready-to-start.
4. **Role surprise is intentional:** Tue–Sun show assigned species prominently before race.
5. **Failures are actionable:** every block state tells user what to do next.
6. **Adaptive copy:** use API values (`max_sunday_slots`, ratio labels) not hardcoded “6” in strings where ops may tune.

---

## Screen inventory (to design)

| # | Screen / modal | When shown | Must show |
|---|----------------|------------|-----------|
| 1 | **Week hub** | App open / menu | Week #, today, next event, CTA |
| 2 | **Monday register** | Mon, no race yet | Time slots, timezone, confirm |
| 3 | **Character pick** | Mon only | Bug / Human / Klaus |
| 4 | **Wallet connect** | Tue+ first time | TON Connect, link status |
| 5 | **Pass inventory** | Tue+ | Passes by day, week expiry, sell hint |
| 6 | **Ready panel** | Tue+ queue | Ready toggle, time preference |
| 7 | **Lobby v2** | Race forming | Humans only, roles, burn CTA, countdown |
| 8 | **Burn pass modal** | Lobby ready phase | Cost, day, irreversible warning |
| 9 | **Role reveal** | Post-burn | Species + lane hint |
| 10 | **End / advancement** | Post-race | Pass earned? link wallet? Sun qual? |
| 11 | **Sunday finale** | Sun | Global badge, 1–N roster |
| 12 | **Champion dashboard** | Sun winner | Billboard upload, transfer rights |
| 13 | **Spectator** | Sun non-finalist | **MAY CHANGE** |

---

## State machine (client — draft)

```
                    ┌─────────────┐
                    │  Week hub   │
                    └──────┬──────┘
           Monday          │           Tue–Sun
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        [Register]   [Need wallet]  [Need pass]
              │            │            │
              ▼            ▼            ▼
        [Pick role]    [Connect]    [Get pass / market]
              │            │            │
              └────────────┼────────────┘
                           ▼
                      [Tap ready]
                           ▼
                      [Notification]
                           ▼
                      [Lobby]
                           ▼
                   [Burn pass modal]
                           ▼
                   [Role reveal]
                           ▼
                      [Race]
                           ▼
                   [Results / advance]
```

---

## Visual quality bar (qualitative)

Current UI: functional text on black. Target:

- Telegram Mini App native feel (safe area, haptics optional)
- Strong typography hierarchy for countdown / burn / role
- Loading and empty states for every async (wallet, mint, join)
- B&W race aesthetic preserved; UI chrome can add minimal red accent (blood brand)
- Billboards on Monday: readable at scroll speed, sponsored label visible

---

## Open design decisions

- Week hub vs extend `MenuScene`?
- HTML overlay (TON Connect, forms) vs pure Phaser?
- Notification deep-link → lobby directly?
- Localization?

---

*Expand this document before client implementation. Rules live in `TOURNAMENT_SYSTEM_SPEC.md`.*
