import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { carveViews, projectViews, type Voxel } from "../src/carve.js";

const FUR = 0xf4d7b0;
const SHADE = 0xd7a36a;
const EAR = 0xc47a45;
const INK = 0x2a211c;
const COLLAR = 0xd94a3a;
const WALL = 0xc4844a;
const ROOF = 0x7d342e;
const POST = 0x6b3a22;

function box(out: Voxel[], x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number): void {
  for (let x = x0; x <= x1; x += 1) {
    for (let y = y0; y <= y1; y += 1) {
      for (let z = z0; z <= z1; z += 1) out.push({ x, y, z, color });
    }
  }
}

function paint(out: Voxel[], x: number, y: number, z: number, color: number): void {
  const found = out.find((voxel) => voxel.x === x && voxel.y === y && voxel.z === z);
  if (found) found.color = color;
  else out.push({ x, y, z, color });
}

function ellipsoid(
  out: Voxel[],
  cx: number,
  cy: number,
  cz: number,
  rx: number,
  ry: number,
  rz: number,
  color: number,
): void {
  const x0 = Math.floor(cx - rx);
  const x1 = Math.ceil(cx + rx);
  const y0 = Math.floor(cy - ry);
  const y1 = Math.ceil(cy + ry);
  const z0 = Math.floor(cz - rz);
  const z1 = Math.ceil(cz + rz);
  for (let x = x0; x <= x1; x += 1) {
    for (let y = y0; y <= y1; y += 1) {
      for (let z = z0; z <= z1; z += 1) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        const dz = (z + 0.5 - cz) / rz;
        if (dx * dx + dy * dy + dz * dz <= 1 && x >= 0 && y >= 0 && z >= 0) {
          out.push({ x, y, z, color });
        }
      }
    }
  }
}

function shadeLow(voxels: Voxel[], cutoff: number): void {
  for (const voxel of voxels) {
    if (voxel.y <= cutoff && voxel.color === FUR) voxel.color = SHADE;
  }
}

function rim(voxels: Voxel[], axis: "x" | "y" | "z", sign: 1 | -1): void {
  const other = (["x", "y", "z"] as const).filter((key) => key !== axis);
  const [a, b] = other;
  const face = new Map<string, Voxel>();
  for (const voxel of voxels) {
    const key = `${voxel[a]},${voxel[b]}`;
    const current = face.get(key);
    if (!current || sign * voxel[axis] > sign * current[axis]) face.set(key, voxel);
  }
  for (const voxel of face.values()) {
    const edge =
      !face.has(`${voxel[a] - 1},${voxel[b]}`) ||
      !face.has(`${voxel[a] + 1},${voxel[b]}`) ||
      !face.has(`${voxel[a]},${voxel[b] - 1}`) ||
      !face.has(`${voxel[a]},${voxel[b] + 1}`);
    if (edge && voxel.color !== COLLAR) voxel.color = INK;
  }
}

function outline(voxels: Voxel[]): void {
  rim(voxels, "z", 1);
  rim(voxels, "z", -1);
  rim(voxels, "x", 1);
  rim(voxels, "x", -1);
  rim(voxels, "y", 1);
}

function body(): { voxels: Voxel[]; size: { x: number; y: number; z: number } } {
  const voxels: Voxel[] = [];
  const size = { x: 28, y: 18, z: 32 };
  ellipsoid(voxels, 14, 8, 15, 9.5, 5.6, 12.5, FUR);
  shadeLow(voxels, 6);
  for (const voxel of voxels) {
    if (voxel.z >= 22 && voxel.y >= 7 && voxel.y <= 11 && voxel.x >= 8 && voxel.x <= 19) voxel.color = COLLAR;
  }
  outline(voxels);
  return { voxels, size };
}

function head(): { voxels: Voxel[]; size: { x: number; y: number; z: number } } {
  const voxels: Voxel[] = [];
  const size = { x: 26, y: 24, z: 24 };
  ellipsoid(voxels, 13, 12, 10, 8, 7.2, 7.2, FUR);
  shadeLow(voxels, 8);
  outline(voxels);
  const frontOf = (x: number, y: number) =>
    voxels.reduce((best, voxel) => (voxel.x === x && voxel.y === y ? Math.max(best, voxel.z) : best), -1);
  for (let y = 13; y <= 16; y += 1) {
    for (let x = 8; x <= 10; x += 1) paint(voxels, x, y, frontOf(x, y), INK);
    for (let x = 16; x <= 18; x += 1) paint(voxels, x, y, frontOf(x, y), INK);
  }
  return { voxels, size };
}

function snout(): { voxels: Voxel[]; size: { x: number; y: number; z: number } } {
  const voxels: Voxel[] = [];
  const size = { x: 16, y: 12, z: 16 };
  ellipsoid(voxels, 8, 5.5, 8, 4.2, 3.3, 5.4, SHADE);
  outline(voxels);
  const frontOf = (x: number, y: number) =>
    voxels.reduce((best, voxel) => (voxel.x === x && voxel.y === y ? Math.max(best, voxel.z) : best), -1);
  for (let y = 5; y <= 7; y += 1) {
    for (let x = 6; x <= 9; x += 1) {
      const z = frontOf(x, y);
      if (z >= 0) paint(voxels, x, y, z, INK);
    }
  }
  return { voxels, size };
}

function ear(): { voxels: Voxel[]; size: { x: number; y: number; z: number } } {
  const voxels: Voxel[] = [];
  const size = { x: 8, y: 16, z: 10 };
  ellipsoid(voxels, 4, 7, 5, 2.1, 6.2, 2.3, EAR);
  outline(voxels);
  return { voxels, size };
}

function leg(): { voxels: Voxel[]; size: { x: number; y: number; z: number } } {
  const voxels: Voxel[] = [];
  const size = { x: 8, y: 16, z: 8 };
  ellipsoid(voxels, 4, 8.5, 4, 2.1, 5.6, 2.1, FUR);
  ellipsoid(voxels, 4, 2.4, 4.6, 2.8, 2.1, 2.9, SHADE);
  outline(voxels);
  return { voxels, size };
}

function tail(): { voxels: Voxel[]; size: { x: number; y: number; z: number } } {
  const voxels: Voxel[] = [];
  const size = { x: 8, y: 8, z: 18 };
  ellipsoid(voxels, 4, 4, 8, 2.3, 2.3, 7.4, FUR);
  shadeLow(voxels, 3);
  outline(voxels);
  return { voxels, size };
}

function house(): { voxels: Voxel[]; size: { x: number; y: number; z: number } } {
  const voxels: Voxel[] = [];
  box(voxels, 0, 0, 0, 19, 8, 15, WALL);
  const door = new Set<string>();
  for (let x = 7; x <= 12; x += 1) {
    for (let y = 0; y <= 6; y += 1) {
      for (let z = 0; z <= 15; z += 1) door.add(`${x},${y},${z}`);
    }
  }
  const kept = voxels.filter((voxel) => !door.has(`${voxel.x},${voxel.y},${voxel.z}`));
  voxels.length = 0;
  voxels.push(...kept);
  for (let y = 0; y <= 7; y += 1) {
    paint(voxels, 6, y, 15, POST);
    paint(voxels, 13, y, 15, POST);
  }
  for (let y = 9; y <= 14; y += 1) {
    const inset = y - 8;
    box(voxels, inset, y, inset, 19 - inset, y, 15 - inset, ROOF);
  }
  return { voxels, size: { x: 20, y: 16, z: 16 } };
}

function png(width: number, height: number, rgba: Uint8Array): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength).copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

const parts = {
  "gos-body": body(),
  "gos-head": head(),
  "gos-snout": snout(),
  "gos-ear": ear(),
  "gos-leg": leg(),
  "gos-tail": tail(),
} as const;

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../art");
mkdirSync(dir, { recursive: true });

for (const [name, part] of Object.entries(parts)) {
  const views = projectViews(part.voxels, part.size);
  const carved = carveViews(views);
  const wanted = new Set(part.voxels.map((voxel) => `${voxel.x},${voxel.y},${voxel.z}`));
  const got = new Set(carved.map((voxel) => `${voxel.x},${voxel.y},${voxel.z}`));
  const missing = [...wanted].filter((key) => !got.has(key));
  if (missing.length) {
    throw new Error(`${name} lost ${missing.length} voxels in the visual hull`);
  }
  console.log(`${name}: drew ${wanted.size}, hull keeps them and adds ${got.size - wanted.size}`);
  for (const [viewName, view] of Object.entries(views)) {
    const file = path.join(dir, `${name}-${viewName}.png`);
    writeFileSync(file, png(view.width, view.height, view.rgba as Uint8Array));
  }
  }
