export type View = {
  width: number;
  height: number;
  rgba: Uint8Array | Uint8ClampedArray;
};

export type Voxel = {
  x: number;
  y: number;
  z: number;
  color: number;
};

export type Views = {
  front: View;
  back: View;
  side: View;
  top: View;
};

export type GridSize = { x: number; y: number; z: number };

const ALPHA = 128;

function sample(view: View, x: number, y: number): { solid: boolean; color: number } {
  if (x < 0 || y < 0 || x >= view.width || y >= view.height) return { solid: false, color: 0 };
  const index = (y * view.width + x) * 4;
  const alpha = view.rgba[index + 3] ?? 0;
  if (alpha < ALPHA) return { solid: false, color: 0 };
  const red = view.rgba[index] ?? 0;
  const green = view.rgba[index + 1] ?? 0;
  const blue = view.rgba[index + 2] ?? 0;
  return { solid: true, color: (red << 16) | (green << 8) | blue };
}

function blank(width: number, height: number): View {
  return { width, height, rgba: new Uint8Array(width * height * 4) };
}

function paint(view: View, x: number, y: number, color: number): void {
  if (x < 0 || y < 0 || x >= view.width || y >= view.height) return;
  const index = (y * view.width + x) * 4;
  const current = view.rgba[index + 3] ?? 0;
  if (current >= ALPHA) return;
  view.rgba[index] = (color >> 16) & 255;
  view.rgba[index + 1] = (color >> 8) & 255;
  view.rgba[index + 2] = color & 255;
  view.rgba[index + 3] = 255;
}

/**
 * Orthographic views of a voxel model.
 * Front looks toward -z. Back looks toward +z and is mirrored in x.
 * Side looks toward -x, with image x increasing along +z. The left side
 * reuses that image, mirrored. Top looks down, with the front of the model
 * at the bottom of the image.
 */
export function projectViews(voxels: Voxel[], size: GridSize): Views {
  const views: Views = {
    front: blank(size.x, size.y),
    back: blank(size.x, size.y),
    side: blank(size.z, size.y),
    top: blank(size.x, size.z),
  };
  const order = [...voxels].sort((a, b) => b.z - a.z || b.x - a.x || b.y - a.y);
  for (const voxel of order) {
    const imageY = size.y - 1 - voxel.y;
    paint(views.front, voxel.x, imageY, voxel.color);
    paint(views.back, size.x - 1 - voxel.x, imageY, voxel.color);
    paint(views.side, voxel.z, imageY, voxel.color);
    paint(views.top, voxel.x, size.z - 1 - voxel.z, voxel.color);
  }
  return views;
}

/**
 * Visual hull: a cell stays only when every view is solid there.
 * A surface cell takes its color from the first view that can see it,
 * in the order front, side, mirrored side, top, back.
 */
export function carveViews(views: Views): Voxel[] {
  const xSize = views.front.width;
  const ySize = views.front.height;
  const zSize = views.side.width;
  if (views.back.width !== xSize || views.back.height !== ySize) throw new Error("back view size");
  if (views.side.height !== ySize) throw new Error("side view size");
  if (views.top.width !== xSize || views.top.height !== zSize) throw new Error("top view size");

  const solid = new Uint8Array(xSize * ySize * zSize);
  const at = (x: number, y: number, z: number) => (y * zSize + z) * xSize + x;
  for (let y = 0; y < ySize; y += 1) {
    const imageY = ySize - 1 - y;
    for (let z = 0; z < zSize; z += 1) {
      for (let x = 0; x < xSize; x += 1) {
        const front = sample(views.front, x, imageY);
        const back = sample(views.back, xSize - 1 - x, imageY);
        const side = sample(views.side, z, imageY);
        const top = sample(views.top, x, zSize - 1 - z);
        if (front.solid && back.solid && side.solid && top.solid) solid[at(x, y, z)] = 1;
      }
    }
  }

  const occupied = (x: number, y: number, z: number) => {
    if (x < 0 || y < 0 || z < 0 || x >= xSize || y >= ySize || z >= zSize) return false;
    return solid[at(x, y, z)] === 1;
  };

  const voxels: Voxel[] = [];
  for (let y = 0; y < ySize; y += 1) {
    const imageY = ySize - 1 - y;
    for (let z = 0; z < zSize; z += 1) {
      for (let x = 0; x < xSize; x += 1) {
        if (!occupied(x, y, z)) continue;
        const front = sample(views.front, x, imageY).color;
        const side = sample(views.side, z, imageY).color;
        const mirrored = sample(views.side, zSize - 1 - z, imageY).color;
        const top = sample(views.top, x, zSize - 1 - z).color;
        const back = sample(views.back, xSize - 1 - x, imageY).color;
        let color = front;
        if (!occupied(x, y, z + 1)) color = front;
        else if (!occupied(x + 1, y, z)) color = side;
        else if (!occupied(x - 1, y, z)) color = mirrored;
        else if (!occupied(x, y + 1, z)) color = top;
        else if (!occupied(x, y, z - 1)) color = back;
        voxels.push({ x, y, z, color });
      }
    }
  }
  return voxels;
}
