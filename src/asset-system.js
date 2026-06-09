
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

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

export class AssetSystem {
  constructor(scene, manifest) {
    this.scene = scene;
    this.manifest = manifest;
    this.cache = new Map();
    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath(manifest?.draco?.decoderPath || 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    this.dracoLoader.setDecoderConfig({ type: 'js' });
    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setDRACOLoader(this.dracoLoader);
  }

  getRecord(assetId) { return this.manifest?.assets?.[assetId] || null; }
  getFallback(assetId) {
    const record = this.getRecord(assetId);
    const key = record?.fallback || record?.type || 'generic_box';
    return this.manifest?.fallbacks?.[key] || this.manifest?.fallbacks?.generic_box;
  }

  async instantiate(assetId, options = {}) {
    const record = this.getRecord(assetId);
    let object = null;
    if (record?.type === 'model' && record.path) {
      try {
        object = await this.loadModel(record.path);
        object.userData.assetStatus = 'loaded';
      } catch (error) {
        console.warn(`[fallback-model] ${assetId}`, error);
      }
    }
    if (!object) object = this.createFallback(assetId);
    object.name = options.name || assetId;
    object.position.set(options.x || 0, options.y || 0, options.z || 0);
    object.rotation.y = THREE.MathUtils.degToRad(options.rotation || 0);
    const s = options.scale ?? 1;
    object.scale.multiplyScalar(s);
    return object;
  }

  loadModel(path) {
    if (this.cache.has(path)) return Promise.resolve(this.cache.get(path).clone(true));
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(path, (gltf) => {
        const root = gltf.scene;
        root.traverse((child) => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
        this.cache.set(path, root);
        resolve(root.clone(true));
      }, undefined, reject);
    });
  }

  createFallback(assetId) {
    const fb = this.getFallback(assetId) || { shape: 'box', size:[1,1,1], color:'#777' };
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(fb.color || '#777'), roughness: .9, metalness: .05 });
    let mesh;
    const size = fb.size || [1,1,1];
    if (fb.shape === 'capsule') {
      mesh = new THREE.Mesh(new THREE.CapsuleGeometry(size[0]/2, Math.max(0.2, size[1]-size[0]), 6, 12), mat);
      mesh.position.y += size[1]/2;
    } else if (fb.shape === 'plane') {
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), mat);
      mesh.rotation.x = -Math.PI / 2;
    } else {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
      mesh.position.y += size[1]/2;
    }
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.assetStatus = 'fallback';
    mesh.userData.assetId = assetId;
    return mesh;
  }
}
