import './style.css';
import * as THREE from 'three';
import { AssetSystem, loadJson } from './asset-system.js';

const PLAYER_WALK_SPEED = 2.1;
const PLAYER_SPRINT_SPEED = 2.95;
const PLAYER_EXHAUSTED_SPEED = 1.45;
const PLAYER_ACCEL = 11;
const PLAYER_FRICTION = 14;
const PLAYER_RADIUS = 0.24;
const PLAYER_STAMINA_DRAIN = 15;
const PLAYER_STAMINA_RECOVERY = 18;
const PLAYER_EXHAUSTED_RECOVERY = 10;
const LOOK_SENSITIVITY = 0.0034;
const MOVE_STICK_RADIUS = 64;
const MOVE_DEADZONE = 0.18;
const PHONE_IDLE_DRAIN = 0.22;
const PHONE_OPEN_DRAIN = 0.42;
const PHONE_CALL_COST = 1.8;
const PHONE_POWER_OFF_MESSAGE = 'Phone powered off. It cannot be turned back on.';
const KILLER_CATCH_DISTANCE = 0.75;
const KILLER_SEARCH_DURATION = 8;
const KILLER_DISTRACTION_DURATION = 6;
const STRUGGLE_REQUIRED_TAPS = 12;
const STRUGGLE_MAX_TIME = 4.2;
const MAX_STUNS = 2;
const KILLER_FREE_ROAM_SECONDS = 300;
const KILLER_WAKE_DISTANCE = 2.4;
const CAMERA_LOCK_DISTANCE = 4.9;
const HEARTBEAT_DISTANCE = 6.5;
const HANDS_RAISE_DISTANCE = 6.75;

const ROOM_STYLES = {
  bedroom: { floor: '#726257', wall: '#9b8d83', light: 0xffe7c4, lightIntensity: 0.9 },
  hallway: { floor: '#675748', wall: '#93877d', light: 0xffefcf, lightIntensity: 0.85 },
  living_room: { floor: '#605444', wall: '#8e8379', light: 0xe5efff, lightIntensity: 0.75 },
  den: { floor: '#594c3f', wall: '#84796d', light: 0xffe0b5, lightIntensity: 0.92 },
  foyer: { floor: '#6d5c4d', wall: '#998b7e', light: 0xf4f4ea, lightIntensity: 0.82 }
};

const PLACEMENT_RULES = {
  medicine_pill_bottle_cyan: { mount: 'floor', y: 0.18, scale: 0.55 },
  wardrobe_antique_closed: { mount: 'floor', y: 0, scale: 1 },
  wardrobe_antique_open: { mount: 'floor', y: 0, scale: 1 },
  crt_tv_old_tube: { mount: 'floor', y: 0, scale: 0.78 },
  wifi_router_black_on: { mount: 'surface', y: 0.92, scale: 0.5 },
  wifi_router_black_off: { mount: 'surface', y: 0.92, scale: 0.5 },
  window_blinds_rolled_down_open: { mount: 'wall', y: 1.42, scale: 1 },
  window_blinds_closed: { mount: 'wall', y: 1.42, scale: 1 },
  door_exit_back: { mount: 'floor', y: 0, scale: 1 },
  security_camera_dome: { mount: 'ceiling', y: 2.45, scale: 0.55 },
  security_camera_bullet: { mount: 'ceiling', y: 2.25, scale: 0.62 },
  bedroom_bed: { mount: 'floor', y: 0, scale: 1.08 },
  lamp_table: { mount: 'surface', y: 0.84, scale: 0.62 },
  lamp_floor: { mount: 'floor', y: 0, scale: 0.95 },
  rug_persian_worn: { mount: 'floor', y: 0.02, scale: 1.22 },
  sofa_antique: { mount: 'floor', y: 0, scale: 1.08 },
  chair_tufted: { mount: 'floor', y: 0, scale: 0.92 },
  red_used_mechanic_rags_wadded: { mount: 'floor', y: 0.03, scale: 0.72 },
  wadded_kleenex_set: { mount: 'floor', y: 0.03, scale: 0.72 },
  trash_bag_black: { mount: 'floor', y: 0, scale: 0.92 },
  old_newspapers_stack: { mount: 'floor', y: 0.03, scale: 0.75 }
};

const app = document.querySelector('#app');
app.innerHTML = `
  <div id="hud">
    <div id="vignette"></div>
    <div id="topbar">
      <div class="panel" id="objective">Pills 0/3</div>
      <div class="panel" id="statusLine">Five quiet minutes.</div>
      <div class="panel"><div id="staminaWrap"><div id="stamina"></div></div></div>
    </div>
    <div class="panel" id="message">Left thumb moves. Right thumb looks. The mansion is assembled from rooms now.</div>
    <div id="subtitle"></div>
    <div id="phone">
      <div id="phoneScreen">
        <div class="phoneHeader"><span id="phoneTime">12:04 AM</span><span id="battery">12%</span></div>
        <canvas id="phoneMap" width="320" height="240"></canvas>
        <div id="phoneBody"></div>
        <div class="phoneActions">
          <button class="phoneAction" id="camBtn">CAMS</button>
          <button class="phoneAction" id="callBtn">CALL</button>
          <button class="phoneAction dark" id="closePhoneBtn">PUT AWAY</button>
          <button class="phoneAction danger" id="offBtn">OFF</button>
        </div>
      </div>
    </div>
    <div id="incomingCall" class="panel">Incoming call...</div>
    <div id="struggle" class="hidden">
      <div class="struggleInner panel">
        <h2>FIGHT BACK</h2>
        <p id="struggleCopy">Tap repeatedly to stun him.</p>
        <div class="meter"><div id="struggleMeter"></div></div>
        <div class="timer"><div id="struggleTimer"></div></div>
        <button id="struggleBtn">TAP</button>
      </div>
    </div>
    <div id="joystick">
      <div id="joystickBase"></div>
      <div id="joystickKnob"></div>
    </div>
    <div id="controls"><div class="btn" id="phoneBtn">PHONE</div><div class="btn" id="sprintBtn">SPRINT</div></div>
    <div id="debug"></div>
  </div>`;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#232730');
scene.fog = new THREE.FogExp2('#414851', 0.016);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 100);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
app.appendChild(renderer.domElement);

const ui = {
  objective: document.querySelector('#objective'),
  statusLine: document.querySelector('#statusLine'),
  stamina: document.querySelector('#stamina'),
  battery: document.querySelector('#battery'),
  debug: document.querySelector('#debug'),
  message: document.querySelector('#message'),
  subtitle: document.querySelector('#subtitle'),
  phone: document.querySelector('#phone'),
  phoneBody: document.querySelector('#phoneBody'),
  phoneMap: document.querySelector('#phoneMap'),
  phoneBtn: document.querySelector('#phoneBtn'),
  camBtn: document.querySelector('#camBtn'),
  callBtn: document.querySelector('#callBtn'),
  offBtn: document.querySelector('#offBtn'),
  closePhoneBtn: document.querySelector('#closePhoneBtn'),
  incomingCall: document.querySelector('#incomingCall'),
  phoneTime: document.querySelector('#phoneTime'),
  vignette: document.querySelector('#vignette'),
  struggle: document.querySelector('#struggle'),
  struggleCopy: document.querySelector('#struggleCopy'),
  struggleMeter: document.querySelector('#struggleMeter'),
  struggleTimer: document.querySelector('#struggleTimer'),
  struggleBtn: document.querySelector('#struggleBtn'),
  sprintBtn: document.querySelector('#sprintBtn'),
  joystick: document.querySelector('#joystick'),
  joystickKnob: document.querySelector('#joystickKnob')
};

let manifest;
let assets;
let level;
let grid = [];
let roomIndex = new Map();
let anchorIndex = new Map();
let subtitleTimer = 0;
let audioReady = false;
let sprinting = false;
let draggingLook = false;
let lookPointerId = null;
let movePointerId = null;
let assetStats = { loaded: 0, fallback: 0, recent: [] };

const blockers = [];
const interactables = [];
const dynamicSwaps = new Map();

const player = {
  x: 3,
  z: 10,
  y: 1.62,
  yaw: 0,
  pitch: 0,
  vx: 0,
  vz: 0,
  stamina: 100,
  exhausted: false,
  hidden: false,
  pills: 0,
  phoneOn: true,
  phoneBattery: 12,
  phoneOpen: false,
  hands: null
};

const inputState = {
  moveX: 0,
  moveY: 0,
  moveMagnitude: 0,
  joystickCenterX: 0,
  joystickCenterY: 0,
  knobX: 0,
  knobY: 0
};

const killer = {
  x: 4,
  z: 3,
  state: 'asleep',
  target: null,
  patrolIndex: 0,
  frenzy: false,
  searchTimer: 0,
  lastKnown: null,
  distractedByPhone: false,
  distractionTimer: 0,
  stunTimer: 0,
  stunCount: 0,
  caught: false,
  caughtCooldown: 0,
  freeRoamTimer: KILLER_FREE_ROAM_SECONDS,
  awake: false,
  bedAnchor: null,
  mixer: null,
  actions: {},
  currentClip: null,
  mesh: null
};

const phoneState = {
  incomingTimer: 18,
  incomingVisible: false,
  blinkTimer: 0
};

const struggle = {
  active: false,
  taps: 0,
  timer: STRUGGLE_MAX_TIME
};

const audioState = {
  context: null,
  master: null,
  droneGain: null,
  droneOsc: null,
  heartGain: null,
  heartOsc: null,
  beatTimer: 0
};

let lastFrame = performance.now();

function setSubtitle(text, duration = 2.8) {
  ui.subtitle.textContent = text;
  ui.subtitle.classList.add('show');
  clearTimeout(subtitleTimer);
  subtitleTimer = setTimeout(() => ui.subtitle.classList.remove('show'), duration * 1000);
}

function showMessage(text, duration = 3.4) {
  ui.message.textContent = text;
  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => {
    ui.message.textContent = 'Left thumb moves. Right thumb looks. Tap props to interact.';
  }, duration * 1000);
}

function registerAsset(object) {
  const status = object.userData.assetStatus === 'loaded' ? 'loaded' : 'fallback';
  assetStats[status] += 1;
  if (assetStats.recent.length < 6) {
    assetStats.recent.push(`${object.name}:${object.userData.assetStatusReason}`);
  }
}

function world(gx, gz) {
  return new THREE.Vector3(gx * 2, 0, gz * 2);
}

function gridToWorldX(gx) {
  return gx * 2;
}

function gridToWorldZ(gz) {
  return gz * 2;
}

function worldToGrid(x, z) {
  return { x: Math.round(x / 2), z: Math.round(z / 2) };
}

function walkable(gx, gz) {
  return grid[gz] && grid[gz][gx] && grid[gz][gx] !== '#';
}

function resolveAnchor(roomId, anchorId, fallback) {
  const room = roomIndex.get(roomId);
  const anchor = room?.anchors?.find((candidate) => candidate.id === anchorId);
  if (anchor) return anchor;
  return fallback || null;
}

function resolvePlacement(item) {
  const anchor = resolveAnchor(item.roomId, item.anchorId, item);
  if (!anchor) return null;
  return {
    x: anchor.x,
    z: anchor.z,
    rotation: anchor.rotation ?? item.rotation ?? 0
  };
}

function applyPlacementRule(model, assetId, placement) {
  const rule = PLACEMENT_RULES[assetId] || { mount: 'floor', y: 0, scale: 1 };
  model.scale.multiplyScalar(rule.scale ?? 1);
  model.position.set(gridToWorldX(placement.x), rule.y ?? 0, gridToWorldZ(placement.z));
  model.rotation.y = THREE.MathUtils.degToRad(placement.rotation || 0);
  const bounds = new THREE.Box3().setFromObject(model);
  if (!Number.isFinite(bounds.min.y)) return;
  if (rule.mount === 'floor') {
    model.position.y += 0 - bounds.min.y + (rule.y ?? 0);
  } else if (rule.mount === 'surface') {
    model.position.y = rule.y ?? 0.9;
  } else if (rule.mount === 'wall') {
    model.position.y = rule.y ?? 1.4;
  } else if (rule.mount === 'ceiling') {
    model.position.y = rule.y ?? 2.3;
  }
}

function styleKillerMesh(root) {
  root.rotation.order = 'YXZ';
  root.traverse((child) => {
    if (!child.isMesh && !child.isSkinnedMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      material.color?.offsetHSL(0, -0.05, 0.16);
      if ('emissiveIntensity' in material) {
        material.emissive = material.emissive || new THREE.Color('#140404');
        material.emissiveIntensity = 0.14;
      }
    }
  });
}

function placeHandsModel(root) {
  root.scale.multiplyScalar(0.9);
  root.rotation.set(0.12, Math.PI, 0);
  root.position.set(0.22, -0.52, -0.56);
  root.traverse((child) => {
    if (child.isMesh || child.isSkinnedMesh) {
      child.castShadow = false;
      child.receiveShadow = false;
    }
  });
  camera.add(root);
  player.hands = root;
}

async function ensureAudio() {
  if (audioReady) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const master = context.createGain();
  master.gain.value = 0.18;
  master.connect(context.destination);

  const droneOsc = context.createOscillator();
  droneOsc.type = 'sawtooth';
  droneOsc.frequency.value = 44;
  const droneFilter = context.createBiquadFilter();
  droneFilter.type = 'lowpass';
  droneFilter.frequency.value = 160;
  const droneGain = context.createGain();
  droneGain.gain.value = 0;
  droneOsc.connect(droneFilter);
  droneFilter.connect(droneGain);
  droneGain.connect(master);
  droneOsc.start();

  const heartOsc = context.createOscillator();
  heartOsc.type = 'triangle';
  heartOsc.frequency.value = 54;
  const heartGain = context.createGain();
  heartGain.gain.value = 0;
  heartOsc.connect(heartGain);
  heartGain.connect(master);
  heartOsc.start();

  Object.assign(audioState, { context, master, droneGain, droneOsc, heartGain, heartOsc, beatTimer: 0 });
  audioReady = true;
  if (context.state === 'suspended') await context.resume();
}

function setPhoneOpen(nextOpen) {
  player.phoneOpen = nextOpen && player.phoneOn;
  ui.phone.classList.toggle('on', player.phoneOpen);
  renderPhone(player.phoneOpen ? (phoneState.incomingVisible ? 'warning' : 'home') : 'home');
}

function addRoomLight(room) {
  const style = ROOM_STYLES[room.type] || ROOM_STYLES.hallway;
  const centerX = gridToWorldX(room.rect.x + room.rect.w / 2 - 0.5);
  const centerZ = gridToWorldZ(room.rect.z + room.rect.h / 2 - 0.5);
  const light = new THREE.PointLight(style.light, style.lightIntensity, Math.max(room.rect.w, room.rect.h) * 3, 2);
  light.position.set(centerX, 2.3, centerZ);
  scene.add(light);
}

function buildRooms() {
  scene.fog = new THREE.FogExp2(level.lighting?.fogColor || '#414851', level.lighting?.fogDensity ?? 0.016);
  scene.add(new THREE.AmbientLight(new THREE.Color(level.lighting?.ambient || '#c5ced8'), 0.92));
  scene.add(new THREE.HemisphereLight(0xf3f5f9, 0x6c6258, 1.05));
  const sun = new THREE.DirectionalLight(0xfff1d3, 1.08);
  sun.position.set(10, 20, 4);
  sun.castShadow = true;
  scene.add(sun);

  const flashlight = new THREE.SpotLight(0xfff4d3, 0.7, 15, Math.PI / 6, 0.42, 1.2);
  camera.add(flashlight);
  flashlight.position.set(0, 0, 0);
  flashlight.target.position.set(0, 0, -1);
  camera.add(flashlight.target);
  scene.add(camera);

  for (const room of level.rooms) {
    const style = ROOM_STYLES[room.type] || ROOM_STYLES.hallway;
    roomIndex.set(room.id, room);
    for (const anchor of room.anchors || []) anchorIndex.set(anchor.id, { ...anchor, roomId: room.id });

    const width = room.rect.w * 2;
    const depth = room.rect.h * 2;
    const centerX = gridToWorldX(room.rect.x + room.rect.w / 2 - 0.5);
    const centerZ = gridToWorldZ(room.rect.z + room.rect.h / 2 - 0.5);

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.08, depth),
      new THREE.MeshStandardMaterial({ color: style.floor, roughness: 0.92 })
    );
    floor.position.set(centerX, -0.04, centerZ);
    floor.receiveShadow = true;
    scene.add(floor);

    const ceiling = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.06, depth),
      new THREE.MeshStandardMaterial({ color: '#c7c0b5', roughness: 1 })
    );
    ceiling.position.set(centerX, 2.6, centerZ);
    scene.add(ceiling);
    addRoomLight(room);
  }

  const wallMaterial = new THREE.MeshStandardMaterial({ color: '#92867b', roughness: 0.95 });
  for (let z = 0; z < grid.length; z += 1) {
    for (let x = 0; x < grid[z].length; x += 1) {
      if (grid[z][x] !== '#') continue;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(2, 2.7, 2), wallMaterial);
      wall.position.set(gridToWorldX(x), 1.35, gridToWorldZ(z));
      wall.castShadow = true;
      wall.receiveShadow = true;
      scene.add(wall);
      blockers.push(wall);
    }
  }
}

async function instantiateLevelItem(item, isInteractable = true) {
  const placement = resolvePlacement(item);
  if (!placement) return null;
  const model = await assets.instantiate(item.asset, { name: item.id });
  applyPlacementRule(model, item.asset, placement);
  model.userData.game = item;
  registerAsset(model);
  scene.add(model);
  if (isInteractable) interactables.push({ ...item, model });
  return model;
}

function setKillerAnimation(name) {
  if (!killer.mixer) return;
  const fallbackName = name === 'chase' && !killer.actions.chase ? 'run' : name;
  const action = killer.actions[fallbackName] || killer.actions.walk || killer.actions.idle;
  if (!action || killer.currentClip === action) return;
  if (killer.currentClip) killer.currentClip.fadeOut(0.18);
  action.reset().fadeIn(0.18).play();
  killer.currentClip = action;
}

function syncKillerAnimation() {
  if (!killer.awake) return setKillerAnimation('idle');
  if (killer.caught) return setKillerAnimation('attack');
  if (killer.stunTimer > 0) return setKillerAnimation('idle');
  if (killer.state === 'chase') return setKillerAnimation('run');
  if (killer.state === 'search') return setKillerAnimation('search');
  if (killer.state === 'distracted') return setKillerAnimation(killer.distractedByPhone ? 'phoneCheck' : 'idle');
  return setKillerAnimation('walk');
}

function wakeKiller(reason) {
  if (killer.awake) return;
  killer.awake = true;
  killer.state = 'search';
  killer.searchTimer = 5;
  killer.lastKnown = { x: player.x, z: player.z };
  killer.freeRoamTimer = 0;
  setSubtitle(reason === 'timer' ? 'Five minutes are over.' : 'You woke him.');
  showMessage(reason === 'timer' ? 'Free roaming is over. He is awake.' : 'The killer wakes and starts looking for you.');
}

function updateCamera() {
  camera.position.set(player.x * 2, player.hidden ? 0.9 : player.y, player.z * 2);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
}

function movePlayer(dt) {
  const targetSpeed = player.exhausted ? PLAYER_EXHAUSTED_SPEED : (sprinting ? PLAYER_SPRINT_SPEED : PLAYER_WALK_SPEED);
  const moveMag = inputState.moveMagnitude > MOVE_DEADZONE ? (inputState.moveMagnitude - MOVE_DEADZONE) / (1 - MOVE_DEADZONE) : 0;
  const localX = inputState.moveX * moveMag;
  const localZ = -inputState.moveY * moveMag;
  const sin = Math.sin(player.yaw);
  const cos = Math.cos(player.yaw);
  const desiredVX = (localX * cos - localZ * sin) * targetSpeed;
  const desiredVZ = (localX * sin + localZ * cos) * targetSpeed;
  player.vx = THREE.MathUtils.lerp(player.vx, desiredVX, Math.min(1, dt * PLAYER_ACCEL));
  player.vz = THREE.MathUtils.lerp(player.vz, desiredVZ, Math.min(1, dt * PLAYER_ACCEL));
  if (moveMag <= 0.01) {
    player.vx = THREE.MathUtils.lerp(player.vx, 0, Math.min(1, dt * PLAYER_FRICTION));
    player.vz = THREE.MathUtils.lerp(player.vz, 0, Math.min(1, dt * PLAYER_FRICTION));
  }

  attemptMove(player.vx * dt, player.vz * dt);
}

function canOccupy(nextX, nextZ) {
  const samples = [
    [0, 0],
    [PLAYER_RADIUS, 0],
    [-PLAYER_RADIUS, 0],
    [0, PLAYER_RADIUS],
    [0, -PLAYER_RADIUS]
  ];
  return samples.every(([ox, oz]) => {
    const g = worldToGrid((nextX + ox) * 2, (nextZ + oz) * 2);
    return walkable(g.x, g.z);
  });
}

function attemptMove(dx, dz) {
  const nextX = player.x + dx;
  const nextZ = player.z + dz;
  if (canOccupy(nextX, player.z)) player.x = nextX;
  if (canOccupy(player.x, nextZ)) player.z = nextZ;
}

function lineOfSight() {
  if (!killer.awake) return false;
  const raycaster = new THREE.Raycaster();
  const from = new THREE.Vector3(killer.x * 2, 1.35, killer.z * 2);
  const to = new THREE.Vector3(player.x * 2, player.hidden ? 0.82 : 1.55, player.z * 2);
  const direction = to.clone().sub(from);
  const distance = direction.length();
  direction.normalize();
  raycaster.set(from, direction);
  const hit = raycaster.intersectObjects(blockers, false)[0];
  return (!hit || hit.distance > distance) && distance < 11.5;
}

function triggerCaughtState() {
  if (killer.caughtCooldown > 0 || struggle.active) return;
  killer.caught = true;
  killer.caughtCooldown = 2.8;
  player.vx = 0;
  player.vz = 0;
  if (killer.stunCount >= MAX_STUNS) {
    showMessage('Caught. The third time is fatal.');
    setSubtitle('Too close for too long.');
    return;
  }
  struggle.active = true;
  struggle.taps = 0;
  struggle.timer = STRUGGLE_MAX_TIME;
  ui.struggle.classList.remove('hidden');
  ui.struggleCopy.textContent = `Tap repeatedly to stun him. Strike ${killer.stunCount + 1} of ${MAX_STUNS + 1}.`;
  ui.struggleMeter.style.width = '0%';
  ui.struggleTimer.style.width = '100%';
  setSubtitle('Fight back before he closes in.');
}

function resolveStruggle(success) {
  struggle.active = false;
  ui.struggle.classList.add('hidden');
  killer.caught = false;
  if (!success) {
    showMessage('You were overpowered. Refresh to restart.');
    setSubtitle('Too slow.');
    killer.stunCount = MAX_STUNS;
    return;
  }
  killer.stunCount += 1;
  killer.stunTimer = 4.4;
  killer.state = 'search';
  killer.searchTimer = 4.5;
  killer.lastKnown = { x: player.x, z: player.z };
  player.stamina = Math.max(player.stamina, 55);
  player.exhausted = false;
  showMessage('You break free and buy space.');
  setSubtitle('He recoils.');
}

function updateStamina(dt) {
  if (sprinting && inputState.moveMagnitude > MOVE_DEADZONE && !player.exhausted && !player.hidden) {
    player.stamina -= PLAYER_STAMINA_DRAIN * dt;
    if (player.stamina <= 0) {
      player.stamina = 0;
      player.exhausted = true;
      sprinting = false;
      showMessage('Exhausted. Slow down and breathe.');
    }
  } else {
    player.stamina += (player.exhausted ? PLAYER_EXHAUSTED_RECOVERY : PLAYER_STAMINA_RECOVERY) * dt;
    if (player.stamina >= 100) {
      player.stamina = 100;
      player.exhausted = false;
    }
  }
}

function updateAudio(dt) {
  if (!audioReady || !audioState.context) return;
  const fear = killer.awake ? THREE.MathUtils.clamp(1 - (dist(player, killer) / HEARTBEAT_DISTANCE), 0, 1) : 0;
  const droneTarget = Math.max(0, fear * 0.11 + (killer.state === 'chase' ? 0.08 : 0));
  audioState.droneGain.gain.value += (droneTarget - audioState.droneGain.gain.value) * Math.min(1, dt * 3);
  audioState.droneOsc.frequency.value = 44 + fear * 18 + (killer.state === 'chase' ? 10 : 0);
  audioState.beatTimer -= dt;
  const beatInterval = THREE.MathUtils.lerp(1.0, 0.38, fear);
  if (fear > 0.08 && audioState.beatTimer <= 0) {
    const now = audioState.context.currentTime;
    audioState.heartGain.gain.cancelScheduledValues(now);
    audioState.heartGain.gain.setValueAtTime(audioState.heartGain.gain.value, now);
    audioState.heartGain.gain.linearRampToValueAtTime(0.22 + fear * 0.25, now + 0.02);
    audioState.heartGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    audioState.beatTimer = beatInterval;
  }
}

function updatePhone(dt) {
  if (!player.phoneOn) return;
  player.phoneBattery = Math.max(0, player.phoneBattery - (player.phoneOpen ? PHONE_OPEN_DRAIN : PHONE_IDLE_DRAIN) * dt);
  if (player.phoneBattery === 0) {
    player.phoneOn = false;
    setPhoneOpen(false);
    showMessage(PHONE_POWER_OFF_MESSAGE);
  }
  phoneState.incomingTimer -= dt;
  if (phoneState.incomingTimer <= 0 && !phoneState.incomingVisible && !struggle.active) {
    phoneState.incomingVisible = true;
    phoneState.blinkTimer = 7;
    setSubtitle('Unknown caller. Let it ring and he may wake.');
    showMessage('Incoming call. Ignore it and the house gets louder.');
  }
  if (phoneState.incomingVisible) {
    phoneState.blinkTimer -= dt;
    ui.incomingCall.classList.add('show');
    if (phoneState.blinkTimer <= 0) {
      phoneState.incomingVisible = false;
      ui.incomingCall.classList.remove('show');
      if (!player.hidden) wakeKiller('noise');
      phoneState.incomingTimer = 18 + Math.random() * 14;
    }
  } else {
    ui.incomingCall.classList.remove('show');
  }
}

function drawPhoneMap() {
  const ctx = ui.phoneMap.getContext('2d');
  ctx.fillStyle = '#0b1014';
  ctx.fillRect(0, 0, ui.phoneMap.width, ui.phoneMap.height);
  if (!level) return;
  const cw = ui.phoneMap.width / grid[0].length;
  const ch = ui.phoneMap.height / grid.length;
  for (let z = 0; z < grid.length; z += 1) {
    for (let x = 0; x < grid[z].length; x += 1) {
      ctx.fillStyle = grid[z][x] === '#' ? '#55616d' : '#d3d9df';
      ctx.fillRect(x * cw, z * ch, cw - 1, ch - 1);
    }
  }
  ctx.fillStyle = '#00a36c';
  ctx.fillRect(player.x * cw - 2, player.z * ch - 2, 4, 4);
  if (killer.awake) {
    ctx.fillStyle = killer.state === 'chase' ? '#ff3a3a' : '#b34e4e';
    ctx.fillRect(killer.x * cw - 2, killer.z * ch - 2, 4, 4);
  }
}

function renderPhone(mode) {
  drawPhoneMap();
  if (!player.phoneOpen) return;
  if (mode === 'cams') ui.phoneBody.innerHTML = '<h3>SECURITY FEEDS</h3><p>Room-authored camera coverage. The hall and living room are visible.</p>';
  else if (mode === 'calling') ui.phoneBody.innerHTML = '<h3>CALL ACTIVE</h3><p>You are making noise. Expect consequences.</p>';
  else if (mode === 'warning') ui.phoneBody.innerHTML = '<h3>INCOMING</h3><p>Silence it indirectly by putting the phone away or moving fast.</p>';
  else ui.phoneBody.innerHTML = '<h3>DID YOU GET MY MESSAGE?</h3><p>Five minutes free roam unless you wake him first.</p>';
}

function updateKiller(dt) {
  const playerPoint = { x: player.x, z: player.z };
  const killerPoint = { x: killer.x, z: killer.z };
  const distanceToPlayer = dist(playerPoint, killerPoint);
  if (!killer.awake) {
    killer.freeRoamTimer = Math.max(0, killer.freeRoamTimer - dt);
    if (distanceToPlayer < KILLER_WAKE_DISTANCE) wakeKiller('noise');
    if (killer.freeRoamTimer <= 0) wakeKiller('timer');
    syncKillerAnimation();
    return;
  }

  const sees = !player.hidden && lineOfSight();
  if (killer.stunTimer > 0) {
    killer.stunTimer -= dt;
    if (killer.stunTimer <= 0) {
      killer.state = 'search';
      killer.searchTimer = 4.5;
    }
  } else if (killer.state === 'distracted') {
    killer.distractionTimer -= dt;
    if (killer.distractionTimer <= 0) {
      killer.state = 'search';
      killer.searchTimer = 4.5;
      killer.target = null;
      killer.distractedByPhone = false;
    }
  } else {
    if (sees) {
      killer.state = 'chase';
      killer.lastKnown = { ...playerPoint };
    } else if (killer.state === 'chase' && killer.lastKnown) {
      killer.state = 'search';
      killer.searchTimer = KILLER_SEARCH_DURATION;
    }
    if (killer.state === 'search') {
      killer.searchTimer -= dt;
      if (killer.searchTimer <= 0) {
        killer.state = 'patrol';
        killer.lastKnown = null;
      }
    }
  }

  let target;
  if (killer.state === 'chase') target = playerPoint;
  else if (killer.state === 'search' && killer.lastKnown) target = killer.lastKnown;
  else if (killer.state === 'distracted' && killer.target) target = killer.target;
  else {
    const patrolNode = level.connections[killer.patrolIndex % level.connections.length]?.at || { x: 8, z: 9 };
    target = patrolNode;
    if (dist(killerPoint, target) < 0.3) killer.patrolIndex += 1;
  }

  const baseSpeed = killer.state === 'chase' ? level.difficulty.killerChaseSpeed : level.difficulty.killerPatrolSpeed;
  const speed = baseSpeed * (killer.frenzy ? level.difficulty.frenzyMultiplier : 1);
  const dx = target.x - killer.x;
  const dz = target.z - killer.z;
  const distance = Math.hypot(dx, dz);
  if (distance > 0.02 && killer.stunTimer <= 0 && !killer.caught) {
    const nextX = killer.x + (dx / distance) * speed * dt;
    const nextZ = killer.z + (dz / distance) * speed * dt;
    if (walkable(Math.round(nextX), Math.round(killer.z))) killer.x = nextX;
    if (walkable(Math.round(killer.x), Math.round(nextZ))) killer.z = nextZ;
  }

  if (killer.mesh) {
    killer.mesh.position.set(killer.x * 2, 0, killer.z * 2);
    if (distance > 0.01) killer.mesh.lookAt(target.x * 2, 0, target.z * 2);
  }

  if (distanceToPlayer < KILLER_CATCH_DISTANCE && !player.hidden) triggerCaughtState();
  killer.caughtCooldown = Math.max(0, killer.caughtCooldown - dt);
  syncKillerAnimation();
}

function updateHandsAndCameraLock(dt) {
  const distance = dist(player, killer);
  const inThreatRange = killer.awake && distance < HANDS_RAISE_DISTANCE && !player.hidden;
  if (player.hands) {
    const targetY = inThreatRange ? -0.28 : -0.52;
    const targetZ = inThreatRange ? -0.38 : -0.56;
    player.hands.position.y += (targetY - player.hands.position.y) * Math.min(1, dt * 7);
    player.hands.position.z += (targetZ - player.hands.position.z) * Math.min(1, dt * 7);
    player.hands.rotation.x += ((inThreatRange ? 0.26 : 0.12) - player.hands.rotation.x) * Math.min(1, dt * 7);
  }
  if (!killer.awake || player.hidden || distance > CAMERA_LOCK_DISTANCE || draggingLook) return;
  const dx = killer.x - player.x;
  const dz = killer.z - player.z;
  const desiredYaw = -Math.atan2(dx, dz);
  const desiredPitch = THREE.MathUtils.clamp(0.05 + (0.9 / Math.max(1, distance)) - 0.3, -0.35, 0.3);
  player.yaw = THREE.MathUtils.lerp(player.yaw, desiredYaw, dt * 2.1);
  player.pitch = THREE.MathUtils.lerp(player.pitch, desiredPitch, dt * 1.9);
}

function updateAtmosphere() {
  const fear = killer.awake ? THREE.MathUtils.clamp(1 - (dist(player, killer) / HEARTBEAT_DISTANCE), 0, 1) : 0;
  ui.vignette.classList.toggle('danger', killer.state === 'chase' || fear > 0.5);
  ui.vignette.style.opacity = String(Math.min(1, 0.2 + fear * 0.46 + (player.stamina < 20 ? 0.1 : 0)));
}

function updateUI() {
  ui.stamina.style.transform = `scaleX(${player.stamina / 100})`;
  const timerText = !killer.awake ? ` · ${Math.ceil(killer.freeRoamTimer)}s quiet` : '';
  ui.objective.textContent = `Pills ${player.pills}/${level?.winCondition?.requiredPills || 3} · ${killer.state}${timerText}`;
  ui.statusLine.textContent = !killer.awake
    ? 'He is asleep.'
    : player.hidden
      ? 'Hidden. Stay quiet.'
      : killer.state === 'chase'
        ? 'He is on you.'
        : killer.state === 'search'
          ? 'He is searching.'
          : 'He is awake.';
  ui.battery.textContent = player.phoneOn ? `${Math.max(0, Math.round(player.phoneBattery))}%` : 'OFF';
  ui.phoneTime.textContent = killer.awake ? '12:09 AM' : '12:04 AM';
  ui.debug.textContent = `Assets loaded ${assetStats.loaded} · fallbacks ${assetStats.fallback} · rooms ${level.rooms.length} · ${assetStats.recent.join(' | ')}`;
}

function updateSleepingPose() {
  if (!killer.mesh || killer.awake) return;
  const bed = killer.bedAnchor || { x: killer.x, z: killer.z };
  killer.mesh.position.set(bed.x * 2, 0.34, bed.z * 2);
  killer.mesh.rotation.set(Math.PI / 2, Math.PI * 0.5, Math.PI * 0.45);
}

function interact(obj) {
  if (struggle.active) return;
  if (obj.type === 'pill') {
    if (obj.collected) return;
    obj.collected = true;
    player.pills += 1;
    const record = interactables.find((item) => item.id === obj.id);
    if (record?.model) record.model.visible = false;
    showMessage(`Medicine collected (${player.pills}/${level.winCondition.requiredPills}).`);
    setSubtitle('Keep moving.');
    return;
  }
  if (obj.type === 'wardrobe') {
    player.hidden = !player.hidden;
    if (player.hidden) {
      showMessage('You hide inside the wardrobe and hold your breath.');
      setSubtitle('Stay still.');
    } else showMessage('You slip back into the hallway.');
    return;
  }
  if (obj.type === 'router') {
    killer.frenzy = true;
    wakeKiller('noise');
    killer.state = 'search';
    killer.searchTimer = 6.5;
    showMessage('Router disconnected. He wakes and starts looking.');
    setSubtitle('That was loud.');
    return;
  }
  if (obj.type === 'blinds_window') {
    showMessage('Blinds shift and the room changes contrast.');
    return;
  }
  if (obj.type === 'exit') {
    if (player.pills >= level.winCondition.requiredPills) {
      showMessage('You escaped through the back exit. You survive.');
      setSubtitle('The door gives way.');
    } else showMessage('The exit will not open. Find all medicine first.');
    return;
  }
  if (obj.type === 'distraction') {
    wakeKiller('noise');
    killer.state = 'distracted';
    killer.target = resolvePlacement(obj) || { x: obj.x, z: obj.z };
    killer.distractionTimer = KILLER_DISTRACTION_DURATION;
    killer.distractedByPhone = false;
    showMessage(`${obj.id} triggered. The killer investigates.`);
  }
}

function nearestInteractable() {
  let best = null;
  let bestDist = 1.35;
  for (const item of interactables) {
    if (!item.model?.visible && item.type === 'pill') continue;
    const placement = resolvePlacement(item) || item;
    const d = dist(player, placement);
    if (d < bestDist) {
      best = item;
      bestDist = d;
    }
  }
  return best;
}

function updateJoystickVisual() {
  ui.joystickKnob.style.transform = `translate(${inputState.knobX}px, ${inputState.knobY}px)`;
}

function startMoveStick(pointer) {
  movePointerId = pointer.pointerId;
  inputState.joystickCenterX = pointer.clientX;
  inputState.joystickCenterY = pointer.clientY;
  ui.joystick.style.left = `${pointer.clientX - MOVE_STICK_RADIUS}px`;
  ui.joystick.style.top = `${pointer.clientY - MOVE_STICK_RADIUS}px`;
  ui.joystick.classList.add('active');
}

function updateMoveStick(pointer) {
  const dx = pointer.clientX - inputState.joystickCenterX;
  const dy = pointer.clientY - inputState.joystickCenterY;
  const length = Math.hypot(dx, dy);
  const clamped = Math.min(length, MOVE_STICK_RADIUS);
  const nx = length > 0 ? dx / length : 0;
  const ny = length > 0 ? dy / length : 0;
  inputState.knobX = nx * clamped;
  inputState.knobY = ny * clamped;
  inputState.moveX = nx;
  inputState.moveY = ny;
  inputState.moveMagnitude = clamped / MOVE_STICK_RADIUS;
  updateJoystickVisual();
}

function endMoveStick() {
  movePointerId = null;
  inputState.moveX = 0;
  inputState.moveY = 0;
  inputState.moveMagnitude = 0;
  inputState.knobX = 0;
  inputState.knobY = 0;
  ui.joystick.classList.remove('active');
  updateJoystickVisual();
}

function handleLookMove(pointer) {
  if (!draggingLook) return;
  player.yaw -= pointer.movementX * LOOK_SENSITIVITY;
  player.pitch = Math.max(-1.2, Math.min(1.2, player.pitch - pointer.movementY * LOOK_SENSITIVITY));
}

async function buildLevel(data) {
  level = data;
  grid = data.grid;
  buildRooms();

  player.x = data.spawnPoints.player.x;
  player.z = data.spawnPoints.player.z;
  killer.x = data.spawnPoints.killer.x;
  killer.z = data.spawnPoints.killer.z;
  player.phoneBattery = data.difficulty?.phoneBattery ?? 12;
  killer.bedAnchor = resolveAnchor('bedroom', 'killer_bed', { x: killer.x, z: killer.z });

  for (const obj of data.objects) await instantiateLevelItem(obj, true);
  for (const item of data.setDressing || []) await instantiateLevelItem(item, false);

  const hands = await assets.instantiate('player_fp_hands_blue_plaid_neutral', { name: 'fp_hands' });
  registerAsset(hands);
  placeHandsModel(hands);

  const killerMesh = await assets.instantiate(data.killerAsset || 'killer_creeper', { name: 'killer' });
  styleKillerMesh(killerMesh);
  registerAsset(killerMesh);
  killer.mesh = killerMesh;
  scene.add(killerMesh);
  const red = new THREE.PointLight(0xff4a4a, 0.75, 4.2);
  red.position.set(0, 1.25, 0);
  killerMesh.add(red);

  const clips = killerMesh.userData.animationClips || {};
  if (Object.keys(clips).length) {
    killer.mixer = new THREE.AnimationMixer(killerMesh);
    for (const [name, clip] of Object.entries(clips)) {
      const action = killer.mixer.clipAction(clip);
      action.enabled = true;
      action.setLoop(THREE.LoopRepeat, Infinity);
      killer.actions[name] = action;
    }
  }

  updateCamera();
  syncKillerAnimation();
  updateSleepingPose();
  updateUI();
  renderPhone('home');
  setSubtitle('He is asleep in the bedroom. You have five quiet minutes.');
}

async function init() {
  manifest = await loadJson('/assets/manifest.json', {
    assets: {},
    fallbacks: { generic_box: { shape: 'box', size: [1, 1, 1], color: '#777' } }
  });
  assets = new AssetSystem(scene, manifest, renderer);
  await buildLevel(await loadJson('/levels/level-01-mansion.json', null));
  animate();
}

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;

  if (struggle.active) {
    struggle.timer -= dt;
    ui.struggleTimer.style.width = `${Math.max(0, (struggle.timer / STRUGGLE_MAX_TIME) * 100)}%`;
    if (struggle.timer <= 0) resolveStruggle(false);
  } else {
    movePlayer(dt);
    updateKiller(dt);
    updateStamina(dt);
    updatePhone(dt);
  }

  if (!killer.awake) updateSleepingPose();
  if (killer.mixer) killer.mixer.update(dt);
  updateHandsAndCameraLock(dt);
  updateAudio(dt);
  updateCamera();
  updateAtmosphere();
  updateUI();
  drawPhoneMap();
  renderer.render(scene, camera);
}

renderer.domElement.addEventListener('pointerdown', async (event) => {
  await ensureAudio();
  const targetRect = renderer.domElement.getBoundingClientRect();
  const localX = event.clientX - targetRect.left;
  if (localX < targetRect.width * 0.42 && movePointerId === null) {
    startMoveStick(event);
  } else if (lookPointerId === null) {
    lookPointerId = event.pointerId;
    draggingLook = true;
  }
});

renderer.domElement.addEventListener('pointermove', (event) => {
  if (event.pointerId === movePointerId) updateMoveStick(event);
  if (event.pointerId === lookPointerId && !struggle.active) handleLookMove(event);
});

renderer.domElement.addEventListener('pointerup', async (event) => {
  await ensureAudio();
  if (event.pointerId === movePointerId) {
    endMoveStick();
    return;
  }
  if (event.pointerId === lookPointerId) {
    draggingLook = false;
    lookPointerId = null;
    const targetRect = renderer.domElement.getBoundingClientRect();
    const localX = event.clientX - targetRect.left;
    const localY = event.clientY - targetRect.top;
    if (localX > targetRect.width * 0.38 && localY < targetRect.height * 0.8) {
      const nearest = nearestInteractable();
      if (nearest) interact(nearest);
    }
  }
});

renderer.domElement.addEventListener('pointercancel', (event) => {
  if (event.pointerId === movePointerId) endMoveStick();
  if (event.pointerId === lookPointerId) {
    draggingLook = false;
    lookPointerId = null;
  }
});

ui.sprintBtn.addEventListener('pointerdown', async () => {
  await ensureAudio();
  sprinting = true;
});
ui.sprintBtn.addEventListener('pointerup', () => { sprinting = false; });
ui.sprintBtn.addEventListener('pointercancel', () => { sprinting = false; });
ui.phoneBtn.addEventListener('click', async () => {
  await ensureAudio();
  if (!player.phoneOn) return showMessage(PHONE_POWER_OFF_MESSAGE);
  setPhoneOpen(!player.phoneOpen);
});
ui.closePhoneBtn.addEventListener('click', () => setPhoneOpen(false));
ui.camBtn.addEventListener('click', () => renderPhone('cams'));
ui.callBtn.addEventListener('click', async () => {
  await ensureAudio();
  if (!player.phoneOn) return;
  player.phoneBattery = Math.max(0, player.phoneBattery - PHONE_CALL_COST);
  wakeKiller('noise');
  killer.state = 'distracted';
  killer.target = { x: player.x, z: player.z };
  killer.distractionTimer = KILLER_DISTRACTION_DURATION;
  killer.distractedByPhone = true;
  renderPhone('calling');
  showMessage('You call him. That wakes him immediately.');
  setSubtitle('A dangerous distraction.');
});
ui.offBtn.addEventListener('click', () => {
  player.phoneOn = false;
  player.phoneBattery = 0;
  setPhoneOpen(false);
  showMessage(PHONE_POWER_OFF_MESSAGE);
});
ui.struggleBtn.addEventListener('pointerdown', () => {
  if (!struggle.active) return;
  struggle.taps += 1;
  ui.struggleMeter.style.width = `${Math.min(100, (struggle.taps / STRUGGLE_REQUIRED_TAPS) * 100)}%`;
  if (struggle.taps >= STRUGGLE_REQUIRED_TAPS) resolveStruggle(true);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

init();
