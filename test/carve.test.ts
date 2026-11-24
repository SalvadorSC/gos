import assert from "node:assert/strict";
import test from "node:test";
import { carveViews, projectViews, type Voxel } from "../src/carve.js";

function fill(size: number, color: number): Voxel[] {
  const voxels: Voxel[] = [];
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size; y += 1) {
      for (let z = 0; z < size; z += 1) voxels.push({ x, y, z, color });
    }
  }
  return voxels;
}

test("every solid cell of a box is kept", () => {
  const views = projectViews(fill(2, 0xff0000), { x: 2, y: 2, z: 2 });
  const carved = carveViews(views);
  assert.equal(carved.length, 8);
});

test("an empty front pixel removes that column", () => {
  const views = projectViews(fill(2, 0xffffff), { x: 2, y: 2, z: 2 });
  const imageY = 1;
  const index = (imageY * views.front.width + 0) * 4;
  views.front.rgba[index + 3] = 0;
  const carved = carveViews(views);
  assert.equal(carved.some((voxel) => voxel.x === 0 && voxel.y === 0), false);
  assert.equal(carved.length, 6);
});

test("the front view colors the face it can see", () => {
  const voxels: Voxel[] = [
    { x: 0, y: 0, z: 1, color: 0xff0000 },
    { x: 0, y: 0, z: 0, color: 0x00ff00 },
  ];
  const carved = carveViews(projectViews(voxels, { x: 1, y: 1, z: 2 }));
  const front = carved.find((voxel) => voxel.z === 1);
  const rear = carved.find((voxel) => voxel.z === 0);
  assert.equal(front?.color, 0xff0000);
  assert.equal(rear?.color, 0x00ff00);
});
