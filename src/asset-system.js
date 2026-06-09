import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

const KILLER_ANIMS = {
  idle: '/assets/models/characters/killer/animations/idle.fbx',
  walk: '/assets/models/characters/killer/animations/walk.fbx',
  chase: '/assets/models/characters/killer/animations/chase.fbx',
  run: '/assets/models/characters/killer/animations/run.fbx',
  search: '/assets/models/characters/killer/animations/search.fbx',
  attack: '/assets/models/characters/killer/animations/attack.fbx',
  phoneCheck: '/assets/models/characters/killer/animations/phone-check.fbx',
  stunned: '/assets/models/characters/killer/animations/stunned.fbx'
};

const RECORD_OVERRIDES = {
  killer_creeper: {
    type: 'model', format: 'fbx', fallback: 'humanoid', status: 'ready-slot',
    path: '/assets/models/characters/killer/creeper.fbx', scale: 0.01,
    animations: KILLER_ANIMS
  },
  killer_base_rig: { path: '/assets/models/characters/killer/creeper.fbx', format: 'fbx', scale: 0.01, animations: KILLER_ANIMS },
  killer_outfit_janitor_coveralls: { path: '/assets/models/characters/killer/creeper.fbx', format: 'fbx', scale: 0.01, animations: KILLER_ANIMS },
  killer_outfit_torn_business_suit: { path: '/assets/models/characters/killer/creeper.fbx', format: 'fbx', scale: 0.01, animations: KILLER_ANIMS },
  killer_outfit_rubber_apron: { path: '/assets/models/characters/killer/creeper.fbx', format: 'fbx', scale: 0.01, animations: KILLER_ANIMS },
  player_fp_hands_blue_plaid_neutral: { path: '/assets/models/characters/player/first-person/hands_blue_plaid_neutral.glb' },
  player_fp_hands_blue_plaid_phone_blank: { path: '/assets/models/characters/player/first-person/hands_blue_plaid_phone_blank.glb' },
  player_fp_hands_blue_plaid_phone_calling_green: { path: '/assets/models/characters/player/first-person/hands_blue_plaid_phone_calling_green.glb' },
  player_fp_hands_blue_plaid_phone_security_static: { path: '/assets/models/characters/player/first-person/hands_blue_plaid_phone_security_static.glb' },
  player_fp_hands_blue_plaid_fists: { path: '/assets/models/characters/player/first-person/hands_blue_plaid_fists.glb' },
  player_body_shadow_proxy: { path: '/assets/models/characters/player/player_body_shadow_proxy.glb' }
};

export async function loadJson(path, fallbackValue) {
  try {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${path} returned ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn(`[fallback-json] ${path}`, error);
    return fallbackValue;
  }
}

function extensionOf(path = '') {
  return path.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase() || '';
}

function cloneObject(root) {
  const clone = root.clone(true);
  clone.traverse((child) => {
    if (child.isMesh || child.isSkinnedMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.material?.clone) child.material = child.material.clone();
    }
  });
  return clone;
}

export class AssetSystem {
  constructor(scene, manifest) {
    this.scene = scene;
    this.manifest = manifest;
    this.cache = new Map();
    this.animationCache = new Map();

    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath(manifest?.draco?.decoderPath || 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    this.dracoLoader.setDecoderConfig({ type: manifest?.draco?.decoderType || 'js' });

    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setDRACOLoader(this.dracoLoader);
    this.fbxLoader = new FBXLoader();
  }

  getRecord(assetId) {
    const base = this.manifest?.assets?.[assetId] || null;
    const override = RECORD_OVERRIDES[assetId] || null;
    if (!base && !override) return null;
    return { ...(base || {}), ...(override || {}) };
  }

  getFallback(assetId) {
    const record = this.getRecord(assetId);
    const key = record?.fallback || record?.type || 'generic_box';
    return this.manifest?.fallbacks?.[key] || this.manifest?.fallbacks?.generic_box;
  }

  getCandidatePaths(assetId, record) {
    const candidates = [];
    if (record?.path) candidates.push(record.path);
    const overridePath = RECORD_OVERRIDES[assetId]?.path;
    if (overridePath && !candidates.includes(overridePath)) candidates.push(overridePath);
    return candidates;
  }

  async instantiate(assetId, options = {}) {
    const record = this.getRecord(assetId);
    let object = null;
    let animationClips = {};

    if (record?.type === 'model') {
      for (const path of this.getCandidatePaths(assetId, record)) {
        try {
          const loaded = await this.loadModel(path);
          object = loaded.object;
          animationClips = { ...loaded.namedAnimations };
          break;
        } catch (error) {
          console.warn(`[fallback-model-path] ${assetId} at ${path}`, error);
        }
      }
      if (object && record.animations) animationClips = { ...animationClips, ...(await this.loadExternalAnimations(record.animations)) };
      if (object) object.userData.assetStatus = 'loaded';
    }

    if (!object) object = this.createFallback(assetId);
    object.name = options.name || assetId;
    object.userData.assetId = assetId;
    object.userData.assetRecord = record;
    object.userData.animationClips = animationClips;
    object.position.set(options.x || 0, options.y || 0, options.z || 0);
    object.rotation.y = THREE.MathUtils.degToRad(options.rotation || 0);
    object.scale.multiplyScalar(options.scale ?? record?.scale ?? 1);
    return object;
  }

  async loadModel(path) {
    if (this.cache.has(path)) {
      const cached = this.cache.get(path);
      return { object: cloneObject(cached.object), namedAnimations: { ...cached.namedAnimations } };
    }
    const ext = extensionOf(path);
    let result;
    if (ext === 'glb' || ext === 'gltf') result = await this.loadGltf(path);
    else if (ext === 'fbx') result = await this.loadFbx(path);
    else throw new Error(`Unsupported model format: .${ext} (${path})`);
    this.cache.set(path, result);
    return { object: cloneObject(result.object), namedAnimations: { ...result.namedAnimations } };
  }

  loadGltf(path) {
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(path, (gltf) => {
        gltf.scene.traverse((child) => {
          if (child.isMesh || child.isSkinnedMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        resolve({ object: gltf.scene, namedAnimations: this.nameClips(gltf.animations || []) });
      }, undefined, reject);
    });
  }

  loadFbx(path) {
    return new Promise((resolve, reject) => {
      this.fbxLoader.load(path, (fbx) => {
        fbx.traverse((child) => {
          if (child.isMesh || child.isSkinnedMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        resolve({ object: fbx, namedAnimations: this.nameClips(fbx.animations || []) });
      }, undefined, reject);
    });
  }

  async loadExternalAnimations(animationMap = {}) {
    const clips = {};
    for (const [name, path] of Object.entries(animationMap)) {
      try {
        clips[name] = await this.loadAnimationClip(path, name);
      } catch (error) {
        console.warn(`[fallback-animation] ${name} at ${path}`, error);
      }
    }
    return clips;
  }

  async loadAnimationClip(path, preferredName) {
    const key = `${preferredName}:${path}`;
    if (this.animationCache.has(key)) return this.animationCache.get(key);
    const ext = extensionOf(path);
    const loaded = ext === 'fbx' ? await this.loadFbx(path) : await this.loadGltf(path);
    const clip = Object.values(loaded.namedAnimations)[0];
    if (!clip) throw new Error(`No animation clip found in ${path}`);
    clip.name = preferredName;
    this.animationCache.set(key, clip);
    return clip;
  }

  nameClips(clips) {
    return Object.fromEntries(clips.map((clip, index) => [clip.name || `clip_${index}`, clip]));
  }

  createFallback(assetId) {
    const fb = this.getFallback(assetId) || { shape: 'box', size: [1, 1, 1], color: '#777' };
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(fb.color || '#777'), roughness: 0.9, metalness: 0.05 });
    const size = fb.size || [1, 1, 1];
    let mesh;
    if (fb.shape === 'capsule') {
      mesh = new THREE.Mesh(new THREE.CapsuleGeometry(size[0] / 2, Math.max(0.2, size[1] - size[0]), 6, 12), mat);
      mesh.position.y += size[1] / 2;
    } else if (fb.shape === 'plane') {
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), mat);
      mesh.rotation.x = -Math.PI / 2;
    } else if (fb.shape === 'ui' || fb.shape === 'silent') {
      mesh = new THREE.Group();
    } else {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
      mesh.position.y += size[1] / 2;
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.assetStatus = 'fallback';
    mesh.userData.assetId = assetId;
    return mesh;
  }
}
