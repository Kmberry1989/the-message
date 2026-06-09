# Codex Instructions for DID YOU GET MY MESSAGE?

This repository is a mobile-first Three.js/Vite survival-horror prototype titled **DID YOU GET MY MESSAGE?**. Treat this file as the working implementation guide for future code changes.

## Project Goal

Build a playable, mobile-browser-first, first-person survival horror game with:

- Tap-to-move navigation using grid/BFS pathfinding.
- Drag-look first-person camera.
- Sprint/stamina/exhaustion mechanics.
- A killer AI with patrol, chase, search, distraction, and frenzy states.
- Phone UI with camera feeds, calling, power-off, low battery, and danger consequences.
- Manifest-driven asset loading with runtime fallbacks.
- Draco-enabled GLB/GLTF loading.
- FBX support for the killer model and separate external FBX animation files.
- Vercel-ready deployment.

## Tech Stack

- Vite
- Three.js
- JavaScript ES modules
- CSS/HTML overlay UI
- Static assets under `public/assets/`
- Level data under `levels/`

Do not add React, Firebase, backend services, or heavyweight frameworks unless explicitly requested.

## Important Files

```text
index.html
src/main.js
src/asset-system.js
src/style.css
levels/level-01-mansion.json
public/assets/manifest.json
ASSET_PLACEMENT.md
prototype-check.js
vercel.json
```

## Run Commands

```bash
npm install
npm run dev
npm run check
npm run build
```

`npm run check` must continue to pass after changes.

## Asset Loading Requirements

### GLB / GLTF

Use `GLTFLoader` with `DRACOLoader` for all `.glb` and `.gltf` files.

The current loader must keep support for:

```js
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
```

Draco decoder path is defined in `public/assets/manifest.json`.

### FBX

Use `FBXLoader` for `.fbx` files.

The killer model is expected at:

```text
public/assets/models/characters/killer/creeper.fbx
```

The browser path is:

```text
/assets/models/characters/killer/creeper.fbx
```

Do not prefix asset URLs with `public/` in code or JSON.

### Killer External Animations

The killer uses separate FBX animation files here:

```text
public/assets/models/characters/killer/animations/idle.fbx
public/assets/models/characters/killer/animations/walk.fbx
public/assets/models/characters/killer/animations/chase.fbx
public/assets/models/characters/killer/animations/run.fbx
public/assets/models/characters/killer/animations/search.fbx
public/assets/models/characters/killer/animations/attack.fbx
public/assets/models/characters/killer/animations/phone-check.fbx
public/assets/models/characters/killer/animations/stunned.fbx
```

Animation browser paths must be:

```text
/assets/models/characters/killer/animations/<name>.fbx
```

### Runtime Fallbacks

Never remove runtime fallbacks. If an asset is missing or fails to load, the game must still run using primitive placeholder geometry.

Fallback types are defined in `public/assets/manifest.json` under `fallbacks`.

## Asset Folder Structure

Use this exact structure for real assets:

```text
public/assets/models/characters/killer/
public/assets/models/characters/killer/animations/
public/assets/models/characters/player/first-person/
public/assets/models/props/interactables/
public/assets/models/props/furniture/
public/assets/models/props/clutter/
public/assets/models/environment/architecture/
public/assets/models/environment/outdoor/
public/assets/ui/
public/assets/textures/
public/assets/audio/
```

See `ASSET_PLACEMENT.md` for the human-facing placement guide.

## First-Person Player Hands

These files should be supported:

```text
public/assets/models/characters/player/first-person/hands_blue_plaid_neutral.glb
public/assets/models/characters/player/first-person/hands_blue_plaid_phone_blank.glb
public/assets/models/characters/player/first-person/hands_blue_plaid_phone_calling_green.glb
public/assets/models/characters/player/first-person/hands_blue_plaid_phone_security_static.glb
public/assets/models/characters/player/first-person/hands_blue_plaid_fists.glb
```

Use the existing asset IDs in the manifest/loader:

```text
player_fp_hands_blue_plaid_neutral
player_fp_hands_blue_plaid_phone_blank
player_fp_hands_blue_plaid_phone_calling_green
player_fp_hands_blue_plaid_phone_security_static
player_fp_hands_blue_plaid_fists
```

## Interactable Gameplay Assets

Support these core interactable model paths:

```text
public/assets/models/props/interactables/crt_tv_old_tube.glb
public/assets/models/props/interactables/thermostat_analog_wall.glb
public/assets/models/props/interactables/mailbox_rural_blue_flag_down.glb
public/assets/models/props/interactables/mailbox_rural_blue_flag_up.glb
public/assets/models/props/interactables/wifi_router_black_on.glb
public/assets/models/props/interactables/wifi_router_black_off.glb
public/assets/models/props/interactables/security_camera_dome.glb
public/assets/models/props/interactables/security_camera_bullet.glb
public/assets/models/props/interactables/security_camera_corner.glb
public/assets/models/props/interactables/wardrobe_antique_closed.glb
public/assets/models/props/interactables/wardrobe_antique_open.glb
public/assets/models/props/interactables/medicine_pill_bottle_cyan.glb
```

## Coding Rules

1. Keep the game mobile-first.
2. Preserve tap-to-move and drag-look controls.
3. Keep UI as HTML/CSS overlays unless explicitly asked otherwise.
4. Keep the game playable even when all real assets are missing.
5. Do not hard-code binary asset imports from `src/`; load them from `public/assets/` by URL.
6. Keep level data separate from engine code.
7. Keep gameplay object behavior driven by `type` and `asset` fields in level JSON.
8. Keep `public/assets/manifest.json` as the canonical list of known asset IDs.
9. Prefer small, focused modules over large rewrites.
10. After any change, ensure `npm run check` and `npm run build` can pass.

## Current Known Issue / Improvement Target

The level currently still references the older killer asset ID in runtime logic in places. Because the loader has runtime overrides, this works, but the ideal final state is:

- `levels/level-01-mansion.json` includes:

```json
"killerAsset": "killer_creeper"
```

- `src/main.js` loads:

```js
const killerAsset = data.killerAsset || 'killer_creeper';
const killerMesh = await assets.instantiate(killerAsset, ...);
```

Make this change when editing level loading next.

## Next Implementation Priorities

### Priority 1: Asset Integration

- Confirm `creeper.fbx` loads at runtime.
- Confirm external FBX animation files load without crashing.
- Add an `AnimationMixer` for the killer.
- Map killer AI states to animation clips:
  - `patrol` -> `walk`
  - `chase` -> `chase` or `run`
  - `search` -> `search`
  - `distracted` -> `phoneCheck` if call distraction, otherwise `idle`
  - caught/player death -> `attack`

### Priority 2: First-Person Hands

- Load first-person hand GLBs as children of the camera.
- Switch hand model based on phone state:
  - normal: `player_fp_hands_blue_plaid_neutral`
  - phone open blank: `player_fp_hands_blue_plaid_phone_blank`
  - calling: `player_fp_hands_blue_plaid_phone_calling_green`
  - camera feed: `player_fp_hands_blue_plaid_phone_security_static`
  - struggle/fists: `player_fp_hands_blue_plaid_fists`

### Priority 3: Prop State Swaps

When interacting with props, swap assets if a state-specific model exists:

- Router on -> router off
- Mailbox flag down -> flag up
- Blinds open/rolled down -> blinds closed
- Wardrobe closed -> wardrobe open when hiding

State swaps should not break the fallback system.

### Priority 4: Level Data Cleanup

- Keep all object placement in `levels/level-01-mansion.json`.
- Avoid duplicating object positions in `src/main.js`.
- Keep grid/pathfinding collision stable even as visual GLBs improve.

### Priority 5: Audio Layer

Add audio loading only after visual assets are stable.

Expected audio categories:

```text
public/assets/audio/player/
public/assets/audio/killer/
public/assets/audio/phone/
public/assets/audio/interactions/
public/assets/audio/ambience/
public/assets/audio/ui/
```

Maintain procedural/fallback audio if real audio files are missing.

## Git / Sync Guidance

The remote repo may have changes committed directly by ChatGPT. If local and remote branches diverge, use a merge pull rather than a hard reset unless the user explicitly wants to discard local work.

Recommended safe sync:

```bash
git status
git add .
git commit -m "Save local work before syncing"
git pull --no-rebase origin main
git push origin main
```

Do not recommend `git reset --hard` unless the user clearly wants to erase local changes.

## Deployment Notes

This repo targets Vercel as a static Vite app.

- Build command: `npm run build`
- Output directory: `dist`
- Keep public asset URLs root-relative.
- Large binary assets may require Git LFS or asset compression later.

## Tone of Changes

This is a prototype, but it should remain organized like a real game project. Preserve the survival horror design direction: dark mansion, procedural tension, phone risk/reward, stealth, hiding, and a threatening pursuing killer.
