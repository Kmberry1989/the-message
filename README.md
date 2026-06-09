# DID YOU GET MY MESSAGE? — GitHub/Vercel Prototype v0.2

Mobile-first Three.js survival-horror prototype prepared for GitHub and Vercel. This version adds a real asset pipeline, placeholder sidecar files, runtime primitive fallbacks, level JSON, and Draco-enabled GLB/GLTF loading.

## Run locally

```bash
npm install
npm run dev
```

Open the local Vite URL.

## Build

```bash
npm run build
npm run preview
```

## Vercel

Import this repo into Vercel. The included `vercel.json` uses:

- Build command: `npm run build`
- Output directory: `dist`
- Framework: Vite

## Asset replacement workflow

All expected assets are declared in:

```text
public/assets/manifest.json
```

Every asset currently has a `.placeholder.json` sidecar file in the same destination folder. Replace the sidecar with the real asset file named exactly as the `path` in the manifest.

Example:

```text
public/assets/models/props/interactables/crt_tv_old_tube.placeholder.json
```

Replace/add:

```text
public/assets/models/props/interactables/crt_tv_old_tube.glb
```

If the file is missing or fails to load, the game uses its fallback primitive.

## Draco GLB support

`src/asset-system.js` uses:

```js
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
```

The manifest currently points Draco decoding to:

```text
https://www.gstatic.com/draco/versioned/decoders/1.5.7/
```

To self-host decoders, place Draco files in `public/draco/` and change `decoderPath` in `public/assets/manifest.json` to `/draco/`.

## Level files

Levels live in:

```text
levels/level-01-mansion.json
```

The level file controls grid collision/pathfinding, object placement, cameras, patrol nodes, lighting, audio, difficulty, and win conditions.

## Current prototype features

- Vite project structure
- Three.js rendering
- Tap-to-move grid/BFS pathfinding
- Drag-look first-person camera
- Stamina and sprinting
- Basic killer AI states
- Pills, wardrobes, exit, router frenzy, distractions
- Phone overlay with blank/camera/calling states
- Manifest-driven asset loading
- Draco-enabled GLB loading
- Runtime primitive fallbacks for missing assets
- Placeholder sidecar files for the full discussed asset list
