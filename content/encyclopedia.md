# BugEaters Encyclopedia

> **Single source of truth for in-game player copy.**  
> The Encyclopedia UI imports this file at build time. Ability **names** come from `src/config/abilities.ts`; effect text for each ability is the `### ability:<id>` block below.  
> Diagrams use `:::diagram <id>` fences rendered as stylized mono schemes in the Guide.

---

## overview | What is BugEaters?

:::diagram week-arc

BugEaters is a **weekly global tournament** inside Telegram. Real players race a near-black road as **Bug**, **Human**, or **Klaus**.

### The pitch

A lane-runner with teeth. Empty seats stay empty — **no bots** fill the room.

### How the week opens

**Monday** is free: no wallet, no NFT. From **Tuesday** you burn a day pass. **Sunday** crowns one worldwide champion with **Monday billboard** rights.

---

## week | The Tournament Week

:::diagram week-arc

The clock starts **Monday 00:00 UTC** and ends with the **Sunday finale**.

### Entry by day

**Monday** — free register and a UTC slot. Role lands at race start (about **3 Bug : 2 Human : 1 Klaus** in a full room).

**Tuesday–Friday** — burn that day’s pass; role after burn.

**Saturday** — burn to enter; up to **six rooms** worldwide, each minting a Sunday pass.

**Sunday** — burn the finale pass; one global race, one champion.

### The chain

Win Tuesday → Wednesday pass. Same ladder through the week. Saturday winners split the six Sunday tickets minted that night.

---

## monday | Monday (Web2 Day)

:::diagram monday-flow

Monday is the on-ramp. No crypto required.

### Your path

Pick a **UTC slot** (12:00, 16:00, 18:00, or 21:00), wait for it to open, enter the lobby, then ready up. When everyone present is ready, the countdown snaps to about **ten seconds**; otherwise the race still starts at the scheduled time.

### Roles & limits

You do **not** pick Bug / Human / Klaus — assignment happens at start. **One Monday race per week.** Finishers who link a wallet in time can earn a Tuesday pass.

---

## passes | Passes, Wallet & Burn

:::diagram pass-flow

From Tuesday onward the hub is wallet-gated.

### Locking in

Connect a **TON wallet**, hold today’s pass chip, tap **Ready**, then **burn** in the lobby. Burn destroys the NFT and locks your seat. Role assigns after burn — you never choose on pass days.

### Rules of the ticket

**One pass = one race.** Burning is final once the race starts. Passes can trade on-chain until that moment.

---

## lobby | Lobby & Matchmaking

:::diagram lobby

The lobby is the last calm before the road.

### What you see

Roster of who showed up, plus a countdown to the scheduled start. Tap **I’m ready** when you want to go early — full ready collapses the timer to **ten seconds**.

### Who starts

If some seats stay quiet, the race still fires at schedule with whoever is there. Solo lobbies are allowed. Monday roster shows “assigned at start”; pass days reveal your role after burn.

---

## racers | Bug, Human & Klaus

:::diagram lanes

Nine sub-lanes. Three species. Two deadly edges.

### The road

**Bug** owns the left third, **Human** the center, **Klaus** the right. Species dividers stay solid most of the time — cross and you get shoved back. They open on a race seed; **Opened Borders** forces them open. Touch the red edge and you die.

:::diagram food-chain

### The food chain

**Bug eats Human. Human eats Klaus. Klaus eats Bug.** Same-species meetings can turn into a Prisoner's Dilemma — cooperate or betray. Monday assigns roles at start; Tue–Sun after burn, still aiming for roughly **3 : 2 : 1**.

---

## racing | How to Race

:::diagram controls

Sixty seconds. Furthest progress wins. Death ends your run.

### On the asphalt

:::diagram obstacles

**Trash** slows you (auto-jump on contact). **Puddles** kick a short boost when you leave them. **Open manholes** kill; closed lids are safe.

### Other runners

Tournament rooms are humans only. Cross-species eating follows the chain. Same species can force the dilemma. Briefcases on the road fill up to three slots — see Briefcase powers.

:::diagram briefcase

---

## sunday | Saturday & Sunday

:::diagram finale

Weekend is elimination, then the crown.

### Saturday

Up to six rooms worldwide. Each room crowns one winner and mints a Sunday pass.

### Sunday

One global race for Sunday pass holders (max six). One worldwide champion walks away with next Monday’s billboard rights — transferable to a buyer.

---

## champion | Champion & Billboards

:::diagram billboard

Win Sunday and the road remembers you.

### Billboard rights

Upload creative for the following Monday. Ads sit on the **shoulders** near the lamp strips, visible to every Monday racer. Rights can transfer to another account — sponsor or marketer.

---

## abilities | Briefcase Powers

:::diagram briefcase

Collect briefcase icons on the road. You hold up to **three**; the newest slot is **armed**. Tap it in the HUD to fire. Default duration **ten seconds** unless noted.

### On the road

Names and icons match the pickups. Effects:

### ability:disable-barriers
All lane dividers stay open. Cross into any species lane for the duration.

### ability:disable-obstacles
Immune to puddles and open manholes (not trash). White ring while active.

### ability:enable-id
Tap the road to place a passport barrier ahead. Rivals must jump it.

### ability:flashlight
Forward flashlight cone cuts the dark; lamps stay dimmer around you.

### ability:flight-mode
Clears obstacles in your main lane ahead. Lab / dev spawn only in the production build.

### ability:hell-mode
Hell mode on the other two main lanes — double obstacle spawn. Your lane stays normal.

### ability:immortality
Eat immunity. Does not stop manholes or trash. Ring VFX.

### ability:needle-spawner
Throw a syringe forward. Hits kill NPCs and rivals in range.

### ability:pos-alignment
Snap your progress to rivals and align vertically — catch-up.

### ability:slowdown-other
Rivals run slower. Purple tint marks them.

### ability:speed-up
1.3× speed for ten seconds with vertical streaks (no orange booster flash).

### ability:straw-spawner
Spawn a straw obstacle ahead as a rival hazard.

---

## hub | Week Hub Screens

:::diagram hub-map

### Where you stand

**Playtest session** — sandbox week and day (dev builds).  
**Week hub** — status, passes, wallet, primary action.  
**Monday register / wait** — pick a slot, then hold for lobby.  
**Ready panel** — pass-day ready vote before lobby.  
**Lobby → Race → End** — burn, sixty seconds, results.  
**Blocked** — missing pass, wallet, wrong day, or already raced.

---

## glossary | Quick Glossary

### Pass

Week-scoped NFT ticket for one race on a given weekday.

### Burn

Destroy the pass in lobby to lock entry.

### Ready

Hub vote on Tue–Sun, or the lobby **I’m ready** button.

### Slot

Monday UTC race window.

### Sandbox week

Playtest week with isolated progress (Week 1, 2, …).

### Sub-lane

One of nine horizontal tracks (0–8).

### Briefcase

Road pickup that becomes an ability in your inventory.
