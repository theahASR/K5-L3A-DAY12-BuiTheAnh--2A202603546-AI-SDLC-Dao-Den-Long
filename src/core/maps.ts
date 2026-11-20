import { round3 } from './config';
import type { Vec3 } from './types';

export interface JumpPadDef {
  id: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface LanternSpawnDef {
  id: string;
  pos: Vec3;
}

export interface CharmSpawnDef {
  id: string;
  pos: Vec3;
}

export interface RampDef {
  angleDeg: number;
  footRadius: number;
  topRadius: number;
  halfWidth: number;
  topY: number;
}

export interface NightMapDef {
  night: 1 | 2 | 3;
  name: string;
  introLine: string;
  durationS: number;
  startPos: Vec3;
  lanterns: LanternSpawnDef[];
  moteSpawns: Vec3[];
  shadeSpawns: Vec3[];
  shadeIntervalTicks: number;
  shadeMax: number;
  shadeSpeed: number;
  jumpPads: JumpPadDef[];
  charms: CharmSpawnDef[];
  driftersEnabled: boolean;
  windEnabled: boolean;
  ramps: RampDef[];
}

function polarPoints(
  cx: number,
  cz: number,
  radius: number,
  y: number,
  anglesDeg: number[]
): Vec3[] {
  return anglesDeg.map((deg) => {
    const rad = (deg * Math.PI) / 180;
    return [round3(cx + radius * Math.cos(rad)), y, round3(cz + radius * Math.sin(rad))];
  });
}

function rangeDeg(start: number, step: number, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    out.push(start + i * step);
  }
  return out;
}

function makeJumpPad(
  id: string,
  x: number,
  y: number,
  z: number,
  targetX: number,
  targetZ: number,
  hSpeed: number,
  vSpeed: number
): JumpPadDef {
  const dx = targetX - x;
  const dz = targetZ - z;
  const len = Math.hypot(dx, dz) || 1;
  return {
    id,
    x,
    y,
    z,
    radius: 1.0,
    vx: (dx / len) * hSpeed,
    vy: vSpeed,
    vz: (dz / len) * hSpeed,
  };
}

export const NIGHT_MAPS: Record<1 | 2 | 3, NightMapDef> = {
  1: {
    night: 1,
    name: 'Đêm 1 — Đảo Bến',
    introLine:
      'Ông Đăng: "Sương đen đã phủ kín Đảo Bến rồi, Mây ơi. Thắp đèn và nhớ châm thêm dầu để giữ ít nhất 3/5 Đèn Lồng Lớn sáng đến bình minh nhé!"',
    durationS: 240,
    startPos: [0, 0, 0],
    lanterns: [
      { id: 'L1', pos: [0, 0, 25] },
      { id: 'L2', pos: [23.8, 0, 7.7] },
      { id: 'L3', pos: [14.7, 0, -20.2] },
      { id: 'L4', pos: [-14.7, 0, -20.2] },
      { id: 'L5', pos: [-23.8, 0, 7.7] },
    ],
    moteSpawns: [
      ...polarPoints(0, 0, 12, 0, rangeDeg(0, 45, 8)),
      ...polarPoints(0, 0, 33, 0, rangeDeg(0, 22.5, 16)),
    ],
    shadeSpawns: polarPoints(0, 0, 37, 1.0, rangeDeg(15, 30, 12)),
    shadeIntervalTicks: 480, // 8s
    shadeMax: 6,
    shadeSpeed: 4.0,
    jumpPads: [],
    charms: [],
    driftersEnabled: false,
    windEnabled: false,
    ramps: [],
  },
  2: {
    night: 2,
    name: 'Đêm 2 — Đảo Cau',
    introLine:
      'Ông Đăng: "Đảo Cau nối đôi bằng cầu tre nhỏ và hai bục nhảy. Giữ ít nhất 4/6 đèn sáng tới bình minh, châm dầu kịp lúc trước khi Bóng Mực hút cạn nhé!"',
    durationS: 270,
    startPos: [0, 0, 0],
    lanterns: [
      { id: 'L1', pos: [0, 0, 20] },
      { id: 'L2', pos: [17, 0, -10] },
      { id: 'L3', pos: [-17, 0, -10] },
      { id: 'L4', pos: [70, 0, 20] },
      { id: 'L5', pos: [87, 0, -10] },
      { id: 'L6', pos: [53, 0, -10] },
    ],
    moteSpawns: [
      ...polarPoints(0, 0, 10, 0, [0, 90, 180, 270]),
      ...polarPoints(0, 0, 22, 0, rangeDeg(0, 45, 8)),
      ...polarPoints(70, 0, 10, 0, [0, 90, 180, 270]),
      ...polarPoints(70, 0, 22, 0, rangeDeg(0, 45, 8)),
    ],
    shadeSpawns: [
      ...polarPoints(0, 0, 26, 1.0, rangeDeg(22.5, 45, 8)),
      ...polarPoints(70, 0, 26, 1.0, rangeDeg(22.5, 45, 8)),
    ],
    shadeIntervalTicks: 420, // 7s
    shadeMax: 8,
    shadeSpeed: 4.0,
    jumpPads: [
      makeJumpPad('JP1', 20, 0, 18, 70, 0, 24.0, 14.0),
      makeJumpPad('JP2', 50, 0, -18, 0, 0, 24.0, 14.0),
    ],
    charms: [{ id: 'C1', pos: [35, 0, 0] }],
    driftersEnabled: true,
    windEnabled: false,
    ramps: [],
  },
  3: {
    night: 3,
    name: 'Đêm 3 — Đảo Chuông',
    introLine:
      'Ông Đăng: "Đêm cuối trên Đảo Chuông ba tầng! Giữ ít nhất 5/7 đèn sáng đến bình minh, cảnh giác gió mạnh và Bóng Mực rình hút dầu các đèn sắp tắt!"',
    durationS: 300,
    startPos: [0, 0, -10],
    lanterns: [
      { id: 'L1', pos: [0, 6, 6] },
      { id: 'L2', pos: [18, 3, 10] },
      { id: 'L3', pos: [-18, 3, 10] },
      { id: 'L4', pos: [35, 0, -10] },
      { id: 'L5', pos: [-35, 0, -10] },
      { id: 'L6', pos: [20, 0, -35] },
      { id: 'L7', pos: [-20, 0, -35] },
    ],
    moteSpawns: [
      ...polarPoints(0, 0, 34, 0, rangeDeg(0, 20, 18)),
      ...polarPoints(0, 0, 18, 3, [20, 40, 60, 80, 100, 120, 140, 160]),
      ...polarPoints(0, 0, 5, 6, [45, 135, 225, 315]),
    ],
    shadeSpawns: polarPoints(0, 0, 43, 1.0, rangeDeg(0, 22.5, 16)),
    shadeIntervalTicks: 360, // 6s
    shadeMax: 10,
    shadeSpeed: 4.5,
    jumpPads: [
      {
        id: 'JP1',
        x: 0,
        y: 3,
        z: 13,
        radius: 1.0,
        vx: 0,
        vy: 12.0,
        vz: -8.0,
      },
    ],
    charms: [
      { id: 'C1', pos: [30, 0, 25] },
      { id: 'C2', pos: [-30, 0, 25] },
    ],
    driftersEnabled: true,
    windEnabled: true,
    ramps: [
      { angleDeg: 30, footRadius: 30, topRadius: 24, halfWidth: 1.5, topY: 3.0 },
      { angleDeg: 150, footRadius: 30, topRadius: 24, halfWidth: 1.5, topY: 3.0 },
    ],
  },
};

export const NIGHT3_BELL_TOWER_RADIUS = 2.0;
export const NIGHT3_BELL_TOWER_TOP_Y = 14.0;

/**
 * Evaluates ramp surface height at (x, z) if within either Night 3 ramp footprint.
 */
function getNight3RampHeight(x: number, z: number): number | null {
  for (const ramp of NIGHT_MAPS[3].ramps) {
    const rad = (ramp.angleDeg * Math.PI) / 180;
    const ux = Math.cos(rad);
    const uz = Math.sin(rad);
    const vx = -uz;
    const vz = ux;
    const s = x * ux + z * uz;
    const t = Math.abs(x * vx + z * vz);
    if (s >= ramp.topRadius - 0.15 && s <= ramp.footRadius + 0.15 && t <= ramp.halfWidth) {
      const clampedS = Math.min(ramp.footRadius, Math.max(ramp.topRadius, s));
      return (ramp.topY * (ramp.footRadius - clampedS)) / (ramp.footRadius - ramp.topRadius);
    }
  }
  return null;
}

/**
 * Returns the highest solid walkable terrain height at (x, z), or null if over the cloud void.
 */
export function getTerrainHeight(night: 1 | 2 | 3, x: number, z: number): number | null {
  if (night === 1) {
    return Math.hypot(x, z) <= 40.0 ? 0 : null;
  }

  if (night === 2) {
    const inA = Math.hypot(x, z) <= 28.0;
    const inB = Math.hypot(x - 70.0, z) <= 28.0;
    const onBridge = x >= 26.0 && x <= 44.0 && z >= -2.0 && z <= 2.0;
    return inA || inB || onBridge ? 0 : null;
  }

  // Night 3: 3-tier island (r <= 45)
  const r = Math.hypot(x, z);
  if (r > 45.0) return null;

  // Tier 2: disk r <= 8 at Y = 6 (Bell tower sits at r <= 2, handled as impassable obstacle)
  if (r <= 8.0) return 6.0;

  // Tier 1: annulus 12 <= r <= 24 on z > 0 at Y = 3
  if (r >= 12.0 && r <= 24.0 && z > 0) return 3.0;

  // Straight ramps from r=30 (Y=0) up to r=24 (Y=3) at 30° and 150°
  const rampH = getNight3RampHeight(x, z);
  if (rampH !== null) return rampH;

  // Tier 0 base
  return 0.0;
}

/**
 * Checks whether moving horizontally to (x, z) at height curY hits an impassable cliff or bell tower.
 */
export function isHorizontallyBlocked(
  night: 1 | 2 | 3,
  x: number,
  curY: number,
  z: number,
  stepTolerance = 0.45
): boolean {
  if (night !== 3) return false;

  // Bell tower cylinder at center of Tier 2 (r <= 2.0, Y < 14)
  if (Math.hypot(x, z) < NIGHT3_BELL_TOWER_RADIUS && curY < NIGHT3_BELL_TOWER_TOP_Y) {
    return true;
  }

  const h = getTerrainHeight(3, x, z);
  if (h !== null && h > curY + stepTolerance) {
    return true;
  }
  return false;
}

/**
 * Resolves horizontal movement with simple axis-sliding against Night 3 cliffs & bell tower.
 */
export function resolveHorizontalMove(
  night: 1 | 2 | 3,
  fromX: number,
  fromY: number,
  fromZ: number,
  toX: number,
  toZ: number,
  allowVoid: boolean
): { x: number; z: number; blocked: boolean } {
  const valid = (cx: number, cz: number): boolean => {
    if (!allowVoid && getTerrainHeight(night, cx, cz) === null) return false;
    return !isHorizontallyBlocked(night, cx, fromY, cz);
  };

  if (valid(toX, toZ)) {
    return { x: toX, z: toZ, blocked: false };
  }
  if (valid(toX, fromZ)) {
    return { x: toX, z: fromZ, blocked: true };
  }
  if (valid(fromX, toZ)) {
    return { x: fromX, z: toZ, blocked: true };
  }
  return { x: fromX, z: fromZ, blocked: true };
}
