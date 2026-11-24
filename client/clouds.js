import {
  BoxGeometry,
  CanvasTexture,
  DoubleSide,
  GLSL3,
  Group,
  Mesh,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
} from "three";

// Volumetric clouds adapted from Leonardo Soares Gonçalves,
// https://github.com/leoawen/volumetric-clouds (MIT). The original bakes a 3D
// density texture and marches a deformed spherical mask with a Henyey-Greenstein
// phase and a short light ray (Beer's law). This version keeps that march and
// the mask, and uses analytic value noise instead of the baked volume so a
// phone can run a capped step count.

const VERTEX = `
out vec3 vOrigin;
out vec3 vDirection;
void main() {
  vec3 origin = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
  vOrigin = origin;
  vDirection = position - origin;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = `
precision highp float;
in vec3 vOrigin;
in vec3 vDirection;
uniform float uTime;
uniform int uMaxSteps;
uniform int uLightSteps;
out vec4 fragColor;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float valueNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}

float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.62;
  value += amplitude * valueNoise(p);
  p = p * 2.03 + vec3(1.7, 9.2, 2.4);
  value += amplitude * 0.5 * valueNoise(p);
  p = p * 2.01 + vec3(4.1, 1.3, 7.2);
  value += amplitude * 0.25 * valueNoise(p);
  return value;
}

// Deformed ellipsoid mask, the same idea as getMaskSDF in the source project.
float maskFactor(vec3 p) {
  vec3 warped = p;
  warped.y /= 0.42;
  float dist = length(warped);
  vec3 sampleP = p * 1.6 + vec3(uTime * 0.03, 0.0, uTime * 0.02);
  float bump = (fbm(sampleP) - 0.4) * 0.7;
  float radius = 0.58 + bump;
  return smoothstep(0.0, 0.2, radius - dist);
}

float densityAt(vec3 p) {
  float mask = maskFactor(p);
  if (mask <= 0.0) return 0.0;
  float detail = fbm(p * 3.1 + vec3(0.0, uTime * 0.05, 4.0));
  float body = smoothstep(0.25, 0.58, detail);
  return body * mask;
}

float henyeyGreenstein(float g, float mu) {
  float gg = g * g;
  return (1.0 / (4.0 * 3.14159)) * ((1.0 - gg) / pow(1.0 + gg - 2.0 * g * mu, 1.5));
}

float phase(float mu) {
  return mix(henyeyGreenstein(-0.25, mu), henyeyGreenstein(0.35, mu), 0.72);
}

float lightEnergy(vec3 pos, vec3 lightDir) {
  float stepLength = 0.7 / float(uLightSteps);
  float accumulated = 0.0;
  for (int i = 0; i < 2; i++) {
    if (i >= uLightSteps) break;
    vec3 samplePos = pos + lightDir * (float(i) + 0.5) * stepLength;
    if (all(greaterThan(samplePos, vec3(-0.5))) && all(lessThan(samplePos, vec3(0.5)))) {
      accumulated += densityAt(samplePos) * stepLength;
    }
  }
  return exp(-accumulated * 2.4);
}

vec2 hitBox(vec3 origin, vec3 dir) {
  vec3 boxMin = vec3(-0.5);
  vec3 boxMax = vec3(0.5);
  vec3 inv = 1.0 / dir;
  vec3 t0 = (boxMin - origin) * inv;
  vec3 t1 = (boxMax - origin) * inv;
  vec3 tmin = min(t0, t1);
  vec3 tmax = max(t0, t1);
  float enter = max(tmin.x, max(tmin.y, tmin.z));
  float exit = min(tmax.x, min(tmax.y, tmax.z));
  return vec2(enter, exit);
}

void main() {
  vec3 rayDir = normalize(vDirection);
  vec2 bounds = hitBox(vOrigin, rayDir);
  if (bounds.x >= bounds.y) discard;
  bounds.x = max(bounds.x, 0.0);
  float rayLength = bounds.y - bounds.x;
  if (rayLength < 0.001) discard;

  float steps = float(uMaxSteps);
  float stepSize = rayLength / steps;
  float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  vec3 p = vOrigin + (bounds.x + jitter * stepSize) * rayDir;
  vec3 lightDir = normalize(vec3(0.35, 0.85, 0.25));
  float mu = dot(rayDir, lightDir);
  vec3 scatter = vec3(0.0);
  float transmittance = 1.0;
  vec3 sunColor = vec3(1.0, 0.86, 0.72);
  vec3 ambient = vec3(0.62, 0.5, 0.78);

  for (int i = 0; i < 10; i++) {
    if (i >= uMaxSteps) break;
    float travelled = (float(i) + jitter) * stepSize;
    if (travelled > rayLength) break;
    float density = densityAt(p);
    if (density > 0.02) {
      float light = lightEnergy(p, lightDir);
      vec3 lit = sunColor * light * phase(mu) * 2.4 + ambient * 0.55;
      float absorb = density * stepSize * 1.8;
      scatter += transmittance * lit * absorb;
      transmittance *= exp(-absorb);
      if (transmittance < 0.04) break;
    }
    p += rayDir * stepSize;
  }

  float alpha = clamp((1.0 - transmittance) * 0.85, 0.0, 0.82);
  vec3 tint = vec3(0.95, 0.9, 0.99);
  float shade = clamp(0.62 + scatter.r, 0.0, 1.15);
  fragColor = vec4(tint * shade, alpha);
}
`;

function volumeMaterial(steps, lightSteps) {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uMaxSteps: { value: steps },
      uLightSteps: { value: lightSteps },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  });
}

function spriteTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  const glow = context.createRadialGradient(64, 64, 6, 64, 64, 62);
  glow.addColorStop(0, "rgba(255, 250, 255, 0.92)");
  glow.addColorStop(0.4, "rgba(214, 196, 238, 0.55)");
  glow.addColorStop(1, "rgba(186, 164, 220, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, 128, 128);
  const pixels = context.getImageData(0, 0, 128, 128);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 16;
    pixels.data[i] = Math.max(0, Math.min(255, pixels.data[i] + n));
    pixels.data[i + 1] = Math.max(0, Math.min(255, pixels.data[i + 1] + n));
    pixels.data[i + 2] = Math.max(0, Math.min(255, pixels.data[i + 2] + n * 0.4));
  }
  context.putImageData(pixels, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

const PLACES = [
  [-2.2, 2.55, -0.4],
  [2.15, 2.35, 0.2],
  [-0.1, 2.95, -1.5],
];

export function cloudMode(width) {
  const memory = navigator.deviceMemory ?? 8;
  return width < 768 || memory <= 2 ? "sprite" : "volume";
}

export function createClouds(scene, mode) {
  const group = new Group();
  scene.add(group);
  if (mode === "sprite") {
    const material = new SpriteMaterial({ map: spriteTexture(), transparent: true, depthWrite: false });
    for (const place of PLACES) {
      for (let index = 0; index < 5; index += 1) {
        const sprite = new Sprite(material);
        sprite.position.set(place[0] + (index - 2) * 0.55, place[1] + (index % 2) * 0.18, place[2]);
        sprite.scale.set(2.1, 1.25, 1);
        group.add(sprite);
      }
    }
    return { mode, update() {} };
  }

  const material = volumeMaterial(8, 2);
  const geometry = new BoxGeometry(1, 1, 1);
  for (const place of PLACES) {
    const cloud = new Mesh(geometry, material);
    cloud.position.set(place[0], place[1], place[2]);
    cloud.scale.set(2.4, 0.95, 1.6);
    cloud.frustumCulled = false;
    group.add(cloud);
  }
  return {
    mode,
    update(time) {
      material.uniforms.uTime.value = time;
    },
  };
}
