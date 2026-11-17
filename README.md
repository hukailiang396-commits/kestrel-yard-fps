# kestrel-yard-fps

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/hukailiang396-commits/kestrel-yard-fps/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/hukailiang396-commits/kestrel-yard-fps/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

KESTREL — a round-based tactical first-person shooter in three.js, built for the make.fun `best-game-01` bounty. Single-player against bots, from static files — no build step, no network requests.

**Kestrel Yard** is a decommissioned desert relay station at dusk. Vanguard (amber) attacks, Sentinel (teal) defends. First to 8 rounds takes the match.

- **5v5 rounds** — you plus 4 Vanguard bots vs 5 Sentinel bots. Round timer 100 s, buy phase 15 s before each round.
- **Objective** — plant the charge at Site A or Site B (hold E, 3 s), or eliminate the other team. A planted charge detonates in 35 s unless a Sentinel defuses it (5 s).
- **Economy** — start $800, kill +$300, round win +$3,250, round loss +$1,900 (loss streak bonus up to $3,400). Buy menu (B): 5 weapons, 3 grenades, Kevlar.
- **Gunplay** — hitscan with head/body/leg hitboxes (head ×4), recoil and spread that grow while firing and moving, acceleration-based movement, crouch (Ctrl) and collision with the map. Reload (R), walk slow (Shift).
- **Grenades** — G cycles flash / smoke / frag, left click throws. Flash blinds bots, smoke blocks sight lines, frag deals area damage.
- **Bots** — waypoint routes through three lanes (A Long, Mid, B Tunnels), hold angles, rotate toward gunfire, plant and defuse, react in 350–600 ms with distance-scaled accuracy.
- **HUD** — health, ammo, round timer, score, money, alive counts, kill feed, dynamic crosshair, hitmarker, plant/defuse bar, scoreboard (Tab).

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

## Layout

- `game/index.html` — the page and HUD
- `game/src/main.js` — boot, fixed 60 Hz loop, rendering, screenshot poses
- `game/src/sim.js` — the simulation: one state store (rounds, economy, charge, grenades)
- `game/src/world.js` — Kestrel Yard: map, colliders, waypoint graph, line of sight
- `game/src/bots.js` — bot AI (routes, holds, rotations, plant/defuse, firefights)
- `game/src/player.js` — movement, crouch, AABB collision
- `game/src/weapons.js` — weapon/grenade tables and the buy economy
- `game/src/audio.js` — synthesised WebAudio sounds (no audio files)
- `game/src/hud.js` — DOM HUD
- `game/src/input.js` — keyboard, mouse, pointer lock
- `game/src/palette.js` — the dusk palette
- `main.ts` — the entry program: copies `game/` + `screenshots/` to `/output` and writes `dossier.json`

Screenshots are deterministic poses of the game's own code: `?shot=start` (spawn, buy menu), `?shot=play` (mid firefight), `?shot=plant` (Site A plant), `?shot=end` (match scoreboard).

## License

MIT. three.js 0.187.0 is vendored under `game/vendor/three/` per the bounty kit.

---

<sub>Entered on [make.fun](https://make.fun/?ref=k4tsp99y&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
