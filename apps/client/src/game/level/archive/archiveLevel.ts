import * as THREE from 'three/webgpu';
import { Environment } from '../../environment/Environment';
import { buildExhibitHall, type ExhibitHall } from '../../exhibits/exhibitHall';
import { NewsNetwork } from '../../news/NewsNetwork';
import { staticBox, staticCylinder } from '../builders';
import type { Level, LevelContext } from '../Level';
import { ARCHIVE, towerPlacements } from './layout';

export interface ArchiveLevel extends Level {
  environment: Environment;
  news: NewsNetwork;
  exhibits: ExhibitHall;
}

/**
 * The Archive: a floating plaza above the endless ocean, the museum at its north end, five neon
 * towers around the rim and piers reaching out over the water. Greybox geometry in the Archive
 * palette (clean stone, cyan and magenta neon).
 */
export function buildArchiveLevel(ctx: LevelContext): ArchiveLevel {
  const environment = new Environment(ctx.scene, ARCHIVE.oceanLevel);
  const mat = materials(environment);

  const news = new NewsNetwork(ctx.scene);

  buildPlaza(ctx, mat);
  buildMuseum(ctx, mat);
  const towers = buildTowers(ctx, mat);
  buildPiers(ctx, mat);
  buildNewsScreens(ctx, mat, news, towers);
  const exhibits = buildExhibitHall(ctx, exhibitSlots(), ARCHIVE.museum.centre.z);

  const s = ARCHIVE.spawn;
  return {
    spawn: new THREE.Vector3(s.x, s.y, s.z),
    environment,
    news,
    exhibits,
    update(frame) {
      environment.update(frame.dt, frame.elapsed, frame.camera, frame.playerPosition);
      news.update(frame.elapsed);
      exhibits.update(frame.elapsed);
    },
  };
}

type Materials = ReturnType<typeof materials>;

function materials(env: Environment) {
  const neon = (color: number): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2 });
    env.neonMaterials.push(m);
    return m;
  };
  return {
    paving: new THREE.MeshStandardMaterial({ color: 0xcfc8b8, roughness: 0.85 }),
    pavingInlay: new THREE.MeshStandardMaterial({ color: 0x9aa7b4, roughness: 0.6 }),
    stone: new THREE.MeshStandardMaterial({ color: 0xe6dfd0, roughness: 0.75 }),
    trim: new THREE.MeshStandardMaterial({ color: 0xb08d57, roughness: 0.4, metalness: 0.7 }),
    tower: new THREE.MeshStandardMaterial({ color: 0x2b3a52, roughness: 0.45, metalness: 0.3 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1c2a40, roughness: 0.15, metalness: 0.6 }),
    support: new THREE.MeshStandardMaterial({ color: 0x55606e, roughness: 0.7 }),
    cyan: neon(0x3ee6ff),
    magenta: neon(0xff4fd8),
  };
}

function buildPlaza(ctx: LevelContext, m: Materials): void {
  const r = ARCHIVE.plazaRadius;
  staticCylinder(ctx, r, r - 1.5, 2, { x: 0, y: -1, z: 0 }, m.paving, 72);

  // Decorative inlay rings and a compass rose at the centre (visual only).
  for (const radius of [8, 20]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.35, radius, 96), m.pavingInlay);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    ring.receiveShadow = true;
    ctx.scene.add(ring);
  }
  const glow = new THREE.Mesh(new THREE.RingGeometry(r - 0.6, r - 0.4, 128), m.cyan);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.02;
  ctx.scene.add(glow);

  // Underside: a tapering hull and support columns down into the sea.
  const hull = new THREE.Mesh(new THREE.ConeGeometry(r - 1.5, 16, 48, 1, true), m.support);
  hull.rotation.x = Math.PI;
  hull.position.y = -10;
  ctx.scene.add(hull);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const column = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 20, 12), m.support);
    column.position.set(Math.cos(a) * (r - 10), -12, Math.sin(a) * (r - 10));
    ctx.scene.add(column);
  }

  // Railing around the rim, with gaps where the piers leave the plaza.
  const gaps = ARCHIVE.piers.map((p) => ({
    angle: (p.angle * Math.PI) / 180,
    half: Math.asin((p.width / 2 + 0.6) / r),
  }));
  const segments = 72;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const mid = (a0 + a1) / 2;
    if (gaps.some((g) => angularDistance(mid, g.angle) < g.half)) continue;
    const length = 2 * (r - 0.3) * Math.sin((a1 - a0) / 2);
    staticBox(
      ctx,
      { x: length, y: 1.1, z: 0.25 },
      { x: Math.cos(mid) * (r - 0.3), y: 0.55, z: -Math.sin(mid) * (r - 0.3) },
      m.trim,
      [0, mid + Math.PI / 2, 0],
    );
  }
}

function buildMuseum(ctx: LevelContext, m: Materials): void {
  const { centre, width, depth, height, wall, doorWidth, doorHeight } = ARCHIVE.museum;
  const cx = centre.x;
  const cz = centre.z;
  const front = cz + depth / 2;
  const back = cz - depth / 2;
  const left = cx - width / 2;
  const right = cx + width / 2;
  const annex = ARCHIVE.annex;

  // Back wall.
  staticBox(ctx, { x: width, y: height, z: wall }, { x: cx, y: height / 2, z: back }, m.stone);
  // West wall.
  staticBox(ctx, { x: wall, y: height, z: depth }, { x: left, y: height / 2, z: cz }, m.stone);
  // East wall, with a door into the annex.
  const eastSide = (depth - annex.doorWidth) / 2;
  for (const dir of [-1, 1]) {
    staticBox(
      ctx,
      { x: wall, y: height, z: eastSide },
      { x: right, y: height / 2, z: cz + dir * (annex.doorWidth / 2 + eastSide / 2) },
      m.stone,
    );
  }
  staticBox(
    ctx,
    { x: wall, y: height - doorHeight, z: annex.doorWidth },
    { x: right, y: doorHeight + (height - doorHeight) / 2, z: cz },
    m.stone,
  );
  // Front wall split around the entrance, plus a lintel above it.
  const side = (width - doorWidth) / 2;
  for (const dir of [-1, 1]) {
    staticBox(
      ctx,
      { x: side, y: height, z: wall },
      { x: cx + dir * (doorWidth / 2 + side / 2), y: height / 2, z: front },
      m.stone,
    );
  }
  staticBox(
    ctx,
    { x: doorWidth, y: height - doorHeight, z: wall },
    { x: cx, y: doorHeight + (height - doorHeight) / 2, z: front },
    m.stone,
  );
  // Roof with a glowing skylight strip, and a cornice in gold trim.
  staticBox(
    ctx,
    { x: width + 2, y: 0.8, z: depth + 2 },
    { x: cx, y: height + 0.4, z: cz },
    m.stone,
  );
  staticBox(ctx, { x: width + 2.4, y: 0.4, z: 0.6 }, { x: cx, y: height, z: front + 1.2 }, m.trim);
  const skylight = new THREE.Mesh(new THREE.BoxGeometry(width - 8, 0.1, 1.2), m.cyan);
  skylight.position.set(cx, height - 0.05, cz);
  ctx.scene.add(skylight);

  // Portico: columns in front of the entrance.
  for (const x of [-12, -7.5, 7.5, 12]) {
    staticCylinder(
      ctx,
      0.6,
      0.7,
      height,
      { x: cx + x, y: height / 2, z: front + 2.5 },
      m.stone,
      20,
    );
  }
  staticBox(ctx, { x: 28, y: 0.8, z: 4 }, { x: cx, y: height + 0.4, z: front + 2.2 }, m.stone);
  // Neon frame around the doorway.
  const frame = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + 0.6, 0.2, 0.2), m.magenta);
  frame.position.set(cx, doorHeight + 0.15, front + wall / 2 + 0.1);
  ctx.scene.add(frame);

  // Annex shell (fitted out as the low-gravity hall in #10).
  const ax = annex.centre.x;
  const az = annex.centre.z;
  const aRight = ax + annex.width / 2;
  staticBox(
    ctx,
    { x: wall, y: annex.height, z: annex.depth },
    { x: aRight, y: annex.height / 2, z: az },
    m.stone,
  );
  for (const dir of [-1, 1]) {
    staticBox(
      ctx,
      { x: annex.width, y: annex.height, z: wall },
      { x: ax, y: annex.height / 2, z: az + (dir * annex.depth) / 2 },
      m.stone,
    );
  }
  staticBox(
    ctx,
    { x: annex.width + 1, y: 0.8, z: annex.depth + 1 },
    { x: ax, y: annex.height + 0.4, z: az },
    m.glass,
  );
}

function buildTowers(ctx: LevelContext, m: Materials): THREE.Mesh[] {
  return towerPlacements().map((t) => {
    const tower = staticBox(
      ctx,
      { x: t.size, y: t.height, z: t.size },
      { x: t.x, y: t.height / 2, z: t.z },
      m.tower,
      [0, t.facing, 0],
    );
    // Neon edges on each vertical corner and a crown at the top.
    const half = t.size / 2;
    for (const [cx, cz] of [
      [half, half],
      [-half, half],
      [half, -half],
      [-half, -half],
    ] as const) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.18, t.height, 0.18), m.cyan);
      strip.position.set(cx, 0, cz);
      tower.add(strip);
    }
    const crown = new THREE.Mesh(new THREE.BoxGeometry(t.size + 0.6, 0.5, t.size + 0.6), m.magenta);
    crown.position.y = t.height / 2 + 0.25;
    tower.add(crown);
    // Glass bands every few floors.
    for (let y = 4; y < t.height - 2; y += 6) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(t.size + 0.1, 1.4, t.size + 0.1), m.glass);
      band.position.y = y - t.height / 2;
      tower.add(band);
    }
    return tower;
  });
}

/**
 * Screens on the plaza-facing side of every tower (the tallest gets a 16 m one), one above the
 * museum entrance and a kiosk by the spawn point.
 */
function buildNewsScreens(
  ctx: LevelContext,
  m: Materials,
  news: NewsNetwork,
  towers: THREE.Mesh[],
): void {
  const placements = towerPlacements();
  const tallest = Math.max(...placements.map((t) => t.height));
  placements.forEach((t, i) => {
    const tower = towers[i];
    if (!tower) return;
    const giant = t.height === tallest;
    const width = giant ? 16 : t.size * 0.9;
    const height = (width * 9) / 16;
    // Tower meshes are centred at half their height; their local -Z face looks at the plaza.
    const worldY = (giant ? 16 : 7) + height / 2;
    const y = worldY - t.height / 2;
    news.addScreen(width, height, { x: 0, y, z: -(t.size / 2 + 0.3) }, Math.PI, tower);
  });

  const museum = ARCHIVE.museum;
  const front = museum.centre.z + museum.depth / 2;
  news.addScreen(10, 5.6, { x: museum.centre.x, y: museum.height + 3.8, z: front + 2.6 }, 0);

  // Kiosk near the spawn, angled toward arriving players.
  const kiosk = { x: -7, z: ARCHIVE.spawn.z - 6 };
  staticBox(ctx, { x: 0.4, y: 2, z: 0.4 }, { x: kiosk.x, y: 1, z: kiosk.z }, m.trim);
  news.addScreen(3.2, 1.8, { x: kiosk.x, y: 2.9, z: kiosk.z }, Math.PI / 5);
}

/** Two rows of three pedestals inside the museum hall, leaving the entrance aisle clear. */
function exhibitSlots(): { x: number; z: number }[] {
  const { centre } = ARCHIVE.museum;
  const rows = [centre.z - 5, centre.z + 5];
  const columns = [-10, 0, 10];
  return rows.flatMap((z) => columns.map((x) => ({ x: centre.x + x, z })));
}

function buildPiers(ctx: LevelContext, m: Materials): void {
  const r = ARCHIVE.plazaRadius;
  for (const p of ARCHIVE.piers) {
    const a = (p.angle * Math.PI) / 180;
    const dir = { x: Math.cos(a), z: -Math.sin(a) };
    const mid = r - 1 + p.length / 2;
    const yaw = Math.atan2(dir.x, dir.z);
    staticBox(
      ctx,
      { x: p.width, y: 0.6, z: p.length + 2 },
      { x: dir.x * mid, y: -0.3, z: dir.z * mid },
      m.paving,
      [0, yaw, 0],
    );
    // Rails along both sides and across the end.
    const sideX = { x: dir.z, z: -dir.x };
    for (const s of [-1, 1]) {
      const off = (p.width / 2 - 0.15) * s;
      staticBox(
        ctx,
        { x: 0.25, y: 1.1, z: p.length },
        { x: dir.x * (mid + 1) + sideX.x * off, y: 0.55, z: dir.z * (mid + 1) + sideX.z * off },
        m.trim,
        [0, yaw, 0],
      );
    }
    const end = r - 1 + p.length + 0.85;
    staticBox(
      ctx,
      { x: p.width, y: 1.1, z: 0.25 },
      { x: dir.x * end, y: 0.55, z: dir.z * end },
      m.trim,
      [0, yaw, 0],
    );
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(p.width, 0.12, 0.3), m.cyan);
    lamp.position.set(dir.x * (end - 0.3), 1.15, dir.z * (end - 0.3));
    lamp.rotation.y = yaw;
    ctx.scene.add(lamp);
  }
}

function angularDistance(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}
