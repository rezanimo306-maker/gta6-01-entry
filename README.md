# SOLCOSTA — Streets of Gold

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/rezanimo306-maker/gta6-01-entry/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/rezanimo306-maker/gta6-01-entry/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An open-world crime game in the spirit of GTA 6, built for the
[make.fun bounty gta6-01](https://make.fun/bounty/gta6-01) — a complete,
original, sun-soaked city you can explore on foot and by car.

You are **Milo Reyes**, a getaway driver back in Solcosta with a debt to the
fixer **Vera Kross** and a city that owes you nothing. Steal cars, outrun the
Solcosta PD, run five story jobs for Vera, and take the gold sports car of
kingpin **Silas Vane** — then the city is yours.

## What is in the game

- **A city to explore** — procedural Solcosta: 9×9 blocks of buildings, palms,
  a beach and sea, a downtown skyline, a garage, docks, a mansion, a hospital
  and a police HQ, all original.
- **On foot and by car** — walk, sprint, jump and punch; steal any stopped car
  and drive it with arcade handling, handbrake drifts and a horn.
- **Traffic and pedestrians** — cars cruise the road grid and turn at
  intersections; pedestrians stroll the sidewalks and scatter when shots ring out.
- **A wanted level and police** — steal, hit pedestrians or shoot and the stars
  climb; pursuit cars ram you, foot officers chase you down, and hiding cools
  the heat off one star at a time.
- **Missions and a story** — five jobs with a timer, a shootout, a getaway and
  a finale, each paying out cash that saves to your browser.
- **Combat** — fists and a pistol with tracers, against gangsters and police.
- **A HUD with a minimap** — health, cash, wanted stars, the current objective
  with a countdown, a speedometer and a live top-down map with a mission beacon.
- **Sound and music** — every sound is synthesized live with WebAudio: engine
  hum, sirens, gunshots and a quiet synthwave loop. No audio files.
- **A start screen and a save** — progress (cash, jobs cleared) persists in
  localStorage.

## Controls

| Keys | Action |
| --- | --- |
| W A S D | Move / drive |
| Shift | Sprint / handbrake |
| Space | Jump |
| E | Steal / enter a car, get out |
| F | Punch |
| Mouse click | Shoot (pistol) |
| 1 / 2 | Fists / pistol |
| H | Horn |
| Esc | Pause |

Drag the mouse (or click to lock the pointer) to look around.

## Play it

Serve `game/` with any static file server and open `game/index.html` in
desktop Chrome — for example:

```sh
cd game && python3 -m http.server 8080
```

No build step, no network requests: every script, texture and sound is a file
under `game/` or generated at runtime.

## Layout

- `main.ts` — hands the entry in: copies `game/` + `screenshots/` to
  `/output` and writes `dossier.json` with the kit's library.
- `game/index.html` — page shell, HUD and import map.
- `game/src/` — the game, one file per system: `main.js` (loop + camera),
  `city.js` (procedural city), `cars.js` (vehicles + traffic),
  `pedestrians.js`, `player.js`, `police.js` (wanted level),
  `missions.js` (story), `combat.js`, `hud.js` (HUD + minimap),
  `audio.js` (synthesized sound), `save.js`, `input.js`.
- `game/vendor/three.module.min.js` — vendored three.js.
- `screenshots/` — real renders of the game itself.
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.

## License

MIT — see [LICENSE](LICENSE).
