
import './style.css';
import * as THREE from 'three';
import { AssetSystem, loadJson } from './asset-system.js';

const app = document.querySelector('#app');
app.innerHTML = `
  <div id="hud">
    <div id="vignette"></div>
    <div id="topbar"><div class="panel" id="objective">Pills 0/3</div><div class="panel"><div id="staminaWrap"><div id="stamina"></div></div></div></div>
    <div class="panel" id="message">Tap a floor tile to move. Drag to look. Replace placeholder sidecar files with real GLB/PNG/OGG assets.</div>
    <div id="phone"><div id="phoneScreen"><div class="phoneHeader"><span>2:37</span><span id="battery">12%</span></div><div id="phoneBody"></div><div class="phoneActions"><button class="phoneAction" id="camBtn">CAMS</button><button class="phoneAction" id="callBtn">CALL</button><button class="phoneAction danger" id="offBtn">OFF</button></div></div></div>
    <div id="controls"><div class="btn" id="phoneBtn">PHONE</div><div class="btn" id="sprintBtn">SPRINT</div></div>
    <div id="debug"></div>
  </div>`;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#050508');
scene.fog = new THREE.FogExp2('#050508', 0.055);
const camera = new THREE.PerspectiveCamera(72, innerWidth/innerHeight, 0.05, 100);
const renderer = new THREE.WebGLRenderer({ antialias:false, powerPreference:'high-performance' });
renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.shadowMap.enabled = true;
app.appendChild(renderer.domElement);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const floorMeshes = [];
const blockers = [];
let manifest, assets, level;
let grid = [];
let cellSize = 2;
let player = { x:2, z:2, y:1.62, yaw:0, pitch:0, path:[], stamina:100, exhausted:false, hidden:false, pills:0, phoneOn:true, phoneBattery:12 };
let killer = { x:15, z:9, state:'patrol', target:null, patrolIndex:0, frenzy:false, speed:1.35, searchTimer:0, lastKnown:null };
const interactables = [];

function world(gx,gz){ return new THREE.Vector3(gx*cellSize,0,gz*cellSize); }
function gridPos(x,z){ return {x:Math.round(x/cellSize), z:Math.round(z/cellSize)}; }
function walkable(x,z){ return grid[z] && grid[z][x] && grid[z][x] !== '#'; }
function neighbors(n){ return [[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dz])=>({x:n.x+dx,z:n.z+dz})).filter(p=>walkable(p.x,p.z)); }
function bfs(start, end){ const q=[start], key=p=>`${p.x},${p.z}`, seen=new Set([key(start)]), prev=new Map(); while(q.length){ const n=q.shift(); if(n.x===end.x&&n.z===end.z){ const out=[]; let k=key(n), cur=n; while(k!==key(start)){ out.push(cur); cur=prev.get(k); k=key(cur);} return out.reverse(); } for(const nb of neighbors(n)){ const k=key(nb); if(!seen.has(k)){ seen.add(k); prev.set(k,n); q.push(nb); } } } return []; }
function dist(a,b){ return Math.hypot(a.x-b.x, a.z-b.z); }

async function init(){
  manifest = await loadJson('/assets/manifest.json', {assets:{},fallbacks:{generic_box:{shape:'box',size:[1,1,1],color:'#777'}}});
  level = await loadJson('/levels/level-01-mansion.json', null);
  assets = new AssetSystem(scene, manifest);
  buildLevel(level);
  animate();
}

async function buildLevel(data){
  grid = data.grid;
  scene.fog.density = data.lighting?.fogDensity ?? 0.055;
  scene.add(new THREE.HemisphereLight(0x77778a, 0x12100d, .65));
  const moon = new THREE.DirectionalLight(0xb6c7ff, .55); moon.position.set(12,18,8); moon.castShadow=true; scene.add(moon);
  const flashlight = new THREE.SpotLight(0xf0e1b2, 2.1, 15, Math.PI/6, .45, 1.2); camera.add(flashlight); flashlight.position.set(0,0,0); flashlight.target.position.set(0,0,-1); camera.add(flashlight.target); scene.add(camera);

  const wallMat = new THREE.MeshStandardMaterial({color:'#342d28', roughness:.96});
  const floorMat = new THREE.MeshStandardMaterial({color:'#201b17', roughness:.95});
  for(let z=0; z<grid.length; z++) for(let x=0; x<grid[z].length; x++) {
    const ch=grid[z][x];
    const pos=world(x,z);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(cellSize,.08,cellSize), floorMat); floor.position.set(pos.x,-.04,pos.z); floor.receiveShadow=true; floor.userData.grid={x,z}; scene.add(floor); floorMeshes.push(floor);
    if(ch==='#') { const wall = new THREE.Mesh(new THREE.BoxGeometry(cellSize,2.8,cellSize), wallMat); wall.position.set(pos.x,1.4,pos.z); wall.castShadow=wall.receiveShadow=true; scene.add(wall); blockers.push(wall); }
  }
  player.x=data.spawnPoints.player.x; player.z=data.spawnPoints.player.z; killer.x=data.spawnPoints.killer.x; killer.z=data.spawnPoints.killer.z;
  for (const obj of [...data.objects, ...(data.setDressing||[])]) {
    const model = await assets.instantiate(obj.asset, { name:obj.id, x:obj.x*cellSize, z:obj.z*cellSize, rotation:obj.rotation||0, scale: obj.type==='pill' ? .55 : 1 });
    model.userData.game = obj; scene.add(model); interactables.push({ ...obj, model });
  }
  const killerMesh = await assets.instantiate('killer_outfit_janitor_coveralls', {name:'killer', x:killer.x*cellSize, z:killer.z*cellSize});
  killer.mesh = killerMesh; scene.add(killerMesh);
  const red = new THREE.PointLight(0xff2020, 1.4, 5); red.position.set(0,1.4,0); killerMesh.add(red);
  updateCamera(); updateUI(); renderPhone('home');
}

function updateCamera(){
  camera.position.set(player.x*cellSize, player.hidden ? .75 : player.y, player.z*cellSize);
  camera.rotation.order='YXZ'; camera.rotation.y=player.yaw; camera.rotation.x=player.pitch;
}
function moveAlong(dt){
  if (!player.path.length) return;
  const target = player.path[0];
  const speedBase = player.exhausted ? .9 : (sprinting ? 4.1 : 1.9);
  const wx=target.x, wz=target.z; const dx=wx-player.x, dz=wz-player.z; const d=Math.hypot(dx,dz);
  if (d < speedBase*dt) { player.x=wx; player.z=wz; player.path.shift(); } else { player.x += dx/d*speedBase*dt; player.z += dz/d*speedBase*dt; }
}
function playerGrid(){return {x:Math.round(player.x), z:Math.round(player.z)}}
function killerGrid(){return {x:Math.round(killer.x), z:Math.round(killer.z)}}
function lineOfSight(){
  const from = new THREE.Vector3(killer.x*cellSize, 1.4, killer.z*cellSize); const to = new THREE.Vector3(player.x*cellSize, player.hidden?.75:1.5, player.z*cellSize);
  const direction = to.clone().sub(from); const distance = direction.length(); direction.normalize();
  raycaster.set(from, direction); const hit = raycaster.intersectObjects(blockers, false)[0];
  return (!hit || hit.distance > distance) && distance < 13;
}
function updateKiller(dt){
  const p={x:player.x,z:player.z}; const k={x:killer.x,z:killer.z}; const sees = !player.hidden && lineOfSight();
  if (sees) { killer.state='chase'; killer.lastKnown = {...p}; }
  if (killer.state==='chase' && !sees && killer.lastKnown) { killer.state='search'; killer.searchTimer=6; }
  if (killer.state==='search') { killer.searchTimer -= dt; if (killer.searchTimer<=0) killer.state='patrol'; }
  let target;
  if (killer.state==='chase') target=p; else if (killer.state==='search' && killer.lastKnown) target=killer.lastKnown; else if (killer.target) target=killer.target; else { const node=level.patrolNodes[killer.patrolIndex % level.patrolNodes.length]; target={x:node.x,z:node.z}; if (dist(k,target)<.25) killer.patrolIndex++; }
  const speed = (killer.state==='chase' ? level.difficulty.killerChaseSpeed : level.difficulty.killerPatrolSpeed) * (killer.frenzy ? level.difficulty.frenzyMultiplier : 1);
  const dx=target.x-killer.x, dz=target.z-killer.z, d=Math.hypot(dx,dz);
  if (d>.02) { killer.x += dx/d*speed*dt; killer.z += dz/d*speed*dt; }
  if (killer.mesh) { killer.mesh.position.set(killer.x*cellSize,0,killer.z*cellSize); killer.mesh.lookAt(player.x*cellSize,0,killer.z*cellSize); }
  if (dist(k,p)<.55 && !player.hidden) showMessage('CAUGHT. Refresh to restart.');
  document.querySelector('#vignette').classList.toggle('danger', killer.state==='chase');
}
let last=performance.now(), sprinting=false;
function animate(){ requestAnimationFrame(animate); const now=performance.now(), dt=Math.min(.05,(now-last)/1000); last=now; moveAlong(dt); updateKiller(dt); updateStamina(dt); updateCamera(); updateUI(); renderer.render(scene,camera); }
function updateStamina(dt){ if(sprinting && player.path.length && !player.exhausted){ player.stamina -= 38*dt; if(player.stamina<=0){player.stamina=0; player.exhausted=true; showMessage('Exhausted. Heavy breathing gives you away.');}} else { player.stamina += (player.exhausted?14:22)*dt; if(player.stamina>=100){player.stamina=100; player.exhausted=false;} } }
function updateUI(){ document.querySelector('#stamina').style.transform=`scaleX(${player.stamina/100})`; document.querySelector('#objective').textContent=`Pills ${player.pills}/${level?.winCondition?.requiredPills||3} · ${killer.state}${killer.frenzy?' · FRENZY':''}`; document.querySelector('#battery').textContent = player.phoneOn ? `${Math.round(player.phoneBattery)}%` : 'OFF'; document.querySelector('#debug').textContent = `Asset fallback system active · Draco GLB enabled · ${Object.keys(manifest?.assets||{}).length} manifest entries`; }
function showMessage(t){ const el=document.querySelector('#message'); el.textContent=t; clearTimeout(showMessage.t); showMessage.t=setTimeout(()=>el.textContent='Tap floor to move. Tap nearby props to interact. Drag to look.', 3200); }

renderer.domElement.addEventListener('pointerdown', e=>{ dragging=true; sx=e.clientX; sy=e.clientY; moved=false; });
renderer.domElement.addEventListener('pointermove', e=>{ if(!dragging) return; const dx=e.clientX-sx, dy=e.clientY-sy; sx=e.clientX; sy=e.clientY; if(Math.abs(dx)+Math.abs(dy)>2)moved=true; player.yaw -= dx*.004; player.pitch = Math.max(-1.2, Math.min(1.2, player.pitch-dy*.003)); });
renderer.domElement.addEventListener('pointerup', e=>{ dragging=false; if(moved) return; pointer.x=(e.clientX/innerWidth)*2-1; pointer.y=-(e.clientY/innerHeight)*2+1; raycaster.setFromCamera(pointer,camera); const objHit=raycaster.intersectObjects(interactables.map(o=>o.model), true)[0]; if(objHit){ let root=objHit.object; while(root.parent && !root.userData.game) root=root.parent; if(root.userData.game) return interact(root.userData.game); } const hit=raycaster.intersectObjects(floorMeshes,false)[0]; if(hit){ const g=hit.object.userData.grid; const start=playerGrid(); player.path=bfs(start,g).map(n=>({x:n.x,z:n.z})); player.hidden=false; }});
let dragging=false, sx=0, sy=0, moved=false;
document.querySelector('#sprintBtn').addEventListener('pointerdown',()=>sprinting=true); document.querySelector('#sprintBtn').addEventListener('pointerup',()=>sprinting=false); document.querySelector('#sprintBtn').addEventListener('pointercancel',()=>sprinting=false);
document.querySelector('#phoneBtn').onclick=()=>{ if(!player.phoneOn) return showMessage('The phone is powered off permanently.'); document.querySelector('#phone').classList.toggle('on'); };
document.querySelector('#camBtn').onclick=()=>renderPhone('cams'); document.querySelector('#callBtn').onclick=()=>{ killer.state='distracted'; killer.target={x:killer.x,z:killer.z}; showMessage('You called the killer. He checks his pocket for 5 seconds.'); renderPhone('calling'); setTimeout(()=>{ if(killer.state==='distracted') killer.state='patrol'; },5000); }; document.querySelector('#offBtn').onclick=()=>{ player.phoneOn=false; document.querySelector('#phone').classList.remove('on'); showMessage('Phone powered off. It cannot be turned back on.'); };
function renderPhone(mode){ const body=document.querySelector('#phoneBody'); if(mode==='cams') body.innerHTML='<h3>SECURITY</h3><p style="filter:contrast(140%); background:#222; padding:36px 8px; border-radius:10px;">CAM 1 - STATIC<br>REC ●<br><br>grain / scanlines placeholder</p>'; else if(mode==='calling') body.innerHTML='<h3>UNKNOWN</h3><p>Dialing...</p><div style="font-size:42px;color:#33d56a">☎</div>'; else body.innerHTML='<h3>DID YOU GET MY MESSAGE?</h3><p>Battery failing. Cameras available. Calls are dangerous.</p>'; }
function interact(obj){
  if(obj.type==='pill'){ if(obj.collected) return; obj.collected=true; player.pills++; obj.model.visible=false; showMessage(`Medicine collected (${player.pills}/3).`); }
  else if(obj.type==='wardrobe'){ player.hidden=true; player.path=[]; showMessage('You hide inside the wardrobe and hold your breath.'); }
  else if(obj.type==='router'){ killer.frenzy=true; killer.state='chase'; showMessage('Router disconnected. Frenzy mode triggered.'); }
  else if(obj.type==='blinds_window'){ obj.asset='window_blinds_closed'; showMessage('Blinds closed. Line of sight is blocked.'); }
  else if(obj.type==='exit'){ if(player.pills >= level.winCondition.requiredPills) showMessage('You escaped through the back exit. YOU WIN.'); else showMessage('The exit will not open. Find all medicine first.'); }
  else if(obj.type==='distraction'){ killer.state='distracted'; killer.target={x:obj.x,z:obj.z}; showMessage(`${obj.id} triggered. The killer investigates.`); }
}
addEventListener('resize',()=>{ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); });
init();
