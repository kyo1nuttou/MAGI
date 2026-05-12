import * as THREE from "/vendor/three/build/three.module.js";
import { FBXLoader } from "/vendor/three/examples/jsm/loaders/FBXLoader.js";

const MODEL_URL = "/assets/wireframe-man.fbx";
const AVATARS = {
  romantic: {
    color: 0xff321f,
    glow: 0x7a130d,
    rotationOffset: -0.18,
  },
  rational: {
    color: 0x8dc8ff,
    glow: 0x123b66,
    rotationOffset: 0,
  },
  entertainer: {
    color: 0xff9d22,
    glow: 0x6d3306,
    rotationOffset: 0.18,
  },
};

const stages = [...document.querySelectorAll("[data-avatar]")];
const loader = new FBXLoader();
const clock = new THREE.Clock();
const viewers = [];

function createFallbackModel(color) {
  const root = new THREE.Group();
  const material = new THREE.LineBasicMaterial({ color });

  const parts = [
    { geometry: new THREE.SphereGeometry(0.18, 12, 8), position: [0, 1.12, 0] },
    { geometry: new THREE.BoxGeometry(0.44, 0.72, 0.22), position: [0, 0.58, 0] },
    { geometry: new THREE.BoxGeometry(0.12, 0.58, 0.12), position: [-0.34, 0.55, 0] },
    { geometry: new THREE.BoxGeometry(0.12, 0.58, 0.12), position: [0.34, 0.55, 0] },
    { geometry: new THREE.BoxGeometry(0.14, 0.7, 0.12), position: [-0.15, -0.13, 0] },
    { geometry: new THREE.BoxGeometry(0.14, 0.7, 0.12), position: [0.15, -0.13, 0] },
  ];

  parts.forEach((part) => {
    const edges = new THREE.EdgesGeometry(part.geometry);
    const lines = new THREE.LineSegments(edges, material);
    lines.position.set(...part.position);
    root.add(lines);
  });

  root.userData.isFallback = true;
  return root;
}

function prepareModel(source, avatarConfig) {
  const model = source.clone(true);
  const wireGroup = new THREE.Group();
  const lineMaterial = new THREE.LineBasicMaterial({
    color: avatarConfig.color,
    transparent: true,
    opacity: 0.98,
  });

  model.updateMatrixWorld(true);
  model.traverse((child) => {
    if (child.isMesh || child.isSkinnedMesh) {
      const geometry = new THREE.WireframeGeometry(child.geometry);
      const lines = new THREE.LineSegments(geometry, lineMaterial.clone());
      lines.applyMatrix4(child.matrixWorld);
      lines.frustumCulled = false;
      wireGroup.add(lines);
    }
    if (child.isLine || child.isLineSegments) {
      const lines = child.clone();
      lines.material = lineMaterial.clone();
      lines.applyMatrix4(child.matrixWorld);
      lines.frustumCulled = false;
      wireGroup.add(lines);
    }
  });

  if (!wireGroup.children.length) return createFallbackModel(avatarConfig.color);

  normalizeModel(wireGroup);
  return wireGroup;
}

function normalizeModel(model) {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const largest = Math.max(size.x, size.y, size.z) || 1;
  const scale = 1.75 / largest;
  model.scale.multiplyScalar(scale);
  model.position.sub(center.multiplyScalar(scale));
  model.position.y -= 0.1;
}

function addGround(scene, color) {
  const ringMaterial = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.55,
  });
  const geometry = new THREE.BufferGeometry();
  const points = [];
  const radius = 0.82;
  for (let i = 0; i <= 64; i += 1) {
    const angle = (i / 64) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, -0.98, Math.sin(angle) * radius));
  }
  geometry.setFromPoints(points);
  scene.add(new THREE.Line(geometry, ringMaterial));
}

function addBustGuide(scene, color) {
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.42,
  });
  const geometry = new THREE.BufferGeometry();
  const points = [
    new THREE.Vector3(-0.52, 0.04, 0),
    new THREE.Vector3(-0.28, 0.1, 0),
    new THREE.Vector3(0, 0.12, 0),
    new THREE.Vector3(0.28, 0.1, 0),
    new THREE.Vector3(0.52, 0.04, 0),
  ];
  geometry.setFromPoints(points);
  scene.add(new THREE.Line(geometry, material));
}

function createViewer(stage, baseModel) {
  const id = stage.dataset.avatar;
  const config = AVATARS[id];
  const canvas = stage.querySelector("canvas");
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    canvas,
    powerPreference: "high-performance",
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  camera.position.set(0, 0.48, 1.08);
  camera.lookAt(0, 0.48, 0);

  const avatar = baseModel ? prepareModel(baseModel, config) : createFallbackModel(config.color);
  avatar.rotation.y = config.rotationOffset;
  scene.add(avatar);
  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  addBustGuide(scene, config.color);

  const backLight = new THREE.PointLight(config.glow, 5, 6);
  backLight.position.set(0, 1.6, -1.2);
  scene.add(backLight);

  const resize = () => {
    const rect = stage.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(stage);

  const label = stage.querySelector("span");
  if (label) label.textContent = baseModel ? "FBX LINKED" : "FALLBACK MODEL";

  viewers.push({ avatar, renderer, scene, camera, offset: config.rotationOffset });
}

function animate() {
  const elapsed = clock.getElapsedTime();
  viewers.forEach((viewer) => {
    viewer.avatar.rotation.y = viewer.offset + Math.sin(elapsed * 0.8) * 0.16;
    viewer.avatar.rotation.x = Math.sin(elapsed * 0.55) * 0.035;
    viewer.renderer.render(viewer.scene, viewer.camera);
  });
  window.requestAnimationFrame(animate);
}

function boot(baseModel = null) {
  stages.forEach((stage) => createViewer(stage, baseModel));
  animate();
}

loader.load(
  MODEL_URL,
  (object) => boot(object),
  undefined,
  (error) => {
    console.warn("FBX avatar load failed. Using fallback model.", error);
    boot();
  }
);
