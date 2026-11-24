import {
  AmbientLight,
  Box3,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  InstancedMesh,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { carveViews } from "../src/carve.ts";
import { cloudMode, createClouds } from "./clouds.js";

const VOXEL = 0.046;
const GROUND = 0.02;
const POLAR_MIN = 0.38;
const POLAR_MAX = Math.PI / 2 - 0.18;
const AZIMUTH_MIN = -0.7;
const AZIMUTH_MAX = 1.85;
const DISTANCE_MIN = 7.5;
const DISTANCE_MAX = 14.5;

async function loadView(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(url);
  const bitmap = await createImageBitmap(await response.blob());
  const width = bitmap.width;
  const height = bitmap.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  const image = context.getImageData(0, 0, width, height);
  bitmap.close();
  return { width, height, rgba: image.data };
}

async function loadPart(name) {
  const [front, back, side, top] = await Promise.all(
    ["front", "back", "side", "top"].map((view) => loadView(`/art/${name}-${view}.png`)),
  );
  return carveViews({ front, back, side, top });
}

function voxelMesh(voxels, pivot) {
  const box = new BoxGeometry(VOXEL, VOXEL, VOXEL).toNonIndexed();
  const srcPos = box.attributes.position;
  const srcNorm = box.attributes.normal;
  const positions = new Float32Array(srcPos.count * voxels.length * 3);
  const normals = new Float32Array(srcPos.count * voxels.length * 3);
  const colors = new Float32Array(srcPos.count * voxels.length * 3);
  voxels.forEach((voxel, voxelIndex) => {
    const ox = (voxel.x + 0.5 - pivot.x) * VOXEL;
    const oy = (voxel.y + 0.5 - pivot.y) * VOXEL;
    const oz = (voxel.z + 0.5 - pivot.z) * VOXEL;
    const red = ((voxel.color >> 16) & 255) / 255;
    const green = ((voxel.color >> 8) & 255) / 255;
    const blue = (voxel.color & 255) / 255;
    for (let i = 0; i < srcPos.count; i += 1) {
      const out = (voxelIndex * srcPos.count + i) * 3;
      positions[out] = srcPos.getX(i) + ox;
      positions[out + 1] = srcPos.getY(i) + oy;
      positions[out + 2] = srcPos.getZ(i) + oz;
      normals[out] = srcNorm.getX(i);
      normals[out + 1] = srcNorm.getY(i);
      normals[out + 2] = srcNorm.getZ(i);
      colors[out] = red;
      colors[out + 1] = green;
      colors[out + 2] = blue;
    }
  });
  box.dispose();
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return new Mesh(geometry, new MeshBasicMaterial({ vertexColors: true }));
}

function skyCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, "#6d4d9e");
  gradient.addColorStop(1, "#241038");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 2, 256);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function hash(text) {
  let value = 0;
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) >>> 0;
  return value;
}

export async function createScene(canvas) {
  const renderer = new WebGLRenderer({ canvas, antialias: canvas.clientWidth >= 768, alpha: false });
  renderer.outputColorSpace = SRGBColorSpace;
  const scene = new Scene();
  scene.background = skyCanvas();
  const camera = new PerspectiveCamera(30, 1, 0.1, 80);
  let distance = 10.5;
  let azimuth = 0.62;
  let polar = 1.05;

  scene.add(new HemisphereLight(0xcbb6ea, 0x6d8f48, 0.55));
  scene.add(new AmbientLight(0xfff4ea, 0.28));
  const sun = new DirectionalLight(0xffe4c4, 1.25);
  sun.position.set(4, 8, 3);
  scene.add(sun);

  const stars = new Group();
  const starMesh = new InstancedMesh(new BoxGeometry(0.06, 0.06, 0.06), new MeshLambertMaterial({ color: 0xfff6d2 }), 36);
  const dummy = new Object3D();
  for (let index = 0; index < 36; index += 1) {
    dummy.position.set((index % 9) * 1.5 - 6, 2.2 + (index % 5) * 0.55, -6 - (index % 4));
    dummy.scale.setScalar(index % 3 === 0 ? 1.6 : 1);
    dummy.updateMatrix();
    starMesh.setMatrixAt(index, dummy.matrix);
  }
  stars.add(starMesh);
  scene.add(stars);

  const clouds = createClouds(scene, cloudMode(canvas.clientWidth || window.innerWidth));
  canvas.dataset.clouds = clouds.mode;

  const island = new Group();
  const grass = new Mesh(
    new CircleGeometry(3.2, 64),
    new MeshStandardMaterial({ color: 0x6f9a52, roughness: 0.9, metalness: 0 }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = GROUND;
  const yard = new Mesh(
    new CircleGeometry(1.25, 40),
    new MeshStandardMaterial({ color: 0x8d6244, roughness: 1, metalness: 0 }),
  );
  yard.rotation.x = -Math.PI / 2;
  yard.position.set(0, GROUND + 0.004, 1.05);
  island.add(grass, yard);

  const [bodyVoxels, headVoxels, snoutVoxels, earVoxels, legVoxels, tailVoxels] = await Promise.all([
    loadPart("gos-body"),
    loadPart("gos-head"),
    loadPart("gos-snout"),
    loadPart("gos-ear"),
    loadPart("gos-leg"),
    loadPart("gos-tail"),
  ]);

  const wood = new MeshStandardMaterial({ color: 0xd7a36a, roughness: 0.84, metalness: 0 });
  const roofMat = new MeshStandardMaterial({ color: 0x8d4a55, roughness: 0.72, metalness: 0 });
  const doorMat = new MeshStandardMaterial({ color: 0x3a241c, roughness: 1, metalness: 0 });
  const house = new Group();
  const walls = new Mesh(new BoxGeometry(1.35, 0.82, 1.1), wood);
  walls.position.y = 0.41;
  const roof = new Mesh(new ConeGeometry(1.02, 0.52, 4), roofMat);
  roof.position.y = 1.02;
  roof.rotation.y = Math.PI / 4;
  const door = new Mesh(new BoxGeometry(0.4, 0.52, 0.04), doorMat);
  door.position.set(0, 0.26, 0.56);
  house.add(walls, roof, door);
  house.position.set(0, GROUND, -1.25);
  island.add(house);

  const dog = new Group();
  const measure = (voxels) => {
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const voxel of voxels) {
      min.x = Math.min(min.x, voxel.x);
      min.y = Math.min(min.y, voxel.y);
      min.z = Math.min(min.z, voxel.z);
      max.x = Math.max(max.x, voxel.x + 1);
      max.y = Math.max(max.y, voxel.y + 1);
      max.z = Math.max(max.z, voxel.z + 1);
    }
    return { min, max };
  };
  const mid = (ext, axis) => (ext.min[axis] + ext.max[axis]) / 2;
  const bodyExt = measure(bodyVoxels);
  const headExt = measure(headVoxels);
  const snoutExt = measure(snoutVoxels);
  const earExt = measure(earVoxels);
  const legExt = measure(legVoxels);
  const tailExt = measure(tailVoxels);
  const body = voxelMesh(bodyVoxels, { x: mid(bodyExt, "x"), y: bodyExt.min.y, z: mid(bodyExt, "z") });
  const headMesh = voxelMesh(headVoxels, { x: mid(headExt, "x"), y: headExt.min.y, z: mid(headExt, "z") });
  const snout = voxelMesh(snoutVoxels, { x: mid(snoutExt, "x"), y: mid(snoutExt, "y"), z: snoutExt.min.z });
  const tail = voxelMesh(tailVoxels, { x: mid(tailExt, "x"), y: mid(tailExt, "y"), z: tailExt.max.z });
  const legH = (legExt.max.y - legExt.min.y) * VOXEL;
  const bodyH = (bodyExt.max.y - bodyExt.min.y) * VOXEL;
  const bodyD = (bodyExt.max.z - bodyExt.min.z) * VOXEL;
  const bodyW = (bodyExt.max.x - bodyExt.min.x) * VOXEL;
  const headH = (headExt.max.y - headExt.min.y) * VOXEL;
  const headW = (headExt.max.x - headExt.min.x) * VOXEL;
  const headD = (headExt.max.z - headExt.min.z) * VOXEL;
  body.position.y = legH * 0.55;
  const head = new Group();
  head.position.set(0, body.position.y + bodyH * 0.78, bodyD * 0.34);
  snout.position.set(0, -headH * 0.28, headD * 0.62);
  const ears = [-1, 1].map((side) => {
    const flap = voxelMesh(earVoxels, { x: mid(earExt, "x"), y: earExt.max.y, z: mid(earExt, "z") });
    flap.position.set(side * (headW * 0.46 + 0.02), headH * 0.42, 0.02);
    flap.rotation.z = side * 0.55;
    head.add(flap);
    return flap;
  });
  head.add(headMesh, snout);
  const legs = [0, 1, 2, 3].map((index) => {
    const limb = voxelMesh(legVoxels, { x: mid(legExt, "x"), y: legExt.max.y, z: mid(legExt, "z") });
    limb.position.set(index % 2 === 0 ? -bodyW * 0.34 : bodyW * 0.34, legH, index < 2 ? bodyD * 0.3 : -bodyD * 0.28);
    dog.add(limb);
    return limb;
  });
  tail.position.set(0, body.position.y + bodyH * 0.62, -bodyD * 0.48);
  tail.rotation.x = -0.6;
  dog.add(body, head, tail);
  const bodyRest = body.position.y;
  dog.position.y = GROUND;
  island.add(dog);
  scene.add(island);

  const mounds = new Map();
  const holes = [];
  const moundRoot = new Group();
  island.add(moundRoot);
  const footprintRoot = new Group();
  island.add(footprintRoot);

  let mood = "awake";
  let night = false;
  let puppy = false;
  let mode = "wander";
  const target = new Vector3(0.4, GROUND, 0.6);
  let sniff = 0;
  let time = 0;
  let speechText = "";
  const bubbleRoot = document.querySelector("#float-bubbles");
  const zzz = document.querySelector("#zzz");
  const speech = document.querySelector("#speech");
  const safeProbe = document.createElement("div");
  safeProbe.style.cssText = "position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
  document.body.append(safeProbe);

  function placeOnYard(id) {
    const seed = hash(id);
    const angle = ((seed % 100) / 100) * 1.1 - 0.55;
    const radius = 0.75 + (seed % 6) * 0.1;
    return { x: Math.sin(angle) * radius, z: 1.05 + Math.cos(angle) * radius * 0.35 };
  }

  function addMound(id) {
    const spot = placeOnYard(id);
    const group = new Group();
    const heap = new Mesh(
      new CylinderGeometry(0.22, 0.32, 0.22, 6),
      new MeshLambertMaterial({ color: 0x8a5a38, flatShading: true }),
    );
    const bone = new Mesh(new BoxGeometry(0.28, 0.08, 0.08), new MeshLambertMaterial({ color: 0xf4efe4 }));
    bone.position.y = 0.16;
    group.add(heap, bone);
    group.position.set(spot.x, GROUND + 0.01, spot.z);
    moundRoot.add(group);
    mounds.set(id, { group, ...spot });
  }

  function addHole(spot) {
    const hole = new Mesh(
      new CylinderGeometry(0.16, 0.12, 0.06, 6),
      new MeshLambertMaterial({ color: 0x3a2418, flatShading: true }),
    );
    hole.position.set(spot.x, GROUND + 0.006, spot.z);
    moundRoot.add(hole);
    holes.push(spot);
  }

  function syncBones(bones) {
    const next = new Set(bones.map((bone) => bone.id));
    for (const [id, mound] of mounds) {
      if (!next.has(id)) {
        mound.group.removeFromParent();
        addHole(mound);
        mounds.delete(id);
      }
    }
    for (const bone of bones) {
      if (!mounds.has(bone.id)) addMound(bone.id);
    }
  }

  function syncFootprints(count) {
    footprintRoot.clear();
    const total = Math.min(count, 5);
    for (let index = 0; index < total; index += 1) {
      const print = new Mesh(new BoxGeometry(0.1, 0.02, 0.16), new MeshLambertMaterial({ color: 0x3f5a32 }));
      print.position.set(-0.7 + index * 0.22, GROUND + 0.008, -0.55);
      print.rotation.y = index % 2 === 0 ? 0.4 : -0.3;
      footprintRoot.add(print);
    }
  }

  function desiredMode() {
    if (mood === "barking") return "bark";
    if (mood === "sulking") return "dig";
    if (mood === "dreaming") return "dream";
    if (mood === "sleepy" || night) return "sleep";
    return "wander";
  }

  function pickWander() {
    const angle = Math.random() * Math.PI * 1.2 - 0.4;
    const radius = 0.4 + Math.random() * 1.5;
    target.set(Math.sin(angle) * radius, GROUND, Math.cos(angle) * radius * 0.8 + 0.15);
  }

  function applyMode() {
    const next = desiredMode();
    if (next === mode) return;
    mode = next;
    if (mode === "bark") target.set(2.55, GROUND, 0.85);
    else if (mode === "dig") {
      const hole = holes[holes.length - 1];
      target.set(hole ? hole.x : 0, GROUND, hole ? hole.z : 1.05);
    } else if (mode === "sleep") target.set(0, GROUND, -0.85);
    else if (mode === "dream") target.set(0.2, GROUND, 0.55);
    else pickWander();
  }

  function updateCamera() {
    polar = MathUtils.clamp(polar, POLAR_MIN, POLAR_MAX);
    azimuth = MathUtils.clamp(azimuth, AZIMUTH_MIN, AZIMUTH_MAX);
    distance = MathUtils.clamp(distance, DISTANCE_MIN, DISTANCE_MAX);
    const focus = new Vector3(0, 0.32, 0);
    camera.position.set(
      focus.x + Math.sin(polar) * Math.sin(azimuth) * distance,
      focus.y + Math.cos(polar) * distance,
      focus.z + Math.sin(polar) * Math.cos(azimuth) * distance,
    );
    camera.lookAt(focus);
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    const narrow = width < 768;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, narrow ? 1.5 : 2));
    renderer.setSize(width, height, false);
  }

  let pointer = null;
  canvas.addEventListener("pointerdown", (event) => {
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    azimuth -= (event.clientX - pointer.x) * 0.008;
    polar -= (event.clientY - pointer.y) * 0.005;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    updateCamera();
  });
  const endPointer = () => {
    pointer = null;
  };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      distance = MathUtils.clamp(distance * (1 + event.deltaY * 0.001), DISTANCE_MIN, DISTANCE_MAX);
      updateCamera();
    },
    { passive: false },
  );

  let frame = 0;
  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    island.position.y = Math.sin(time * 0.8) * 0.05;
    clouds.update(time);
    applyMode();
    const dx = target.x - dog.position.x;
    const dz = target.z - dog.position.z;
    const distance = Math.hypot(dx, dz);
    const speed = mode === "wander" || mode === "dream" ? 0.55 : 1.15;
    const walking = distance > 0.08 && !(mode === "sleep" && distance < 0.2);
    if (distance > 0.08) {
      const step = Math.min(distance, speed * dt);
      dog.position.x += (dx / distance) * step;
      dog.position.z += (dz / distance) * step;
      if (mode === "bark") dog.rotation.y = Math.atan2(dog.position.x, dog.position.z);
      else dog.rotation.y = Math.atan2(dx, dz);
    }
    const stepPhase = walking || mode === "dig" || mode === "bark" ? time * (mode === "dig" ? 14 : 8) : 0;
    legs.forEach((leg, index) => {
      leg.rotation.x = Math.sin(stepPhase + index * Math.PI) * (mode === "dig" ? 0.9 : walking ? 0.55 : 0);
    });
    if (mode === "dig" || sniff > 0) head.rotation.x = 0.4;
    else if (mode === "bark") head.rotation.x = -0.3;
    else head.rotation.x = 0;
    head.rotation.z = mode === "wander" ? Math.sin(time * 1.4) * 0.08 : 0;
    body.position.y = bodyRest + (walking ? Math.abs(Math.sin(time * 10)) * 0.03 : 0);
    dog.visible = !(mode === "sleep" && distance < 0.25);
    ears.forEach((flap, index) => {
      const base = index === 0 ? -0.4 : 0.4;
      flap.rotation.z = base + Math.sin(time * 2.2 + index) * 0.08;
    });
    tail.rotation.y = mode === "sulking" ? 0.2 : Math.sin(time * 8) * 0.65;
    dog.position.y = GROUND + (walking ? 0 : Math.sin(time * 2.4) * 0.02);
    sniff = Math.max(0, sniff - dt);
    if (mode === "wander" && distance <= 0.08) {
      const near = [...mounds.values()].find((mound) => Math.hypot(mound.x - dog.position.x, mound.z - dog.position.z) < 0.45);
      if (near) sniff = 0.8;
      pickWander();
    }
    dog.scale.setScalar(puppy ? 0.72 : 1);
    placeBubbles();
    renderer.render(scene, camera);
    frame = requestAnimationFrame(tick);
  }

  updateCamera();
  pickWander();
  frame = requestAnimationFrame(tick);
  const observer = new ResizeObserver(() => updateCamera());
  observer.observe(canvas.parentElement ?? canvas);

  function placeBubbles() {
    const showZ = mode === "dream" || mode === "sleep";
    zzz.hidden = !showZ;
    speech.hidden = !speechText;
    speech.textContent = speechText;
    bubbleRoot.hidden = zzz.hidden && speech.hidden;
    if (bubbleRoot.hidden) return;
    const box = new Box3().setFromObject(dog.visible ? dog : house);
    const anchor = new Vector3((box.min.x + box.max.x) / 2, box.max.y + 0.18, (box.min.z + box.max.z) / 2);
    const projected = anchor.project(camera);
    const canvasRect = canvas.getBoundingClientRect();
    const px = (projected.x * 0.5 + 0.5) * canvasRect.width + canvasRect.left;
    const py = (-projected.y * 0.5 + 0.5) * canvasRect.height + canvasRect.top;
    const width = bubbleRoot.offsetWidth;
    const height = bubbleRoot.offsetHeight;
    const pad = getComputedStyle(safeProbe);
    const minLeft = (parseFloat(pad.paddingLeft) || 0) + 8;
    const minTop = (parseFloat(pad.paddingTop) || 0) + 8;
    const maxLeft = window.innerWidth - (parseFloat(pad.paddingRight) || 0) - 8 - width;
    const maxTop = window.innerHeight - (parseFloat(pad.paddingBottom) || 0) - 8 - height;
    const left = Math.min(Math.max(px - width / 2, minLeft), Math.max(minLeft, maxLeft));
    const top = Math.min(Math.max(py - height, minTop), Math.max(minTop, maxTop));
    bubbleRoot.style.left = `${left}px`;
    bubbleRoot.style.top = `${top}px`;
  }

  return {
    setSpeech(text) {
      const clean = text ? text.replace(/\s+/g, " ").trim() : "";
      speechText = clean.length > 140 ? `${clean.slice(0, 137)}...` : clean;
    },
    setState(state) {
      mood = state.mood;
      night = Boolean(state.night);
      puppy = state.life === "puppy" || state.mood === "puppy";
      syncBones(state.owner ? state.bones : []);
      syncFootprints(state.owner ? state.gossip.length : 0);
      applyMode();
    },
    resize: updateCamera,
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.dispose();
    },
  };
}
