import './style.css';
import * as THREE from 'three';
import { AssetSystem, loadJson } from './asset-system.js';

const PLAYER_WALK_SPEED = 1.22;
const PLAYER_SPRINT_SPEED = 2.08;
const PLAYER_EXHAUSTED_SPEED = 0.82;
const PLAYER_STAMINA_DRAIN = 19;
const PLAYER_STAMINA_RECOVERY = 13;
const PLAYER_EXHAUSTED_RECOVERY = 7;
const PHONE_IDLE_DRAIN = 0.25;
const PHONE_OPEN_DRAIN = 0.5;
const PHONE_CALL_COST = 1.8;
const PHONE_POWER_OFF_MESSAGE = 'Phone powered off. It cannot be turned back on.';
const KILLER_CATCH_DISTANCE = 0.7;
const KILLER_REACH_DISTANCE = 0.95;
const KILLER_SEARCH_DURATION = 7;
const KILLER_DISTRACTION_DURATION = 5.5;
const STRUGGLE_REQUIRED_TAPS = 12;
const STRUGGLE_MAX_TIME = 4.2;
const MAX_STUNS = 2;

const app = document.querySelector('#app');
app.innerHTML = `
  <div id="hud">
    <div id="vignette"></div>
    <div id="topbar">
      <div class="panel" id="objective">Pills 0/3</div>
      <div class="panel" id="statusLine">Safe for now.</div>
      <div class="panel"><div id="staminaWrap"><div id="stamina"></div></div></div>
    </div>
    <div class="panel" id="message">Tap a floor tile to move. Drag to look. Stay quiet and keep distance.</div>
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
    <div id="controls"><div class="btn" id="phoneBtn">PHONE</div><div class="btn" id="sprintBtn">SPRINT</div></div>
    <div id="debug"></div>
  </div>`;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#050508');
scene.fog = new THREE.FogExp2('#050508', 0.055);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 100);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
app.appendChild(renderer.domElement);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const floorMeshes = [];
const blockers = [];
const interactables = [];
const dynamicSwaps = new Map();

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
  sprintBtn: document.querySelector('#sprintBtn')
};

let manifest;
let assets;
let level;
let grid = [];
let cellSize = 2;
let dragging = false;
let moved = false;
let sx = 0;
let sy = 0;
let sprinting = false;
let lastFrame = performance.now();
let subtitleTimer = 0;
let callNoticeTimer = 0;
let caughtTimer = 0;
let phoneMode = 'home';
let assetStats = { loaded: 0, fallback: 0, recent: [] };

const player = {
  x: 2,
  z: 2,
  y: 1.62,
  yaw: 0,
  pitch: 0,
  path: [],
  stamina: 100,
  exhausted: false,
  hidden: false,
  pills: 0,
  phoneOn: true,
  phoneBattery: 12,
  phoneOpen: false
};

const killer = {
  x: 15,
  z: 9,
  state: 'patrol',
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

function world(gx, gz) {
  return new THREE.Vector3(gx * cellSize, 0, gz * cellSize);
}

function walkable(x, z) {
  return grid[z] && grid[z][x] && grid[z][x] !== '#';
}

function neighbors(node) {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dx, dz]) => ({ x: node.x + dx, z: node.z + dz }))
    .filter((candidate) => walkable(candidate.x, candidate.z));
}

function bfs(start, end) {
  const q = [start];
  const key = (point) => `${point.x},${point.z}`;
  const seen = new Set([key(start)]);
  const prev = new Map();
  while (q.length) {
    const node = q.shift();
    if (node.x === end.x && node.z === end.z) {
      const out = [];
      let cursor = node;
      while (cursor && key(cursor) !== key(start)) {
        out.push(cursor);
        cursor = prev.get(key(cursor));
      }
      return out.reverse();
    }
    for (const candidate of neighbors(node)) {
      const candidateKey = key(candidate);
      if (!seen.has(candidateKey)) {
        seen.add(candidateKey);
        prev.set(candidateKey, node);
        q.push(candidate);
      }
    }
  }
  return [];
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function playerGrid() {
  return { x: Math.round(player.x), z: Math.round(player.z) };
}

function setSubtitle(text, duration = 2.6) {
  ui.subtitle.textContent = text;
  ui.subtitle.classList.add('show');
  clearTimeout(subtitleTimer);
  subtitleTimer = setTimeout(() => ui.subtitle.classList.remove('show'), duration * 1000);
}

function showMessage(text, duration = 3.2) {
  ui.message.textContent = text;
  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => {
    ui.message.textContent = 'Tap floor to move. Tap nearby props to interact. Drag to look.';
  }, duration * 1000);
}

function registerAsset(object) {
  const status = object.userData.assetStatus === 'loaded' ? 'loaded' : 'fallback';
  assetStats[status] += 1;
  if (assetStats.recent.length < 5) {
    assetStats.recent.push(`${object.name}:${object.userData.assetStatusReason}`);
  }
}

function setPhoneOpen(nextOpen) {
  player.phoneOpen = nextOpen && player.phoneOn;
  ui.phone.classList.toggle('on', player.phoneOpen);
  if (!player.phoneOpen) {
    phoneMode = 'home';
  }
  renderPhone(phoneMode);
}

function swapInteractableAsset(obj, nextAsset) {
  const cached = dynamicSwaps.get(obj.id);
  if (cached) {
    cached.visible = false;
  }
  const record = interactables.find((item) => item.id === obj.id);
  if (!record) return;
  const existing = dynamicSwaps.get(`${obj.id}:${nextAsset}`);
  if (existing) {
    existing.visible = true;
    record.model = existing;
    obj.asset = nextAsset;
    return;
  }
  assets.instantiate(nextAsset, {
    name: obj.id,
    x: obj.x * cellSize,
    z: obj.z * cellSize,
    rotation: obj.rotation || 0
  }).then((model) => {
    model.userData.game = obj;
    registerAsset(model);
    scene.add(model);
    dynamicSwaps.set(`${obj.id}:${nextAsset}`, model);
    if (record.model) {
      record.model.visible = false;
      dynamicSwaps.set(obj.id, record.model);
    }
    record.model = model;
    obj.asset = nextAsset;
  });
}

function setKillerAnimation(name) {
  if (!killer.mixer) return;
  const fallbackName = name === 'chase' && !killer.actions.chase ? 'run' : name;
  const action = killer.actions[fallbackName] || killer.actions.idle;
  if (!action || killer.currentClip === action) return;
  if (killer.currentClip) killer.currentClip.fadeOut(0.2);
  action.reset().fadeIn(0.2).play();
  killer.currentClip = action;
}

function syncKillerAnimation() {
  if (killer.caught) return setKillerAnimation('attack');
  if (killer.stunTimer > 0) return setKillerAnimation('stunned');
  if (killer.state === 'chase') return setKillerAnimation(killer.actions.chase ? 'chase' : 'run');
  if (killer.state === 'search') return setKillerAnimation('search');
  if (killer.state === 'distracted') return setKillerAnimation(killer.distractedByPhone ? 'phoneCheck' : 'idle');
  return setKillerAnimation('walk');
}

function updateCamera() {
  camera.position.set(player.x * cellSize, player.hidden ? 0.9 : player.y, player.z * cellSize);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
}

function moveAlong(dt) {
  if (!player.path.length || struggle.active) return;
  const target = player.path[0];
  const speedBase = player.exhausted ? PLAYER_EXHAUSTED_SPEED : (sprinting ? PLAYER_SPRINT_SPEED : PLAYER_WALK_SPEED);
  const dx = target.x - player.x;
  const dz = target.z - player.z;
  const distance = Math.hypot(dx, dz);
  if (distance < speedBase * dt) {
    player.x = target.x;
    player.z = target.z;
    player.path.shift();
  } else {
    player.x += (dx / distance) * speedBase * dt;
    player.z += (dz / distance) * speedBase * dt;
  }
}

function lineOfSight() {
  const from = new THREE.Vector3(killer.x * cellSize, 1.4, killer.z * cellSize);
  const to = new THREE.Vector3(player.x * cellSize, player.hidden ? 0.75 : 1.5, player.z * cellSize);
  const direction = to.clone().sub(from);
  const distance = direction.length();
  direction.normalize();
  raycaster.set(from, direction);
  const hit = raycaster.intersectObjects(blockers, false)[0];
  return (!hit || hit.distance > distance) && distance < 12.5;
}

function triggerCaughtState() {
  if (killer.caughtCooldown > 0 || struggle.active) return;
  killer.caught = true;
  killer.caughtCooldown = 2.8;
  player.path = [];
  if (killer.stunCount >= MAX_STUNS) {
    showMessage('Caught. The third time is fatal.');
    setSubtitle('He finally gets close enough.');
    return;
  }
  struggle.active = true;
  struggle.taps = 0;
  struggle.timer = STRUGGLE_MAX_TIME;
  ui.struggle.classList.remove('hidden');
  ui.struggleCopy.textContent = `Tap repeatedly to stun him. Strike ${killer.stunCount + 1} of ${MAX_STUNS + 1}.`;
  ui.struggleMeter.style.width = '0%';
  ui.struggleTimer.style.width = '100%';
  setSubtitle('Fight back before he drags you down.');
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
  killer.stunTimer = 4.5;
  killer.state = 'search';
  killer.searchTimer = 4;
  killer.lastKnown = { x: player.x, z: player.z };
  player.stamina = Math.max(player.stamina, 50);
  player.exhausted = false;
  showMessage('You break free and buy a few seconds.');
  setSubtitle('He staggers backward.');
}

function updateStamina(dt) {
  if (sprinting && player.path.length && !player.exhausted && !player.hidden) {
    player.stamina -= PLAYER_STAMINA_DRAIN * dt;
    if (player.stamina <= 0) {
      player.stamina = 0;
      player.exhausted = true;
      sprinting = false;
      showMessage('Exhausted. Your breathing turns ragged.');
    }
  } else {
    player.stamina += (player.exhausted ? PLAYER_EXHAUSTED_RECOVERY : PLAYER_STAMINA_RECOVERY) * dt;
    if (player.stamina >= 100) {
      player.stamina = 100;
      player.exhausted = false;
    }
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
    callNoticeTimer = 7;
    setSubtitle('Unknown caller. He might hear it.');
    showMessage('Incoming call. Leave it ringing and you risk revealing yourself.');
  }

  if (phoneState.incomingVisible) {
    phoneState.blinkTimer -= dt;
    ui.incomingCall.classList.add('show');
    if (phoneState.blinkTimer <= 0) {
      phoneState.incomingVisible = false;
      ui.incomingCall.classList.remove('show');
      if (!player.hidden && killer.state !== 'chase') {
        killer.state = 'distracted';
        killer.target = { x: player.x, z: player.z };
        killer.distractionTimer = 4.2;
        killer.distractedByPhone = true;
      }
      phoneState.incomingTimer = 18 + Math.random() * 14;
    }
  } else {
    ui.incomingCall.classList.remove('show');
  }
}

function drawPhoneMap() {
  const ctx = ui.phoneMap.getContext('2d');
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, ui.phoneMap.width, ui.phoneMap.height);
  if (!level) return;
  const cw = ui.phoneMap.width / grid[0].length;
  const ch = ui.phoneMap.height / grid.length;
  for (let z = 0; z < grid.length; z += 1) {
    for (let x = 0; x < grid[z].length; x += 1) {
      ctx.fillStyle = grid[z][x] === '#' ? '#1f1f1f' : '#0d2a15';
      ctx.fillRect(x * cw, z * ch, cw - 1, ch - 1);
    }
  }
  ctx.fillStyle = '#d4ffdf';
  ctx.fillRect(player.x * cw - 2, player.z * ch - 2, 4, 4);
  ctx.fillStyle = killer.state === 'chase' ? '#ff5252' : '#d08484';
  ctx.fillRect(killer.x * cw - 2, killer.z * ch - 2, 4, 4);
}

function renderPhone(mode) {
  phoneMode = mode;
  drawPhoneMap();
  if (!player.phoneOpen) return;
  if (mode === 'cams') {
    ui.phoneBody.innerHTML = '<h3>SECURITY FEEDS</h3><p>Static-ridden hallway view. He moves slowly until he knows where you are.</p>';
  } else if (mode === 'calling') {
    ui.phoneBody.innerHTML = '<h3>CALL ACTIVE</h3><p>He checks his pocket before he moves.</p>';
  } else {
    ui.phoneBody.innerHTML = '<h3>DID YOU GET MY MESSAGE?</h3><p>Cameras help. Calls are a risk. Powering off is permanent.</p>';
  }
}

function updateKiller(dt) {
  const playerPoint = { x: player.x, z: player.z };
  const killerPoint = { x: killer.x, z: killer.z };
  const sees = !player.hidden && lineOfSight();

  if (killer.stunTimer > 0) {
    killer.stunTimer -= dt;
    if (killer.stunTimer <= 0) {
      killer.state = 'search';
      killer.searchTimer = 4;
    }
  } else if (killer.state === 'distracted') {
    killer.distractionTimer -= dt;
    if (killer.distractionTimer <= 0) {
      killer.state = 'search';
      killer.searchTimer = 4;
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
  if (killer.state === 'chase') {
    target = playerPoint;
  } else if (killer.state === 'search' && killer.lastKnown) {
    target = killer.lastKnown;
  } else if (killer.state === 'distracted' && killer.target) {
    target = killer.target;
  } else {
    const patrolNode = level.patrolNodes[killer.patrolIndex % level.patrolNodes.length];
    target = { x: patrolNode.x, z: patrolNode.z };
    if (dist(killerPoint, target) < 0.3) killer.patrolIndex += 1;
  }

  const baseSpeed = killer.state === 'chase' ? level.difficulty.killerChaseSpeed : level.difficulty.killerPatrolSpeed;
  const speed = baseSpeed * (killer.frenzy ? level.difficulty.frenzyMultiplier : 1);
  const dx = target.x - killer.x;
  const dz = target.z - killer.z;
  const distance = Math.hypot(dx, dz);
  if (distance > 0.02 && killer.stunTimer <= 0 && !killer.caught) {
    killer.x += (dx / distance) * speed * dt;
    killer.z += (dz / distance) * speed * dt;
  }

  if (killer.mesh) {
    killer.mesh.position.set(killer.x * cellSize, 0, killer.z * cellSize);
    if (distance > 0.01) {
      killer.mesh.lookAt(target.x * cellSize, 0, target.z * cellSize);
    } else {
      killer.mesh.lookAt(player.x * cellSize, 0, player.z * cellSize);
    }
  }

  if (dist(killerPoint, playerPoint) < KILLER_CATCH_DISTANCE && !player.hidden) {
    caughtTimer += dt;
    if (caughtTimer >= 0.65) triggerCaughtState();
  } else {
    caughtTimer = Math.max(0, caughtTimer - dt * 2);
  }

  killer.caughtCooldown = Math.max(0, killer.caughtCooldown - dt);
  syncKillerAnimation();
}

function updateAtmosphere() {
  const fear = THREE.MathUtils.clamp(1 - (dist(player, killer) / 8), 0, 1);
  ui.vignette.classList.toggle('danger', killer.state === 'chase' || fear > 0.62);
  ui.vignette.style.opacity = String(Math.min(1, 0.48 + fear * 0.4 + (player.stamina < 20 ? 0.12 : 0)));
}

function updateUI() {
  ui.stamina.style.transform = `scaleX(${player.stamina / 100})`;
  ui.objective.textContent = `Pills ${player.pills}/${level?.winCondition?.requiredPills || 3} · ${killer.state}${killer.frenzy ? ' · FRENZY' : ''}`;
  ui.statusLine.textContent = player.hidden
    ? 'Hidden. Stay quiet.'
    : killer.state === 'chase'
      ? 'He sees you.'
      : killer.state === 'search'
        ? 'He is searching.'
        : 'Safe for now.';
  ui.battery.textContent = player.phoneOn ? `${Math.max(0, Math.round(player.phoneBattery))}%` : 'OFF';
  ui.phoneTime.textContent = killer.state === 'chase' ? '12:06 AM' : '12:04 AM';
  ui.debug.textContent = `Assets loaded ${assetStats.loaded} · fallbacks ${assetStats.fallback} · ${assetStats.recent.join(' | ')}`;
}

async function buildLevel(data) {
  grid = data.grid;
  scene.fog.density = data.lighting?.fogDensity ?? 0.055;
  scene.add(new THREE.HemisphereLight(0x77778a, 0x12100d, 0.58));
  const moon = new THREE.DirectionalLight(0xb6c7ff, 0.44);
  moon.position.set(12, 18, 8);
  moon.castShadow = true;
  scene.add(moon);

  const flashlight = new THREE.SpotLight(0xf0e1b2, 1.55, 13, Math.PI / 7, 0.52, 1.4);
  camera.add(flashlight);
  flashlight.position.set(0, 0, 0);
  flashlight.target.position.set(0, 0, -1);
  camera.add(flashlight.target);
  scene.add(camera);

  const wallMat = new THREE.MeshStandardMaterial({ color: '#342d28', roughness: 0.96 });
  const floorMat = new THREE.MeshStandardMaterial({ color: '#201b17', roughness: 0.95 });
  for (let z = 0; z < grid.length; z += 1) {
    for (let x = 0; x < grid[z].length; x += 1) {
      const pos = world(x, z);
      const floor = new THREE.Mesh(new THREE.BoxGeometry(cellSize, 0.08, cellSize), floorMat);
      floor.position.set(pos.x, -0.04, pos.z);
      floor.receiveShadow = true;
      floor.userData.grid = { x, z };
      scene.add(floor);
      floorMeshes.push(floor);

      if (grid[z][x] === '#') {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(cellSize, 2.8, cellSize), wallMat);
        wall.position.set(pos.x, 1.4, pos.z);
        wall.castShadow = true;
        wall.receiveShadow = true;
        scene.add(wall);
        blockers.push(wall);
      }
    }
  }

  player.x = data.spawnPoints.player.x;
  player.z = data.spawnPoints.player.z;
  killer.x = data.spawnPoints.killer.x;
  killer.z = data.spawnPoints.killer.z;
  player.phoneBattery = data.difficulty?.phoneBattery ?? 12;

  for (const obj of [...data.objects, ...(data.setDressing || [])]) {
    const model = await assets.instantiate(obj.asset, {
      name: obj.id,
      x: obj.x * cellSize,
      z: obj.z * cellSize,
      rotation: obj.rotation || 0,
      scale: obj.type === 'pill' ? 0.55 : 1
    });
    model.userData.game = obj;
    registerAsset(model);
    scene.add(model);
    interactables.push({ ...obj, model });
  }

  const killerAsset = data.killerAsset || 'killer_creeper';
  const killerMesh = await assets.instantiate(killerAsset, {
    name: 'killer',
    x: killer.x * cellSize,
    z: killer.z * cellSize
  });
  registerAsset(killerMesh);
  killer.mesh = killerMesh;
  scene.add(killerMesh);
  const red = new THREE.PointLight(0xff2020, 1.1, 4.5);
  red.position.set(0, 1.4, 0);
  killerMesh.add(red);

  const clips = killerMesh.userData.animationClips || {};
  if (Object.keys(clips).length) {
    killer.mixer = new THREE.AnimationMixer(killerMesh);
    for (const [name, clip] of Object.entries(clips)) {
      killer.actions[name] = killer.mixer.clipAction(clip);
    }
  }

  updateCamera();
  updateUI();
  renderPhone('home');
  setSubtitle('Move slowly. He should feel near, not instant.');
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
    setSubtitle('One more reason to keep moving.');
    return;
  }

  if (obj.type === 'wardrobe') {
    player.hidden = !player.hidden;
    player.path = [];
    if (player.hidden) {
      showMessage('You hide inside the wardrobe and hold your breath.');
      setSubtitle('Do not move.');
      if (obj.asset !== 'wardrobe_antique_open') swapInteractableAsset(obj, 'wardrobe_antique_open');
    } else {
      showMessage('You slip back into the hallway.');
      if (obj.asset !== 'wardrobe_antique_closed') swapInteractableAsset(obj, 'wardrobe_antique_closed');
    }
    return;
  }

  if (obj.type === 'router') {
    killer.frenzy = true;
    killer.state = 'search';
    killer.searchTimer = 6;
    showMessage('Router disconnected. He speeds up, but not by much.');
    setSubtitle('The house notices.');
    if (obj.asset !== 'wifi_router_black_off') swapInteractableAsset(obj, 'wifi_router_black_off');
    return;
  }

  if (obj.type === 'blinds_window') {
    const nextAsset = obj.asset === 'window_blinds_closed' ? 'window_blinds_rolled_down_open' : 'window_blinds_closed';
    swapInteractableAsset(obj, nextAsset);
    scene.fog.density = nextAsset === 'window_blinds_closed' ? 0.08 : (level.lighting?.fogDensity ?? 0.055);
    showMessage(nextAsset === 'window_blinds_closed' ? 'Blinds closed. Sightlines tighten.' : 'Blinds reopened. Light leaks back in.');
    return;
  }

  if (obj.type === 'exit') {
    if (player.pills >= level.winCondition.requiredPills) {
      showMessage('You escaped through the back exit. You survive.');
      setSubtitle('The door gives way.');
    } else {
      showMessage('The exit will not open. Find all medicine first.');
    }
    return;
  }

  if (obj.type === 'distraction') {
    killer.state = 'distracted';
    killer.target = { x: obj.x, z: obj.z };
    killer.distractionTimer = KILLER_DISTRACTION_DURATION;
    killer.distractedByPhone = false;
    if (obj.asset === 'mailbox_rural_blue_flag_down') {
      swapInteractableAsset(obj, 'mailbox_rural_blue_flag_up');
    }
    showMessage(`${obj.id} triggered. The killer investigates slowly.`);
  }
}

async function init() {
  manifest = await loadJson('/assets/manifest.json', {
    assets: {},
    fallbacks: { generic_box: { shape: 'box', size: [1, 1, 1], color: '#777' } }
  });
  level = await loadJson('/levels/level-01-mansion.json', null);
  assets = new AssetSystem(scene, manifest);
  await buildLevel(level);
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
    moveAlong(dt);
    updateKiller(dt);
    updateStamina(dt);
    updatePhone(dt);
  }

  if (killer.mixer) killer.mixer.update(dt);
  updateCamera();
  updateAtmosphere();
  updateUI();
  renderer.render(scene, camera);
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  dragging = true;
  moved = false;
  sx = event.clientX;
  sy = event.clientY;
});

renderer.domElement.addEventListener('pointermove', (event) => {
  if (!dragging || struggle.active) return;
  const dx = event.clientX - sx;
  const dy = event.clientY - sy;
  sx = event.clientX;
  sy = event.clientY;
  if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
  player.yaw -= dx * 0.004;
  player.pitch = Math.max(-1.2, Math.min(1.2, player.pitch - dy * 0.003));
});

renderer.domElement.addEventListener('pointerup', (event) => {
  dragging = false;
  if (moved || struggle.active) return;
  pointer.x = (event.clientX / innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const objHit = raycaster.intersectObjects(interactables.map((item) => item.model), true)[0];
  if (objHit) {
    let root = objHit.object;
    while (root.parent && !root.userData.game) root = root.parent;
    if (root.userData.game) {
      interact(root.userData.game);
      return;
    }
  }

  const hit = raycaster.intersectObjects(floorMeshes, false)[0];
  if (hit) {
    const target = hit.object.userData.grid;
    player.path = bfs(playerGrid(), target).map((node) => ({ x: node.x, z: node.z }));
    player.hidden = false;
  }
});

ui.sprintBtn.addEventListener('pointerdown', () => {
  sprinting = true;
});
ui.sprintBtn.addEventListener('pointerup', () => {
  sprinting = false;
});
ui.sprintBtn.addEventListener('pointercancel', () => {
  sprinting = false;
});
ui.phoneBtn.addEventListener('click', () => {
  if (!player.phoneOn) return showMessage(PHONE_POWER_OFF_MESSAGE);
  setPhoneOpen(!player.phoneOpen);
});
ui.closePhoneBtn.addEventListener('click', () => {
  setPhoneOpen(false);
});
ui.camBtn.addEventListener('click', () => {
  renderPhone('cams');
});
ui.callBtn.addEventListener('click', () => {
  if (!player.phoneOn) return;
  player.phoneBattery = Math.max(0, player.phoneBattery - PHONE_CALL_COST);
  killer.state = 'distracted';
  killer.target = { x: player.x, z: player.z };
  killer.distractionTimer = KILLER_DISTRACTION_DURATION;
  killer.distractedByPhone = true;
  renderPhone('calling');
  showMessage('You call him. He checks his pocket before he moves.');
  setSubtitle('A slow, dangerous distraction.');
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
