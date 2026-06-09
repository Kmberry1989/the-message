import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

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

function cloneObject(root) {
  const clone = root.clone(true);
  clone.traverse((child) => {
    if (child.isMesh || child.isSkinnedMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.material) child.material = child.material.clone ? child.material.clone() : child.material;
    }
  });
  return clone;
}

function extensionOf(path = '') {
  return path.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase() || '';
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
    return this.manifest?.assets?.[assetId] || null;
  }

  getFallback(assetId) {
    const record = this.getRecord(assetId);
    const key = record?.fallback || record?.type || 'generic_box';
    return this.manifest?.fallbacks?.[key] || this.manifest?.fallbacks?.generic_box;
  }

  async instantiate(assetId, options = {}) {
    const record = this.getRecord(assetId);
    let object = null;
    let animationClips = {};

    if (record?.type === 'model' && record.path) {
      try {
        const loaded = await this.loadModel(record.path);
        object = loaded.object;
        animationClips = { ...loaded.namedAnimations };
        if (record.animations) {
          animationClips = { ...animationClips, ...(await this.loadExternalAnimations(record.animations)) };
        }
        object.userData.assetStatus = 'loaded';
      } catch (error) {
        console.warn(`[fallback-model] ${assetId} at ${record.path}`, error);
      }
    }

    if (!object) object = this.createFallback(assetId);

    object.name = options.name || assetId;
    object.userData.assetId = assetId;
    object.userData.assetRecord = record;
    object.userData.animationClips = animationClips;

    object.position.set(options.x || 0, options.y || 0, options.z || 0);
    object.rotation.y = THREE.MathUtils.degToRad(options.rotation || 0);
    const s = options.scale ?? record?.scale ?? 1;
    object.scale.multiplyScalar(s);
    return object;
  }

  async loadModel(path) {
    if (this.cache.has(path)) {
      const cached = this.cache.get(path);
      return {
        object: cloneObject(cached.object),
        namedAnimations: { ...cached.namedAnimations }
      };
    }

    const ext = extensionOf(path);
    let result;
    if (ext === 'glb' || ext === 'gltf') {
      result = await this.loadGltf(path);
    } else if (ext === 'fbx') {
      result = await this.loadFbx(path);
    } else {
      throw new Error(`Unsupported model format: .${ext} (${path})`);
    }

    this.cache.set(path, result);
    return {
      object: cloneObject(result.object),
      namedAnimations: { ...result.namedAnimations }
    };
  }

  loadGltf(path) {
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(path, (gltf) => {
        const root = gltf.scene;
        root.traverse((child) => {
          if (child.isMesh || child.isSkinnedMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        resolve({
          object: root,
          namedAnimations: this.nameClips(gltf.animations || [])
        });
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
        resolve({
          object: fbx,
          namedAnimations: this.nameClips(fbx.animations || [])
        });
      }, undefined, reject);
    });
  }

  async loadExternalAnimations(animationMap = {}) {
    const clips = {};
    for (const [name, path] of Object.entries(animationMap)) {
      if (!path) continue;
      try {
        clips[name] = await this.loadAnimationClip(path, name);
      } catch (error) {
        console.warn(`[fallback-animation] ${name} at ${path}`, error);
      }
    }
    return clips;
  }

  async loadAnimationClip(path, preferredName) {
    const cacheKey = `${preferredName}:${path}`;
    if (this.animationCache.has(cacheKey)) return this.animationCache.get(cacheKey);

    const ext = extensionOf(path);
    let clips = [];
    if (ext === 'fbx') {
      const loaded = await this.loadFbx(path);
      clips = Object.values(loaded.namedAnimations);
    } else if (ext === 'glb' || ext === 'gltf') {
      const loaded = await this.loadGltf(path);
      clips = Object.values(loaded.namedAnimations);
    } else {
      throw new Error(`Unsupported animation format: .${ext} (${path})`);
    }

    const clip = clips[0];
    if (!clip) throw new Error(`No animation clip found in ${path}`);
    clip.name = preferredName;
    this.animationCache.set(cacheKey, clip);
    return clip;
  }

  nameClips(clips) {
    return Object.fromEntries(clips.map((clip, index) => [clip.name || `clip_${index}`, clip]));
  }

  createFallback(assetId) {
    const fb = this.getFallback(assetId) || { shape: 'box', size: [1, 1, 1], color: '#777' };
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(fb.color || '#777'), roughness: 0.9, metalness: 0.05 });
    let mesh;
    const size = fb.size || [1, 1, 1];
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
