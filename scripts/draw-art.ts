import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { carveViews, projectViews, type Voxel } from "../src/carve.js";

const FUR = 0xf2d2a6;
const EAR = 0xd6a46c;
const INK = 0x241c16;
const COLLAR = 0xe24b32;
const TONGUE = 0xe25b6a;
const PAW = 0xc4a574;
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

function body(): { voxels: Voxel[]; size: { x: number; y: number; z: number } } {
  const voxels: Voxel[] = [];
  box(voxels, 1, 0, 0, 12, 6, 11, FUR);
  for (let x = 3; x <= 10; x += 1) paint(voxels, x, 4, 11, COLLAR);
  for (let y = 1; y <= 4; y += 1) {
    for (let z = 3; z <= 7; z += 1) paint(voxels, 12, y, z, EAR);
  }
  return { voxels, size: { x: 14, y: 8, z: 12 } };
}

function head(): { voxels: Voxel[]; size: { x: number; y: number; z: number } } {
  const voxels: Voxel[] = [];
  box(voxels, 2, 1, 1, 9, 8, 9, FUR);
  box(voxels, 0, 7, 2, 2, 11, 6, EAR);
  box(voxels, 9, 7, 2, 11, 11, 6, EAR);
  box(voxels, 4, 2, 9, 7, 5, 11, FUR);
  for (let y = 5; y <= 7; y += 1) {
    paint(voxels, 3, y, 9, INK);
    paint(voxels, 4, y, 9, INK);
    paint(voxels, 7, y, 9, INK);
    paint(voxels, 8, y, 9, INK);
  }
  paint(voxels, 5, 4, 11, INK);
  paint(voxels, 6, 4, 11, INK);
  paint(voxels, 5, 3, 11, TONGUE);
  paint(voxels, 6, 3, 11, TONGUE);
  return { voxels, size: { x: 12, y: 12, z: 12 } };
}

function leg(): { voxels: Voxel[]; size: { x: number; y: number; z: number } } {
  const voxels: Voxel[] = [];
  box(voxels, 0, 1, 0, 3, 6, 3, FUR);
  box(voxels, 0, 0, 0, 3, 0, 3, PAW);
  return { voxels, size: { x: 4, y: 7, z: 4 } };
}

function tail(): { voxels: Voxel[]; size: { x: number; y: number; z: number } } {
  const voxels: Voxel[] = [];
  box(voxels, 1, 0, 0, 2, 2, 4, FUR);
  box(voxels, 1, 2, 3, 2, 5, 6, FUR);
  return { voxels, size: { x: 4, y: 6, z: 8 } };
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
  "gos-leg": leg(),
  "gos-tail": tail(),
  "doghouse": house(),
} as const;

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../art");
mkdirSync(dir, { recursive: true });

for (const [name, part] of Object.entries(parts)) {
  const views = projectViews(part.voxels, part.size);
  const carved = carveViews(views);
  const wanted = new Set(part.voxels.map((voxel) => `${voxel.x},${voxel.y},${voxel.z}`));
  const got = new Set(carved.map((voxel) => `${voxel.x},${voxel.y},${voxel.z}`));
  if (wanted.size !== got.size || [...wanted].some((key) => !got.has(key))) {
    throw new Error(`${name} visual hull ${got.size} does not match the drawing ${wanted.size}`);
  }
  for (const [viewName, view] of Object.entries(views)) {
    const file = path.join(dir, `${name}-${viewName}.png`);
    writeFileSync(file, png(view.width, view.height, view.rgba as Uint8Array));
  }
  console.log(`${name}: ${part.voxels.length} voxels`);
}
