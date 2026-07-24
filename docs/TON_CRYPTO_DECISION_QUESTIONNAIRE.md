# BugEaters TON Integration — Decision Questionnaire

**Status:** Product direction largely set — finale format + progressive numbers tunable at launch  
**Spec:** [`TON_WEEKLY_TOURNAMENT_MODEL.md`](./TON_WEEKLY_TOURNAMENT_MODEL.md)

---

## Answered ✅

| Topic | Answer |
|-------|--------|
| Monday | Web2 only |
| Modes | Multiplayer only |
| Pass | Burn on use; one pass = one race |
| Pass distribution | **Dynamic + progressive** — forgiving early, **stricter toward Sunday** |
| **Sunday** | **≤6 Saturday rooms**; winner-only → **≤6 Sunday passes** |
| Pass role | **Random** Bug/Human/Klaus on **Tue–Sun**; **Monday = player picks** |
| Sub-lanes | **3 per main lane** for now; dynamic scaling **deferred** |
| Champion ad | **Monday in-race billboards** on **shoulders** (off lanes, near lamp strips) |
| Champion burn / TON / other | **Deferred** — not deciding now |
| Unlinked wallet | **Forfeit** |
| Min room size | **6** |
| Scheduling | Tap ready + time preference + timezones |
| Wallets | TON Connect; one linked wallet |

---

## Reference math (static top 3)

If every day were top 3: **384 Monday → 6 Sunday** (one room).  
Progressive rules + global single winner change this — tables are planning hints only.

---

## Still open (implementation detail)

1. **1-player Sunday** — auto-win or still race?  
2. **Progressive curve** + global advancement budget (config)  
3. **Billboard creative spec** — dimensions, link taps, #ad label  
4. **Sponsored message moderation** policy  
5. **Monday scheduling** — ready waves vs open queue  

**Resolved:** Max **6 Saturday rooms** globally; no overflow selection for Sunday passes.

---

## Explicitly deferred ⏸️

- Champion fixed burn bundle  
- TON prize pool  
- Champion NFT tradability rules  
- Royalty / fee flywheel  

---

*No code until implementation approved.*
