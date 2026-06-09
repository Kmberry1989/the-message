# Asset Placement Guide

Use this folder structure when replacing placeholders with your real 3D files.

## Browser path rule

Files go inside `public/assets/...`, but code references them as `/assets/...`.

Example filesystem path:

```text
public/assets/models/props/interactables/crt_tv_old_tube.glb
```

Browser/manifest path:

```text
/assets/models/props/interactables/crt_tv_old_tube.glb
```

## Main character FBX

Place the FBX file here:

```text
public/assets/models/characters/killer/creeper.fbx
```

Place external animation FBX files here:

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

The loader now includes `FBXLoader` and has a runtime override for:

```text
killer_creeper
killer_base_rig
killer_outfit_janitor_coveralls
killer_outfit_torn_business_suit
killer_outfit_rubber_apron
```

Those entries will look for `creeper.fbx` even if older manifest entries still point at placeholder GLBs.

## Draco GLB / GLTF support

Compressed `.glb` and `.gltf` files are loaded through `GLTFLoader` with `DRACOLoader`.

Your Draco-enabled GLBs can be placed in the folders below and referenced by existing asset IDs.

## First-person player hands

```text
public/assets/models/characters/player/first-person/hands_blue_plaid_neutral.glb
public/assets/models/characters/player/first-person/hands_blue_plaid_phone_blank.glb
public/assets/models/characters/player/first-person/hands_blue_plaid_phone_calling_green.glb
public/assets/models/characters/player/first-person/hands_blue_plaid_phone_security_static.glb
public/assets/models/characters/player/first-person/hands_blue_plaid_fists.glb
```

The loader has runtime path overrides for the existing player hand asset IDs.

## Interactable props

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

## Architecture and windows

```text
public/assets/models/environment/architecture/door_exit_back.glb
public/assets/models/environment/architecture/window_dirty_no_curtains.glb
public/assets/models/environment/architecture/window_blinds_rolled_up.glb
public/assets/models/environment/architecture/window_blinds_rolled_down_open.glb
public/assets/models/environment/architecture/window_blinds_closed.glb
```

## Furniture and bedroom set

```text
public/assets/models/props/furniture/
```

Examples:

```text
bedroom_bed.glb
bedroom_nightstand.glb
bedroom_dresser.glb
bedroom_mirror.glb
bedroom_rug.glb
bedroom_wall_art.glb
end_table_antique.glb
chair_tufted.glb
sofa_antique.glb
bookshelf_old.glb
```

## Clutter and horror props

```text
public/assets/models/props/clutter/
```

Examples:

```text
red_used_mechanic_rags_wadded.glb
wadded_kleenex_set.glb
trash_bag_black.glb
old_newspapers_stack.glb
hanging_cords_bundle.glb
cleaning_supplies_set.glb
basement_water_heater.glb
basement_pipe_set.glb
```

## Outdoor set

```text
public/assets/models/environment/outdoor/
```

Examples:

```text
fence_wood_picket.glb
gate_wood.glb
shed_weathered_front.glb
wood_pallet.glb
rust_barrel.glb
wheelbarrow.glb
keep_out_sign.glb
```

## UI, textures, and audio

```text
public/assets/ui/
public/assets/textures/
public/assets/audio/
```

## Current code behavior

If a real asset is missing or fails to load, the runtime fallback system creates a primitive placeholder so the prototype still runs on GitHub and Vercel.
