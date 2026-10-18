import * as THREE from 'three';
import { DIMENSIONS, SITE, VEHICLE as v, ROOF_BOX } from './model.js';

export const REAR_TURN_RADIUS = 4.5;
export const CANOPY_CLEARANCE = DIMENSIONS.height - DIMENSIONS.roof - DIMENSIONS.lampDrop;
export const SOFFIT_CLEARANCE = DIMENSIONS.height - DIMENSIONS.roof - DIMENSIONS.soffit;
export const OPENING_RESERVE = 0.15;
export const CENTER_FROM_REAR = v.length / 2 - v.rearOverhang;

// Поза задаётся центром задней оси; heading: от +X к +Z. Шаг задней оси ≤ 1 см.
export function buildManeuver(destination = 'canopy') {
  if (!['canopy', 'outside'].includes(destination)) throw new Error('Неизвестный маршрут');
  const poses = [{ x: 0.5, z: -2.2, heading: 0, steering: 0, distance: 0, signedDistance: 0, time: 0, stage: 'Улица', gear: 'D' }];
  const last = () => poses.at(-1);
  function hold(steering, gear, stage, seconds = 0.7) {
    poses.push({ ...last(), steering, gear, stage, time: last().time + seconds });
  }
  function move(length, radius, stage, gear) {
    const start = last();
    const steps = Math.ceil(Math.abs(length) / 0.01);
    for (let i = 1; i <= steps; i++) {
      const s = length * i / steps;
      const heading = start.heading + (radius ? s / radius : 0);
      poses.push({
        x: start.x + (radius ? radius * (Math.sin(heading) - Math.sin(start.heading)) : s * Math.cos(heading)),
        z: start.z + (radius ? radius * (Math.cos(start.heading) - Math.cos(heading)) : s * Math.sin(heading)),
        heading, steering: radius ? Math.atan(v.wheelbase / radius) : 0,
        distance: start.distance + Math.abs(s), signedDistance: start.signedDistance + s,
        time: start.time + Math.abs(s) / 1.25, stage, gear,
      });
    }
  }
  const turn = Math.atan(v.wheelbase / REAR_TURN_RADIUS);
  move(3.5, 0, 'Подъезд к воротам', 'D');
  hold(turn, 'D', 'Поворот колёс перед въездом');
  move(REAR_TURN_RADIUS * Math.PI / 2, REAR_TURN_RADIUS, 'Поворот с улицы через ворота', 'D');
  hold(0, 'D', 'Выпрямление колёс');
  const targetRearZ = destination === 'outside' ? 6.5 - CENTER_FROM_REAR : 2.6 + REAR_TURN_RADIUS;
  move(targetRearZ - last().z, 0, 'Вперёд по площадке', 'D');
  if (destination === 'canopy') {
    hold(turn, 'R', 'Остановка и включение заднего хода', 1.2);
    move(-REAR_TURN_RADIUS * Math.PI / 2, REAR_TURN_RADIUS, 'Поворот задним ходом к навесу', 'R');
    hold(0, 'R', 'Выпрямление колёс перед навесом');
    move(3.1 - CENTER_FROM_REAR - last().x, 0, 'Задним ходом под навес', 'R');
  }
  hold(0, 'P', destination === 'canopy' ? 'Под навесом' : 'На открытой стоянке', 0.6);
  return poses;
}

export function sampleManeuver(poses, time) {
  let low = 0, high = poses.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (poses[middle].time < time) low = middle + 1;
    else high = middle;
  }
  const end = poses[low], start = poses[Math.max(0, low - 1)];
  const t = end.time === start.time ? 0 : Math.max(0, Math.min(1, (time - start.time) / (end.time - start.time)));
  const pose = { ...end };
  pose.time = Math.max(poses[0].time, Math.min(time, poses.at(-1).time));
  for (const key of ['x', 'z', 'heading', 'steering', 'distance', 'signedDistance']) pose[key] = start[key] + (end[key] - start[key]) * t;
  return pose;
}

export function footprint(pose, width = v.mirrors, length = v.length, centerOffset = CENTER_FROM_REAR) {
  const c = Math.cos(pose.heading), s = Math.sin(pose.heading);
  return [[-length / 2, -width / 2], [length / 2, -width / 2], [length / 2, width / 2], [-length / 2, width / 2]]
    .map(([x, z]) => ({ x: pose.x + (x + centerOffset) * c - z * s, z: pose.z + (x + centerOffset) * s + z * c }));
}

export function sweptWidth(pose, mirrorWidth = v.mirrors) {
  const radius = pose.steering ? v.wheelbase / Math.tan(Math.abs(pose.steering)) : Infinity;
  const innerSteer = Math.atan(v.wheelbase / (radius - v.track / 2));
  const tyreEnvelope = v.track + 2 * (v.wheelRadius * Math.sin(innerSteer) + v.tyreWidth / 2 * Math.cos(innerSteer));
  return Math.max(mirrorWidth, tyreEnvelope, v.width);
}

function rectangle(obstacle) {
  return [{ x: obstacle.minX, z: obstacle.minZ }, { x: obstacle.maxX, z: obstacle.minZ },
    { x: obstacle.maxX, z: obstacle.maxZ }, { x: obstacle.minX, z: obstacle.maxZ }];
}
export function overlaps(polygon, obstacle) {
  const other = rectangle(obstacle);
  const axes = [{ x: 1, z: 0 }, { x: 0, z: 1 }];
  for (let i = 0; i < 2; i++) axes.push({ x: polygon[i].z - polygon[i + 1].z, z: polygon[i + 1].x - polygon[i].x });
  for (const axis of axes) {
    const a = polygon.map(p => p.x * axis.x + p.z * axis.z);
    const b = other.map(p => p.x * axis.x + p.z * axis.z);
    if (Math.max(...a) < Math.min(...b) || Math.max(...b) < Math.min(...a)) return false;
  }
  return true;
}
function pointSegmentDistance(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}
export function polygonDistance(polygon, obstacle) {
  if (overlaps(polygon, obstacle)) return 0;
  const other = rectangle(obstacle);
  let distance = Infinity;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    distance = Math.min(distance, pointSegmentDistance(polygon[i], other[j], other[(j + 1) % 4]),
      pointSegmentDistance(other[j], polygon[i], polygon[(i + 1) % 4]));
  }
  return distance;
}

function surfaceClearance(polygon) {
  const points = [...polygon];
  for (let i = 0; i < 4; i++) {
    const a = polygon[i], b = polygon[(i + 1) % 4];
    if (a.z * b.z < 0) points.push({ x: a.x + (b.x - a.x) * -a.z / (b.z - a.z), z: 0 });
  }
  return Math.min(...points.map(p => p.z >= 0 ? Math.min(p.x, 11 - p.x, 11 - p.z) : Math.min(p.z + SITE.streetDepth, p.x + 1.8, 17 - p.x)));
}

export function roofBoxOpeningEnvelope(pose, mountLift = v.mountLift) {
  if (!Number.isFinite(mountLift) || mountLift < 0 || mountLift > 0.2) throw new Error('Некорректная высота крепления');
  // Для боковой оси в габарите бокса и поворота 0–90°: верх ≤ верх закрытого бокса + ширина.
  return {
    polygon: footprint(pose, ROOF_BOX.width + 2 * ROOF_BOX.height, ROOF_BOX.length),
    minY: v.height + mountLift,
    maxY: v.height + mountLift + ROOF_BOX.height + ROOF_BOX.width,
  };
}

export function analyzeManeuver(poses, obstacles, { box = true, mountLift = v.mountLift, mirrors = v.mirrors, canopyClearance = CANOPY_CLEARANCE } = {}) {
  if (!Number.isFinite(mountLift) || mountLift < 0 || mountLift > 0.2 || !Number.isFinite(mirrors) || mirrors < v.width || mirrors > 3
    || !Number.isFinite(canopyClearance) || canopyClearance <= 0) {
    throw new Error('Некорректные габариты автомобиля или крепления');
  }
  const lowObstacles = obstacles.filter(o => o.maxY > 0.21 && o.minY < v.height);
  const loadBottom = v.height + mountLift;
  const loadTop = loadBottom + (box ? ROOF_BOX.height : 0);
  const highObstacles = box ? obstacles.filter(o => o.maxY > loadBottom && o.minY < loadTop && o.minY >= v.height) : [];
  let minObstacle = Infinity, minSurface = Infinity, firstPlan = -1, firstHeight = -1, heightObject = '';
  for (let i = 0; i < poses.length; i++) {
    const pose = poses[i];
    const polygon = footprint(pose, sweptWidth(pose, mirrors));
    const surface = surfaceClearance(polygon);
    minSurface = Math.min(minSurface, surface);
    if (surface < 0 && firstPlan < 0) firstPlan = i;
    for (const obstacle of lowObstacles) {
      const distance = polygonDistance(polygon, obstacle);
      minObstacle = Math.min(minObstacle, distance);
      if (distance === 0 && firstPlan < 0) firstPlan = i;
    }
    if (firstHeight < 0 && box) {
      const load = footprint(pose, ROOF_BOX.width, ROOF_BOX.length);
      const hit = highObstacles.find(obstacle => overlaps(load, obstacle));
      if (hit) { firstHeight = i; heightObject = hit.name; }
    }
  }
  const opening = box ? roofBoxOpeningEnvelope(poses.at(-1), mountLift) : null;
  const openingCollision = opening ? obstacles.find(o => o.maxY > opening.minY && o.minY < opening.maxY && overlaps(opening.polygon, o))?.name || '' : '';
  // Дискретизация и простой прямоугольный габарит: резерв 2 см сверх проверенных отсчётов.
  return {
    firstPlan, firstHeight, heightObject,
    minObstacle: Math.max(0, minObstacle - 0.02), minSurface: minSurface - 0.02,
    totalHeight: loadTop, clearance: canopyClearance - loadTop,
    openingHeight: opening?.maxY ?? null,
    openingClearance: opening ? canopyClearance - opening.maxY : null,
    openingCollision,
    duration: poses.at(-1).time,
  };
}

export function createAccessRoutes(poses) {
  const routes = new THREE.Group();
  routes.name = 'Габаритный коридор и траектория задней оси';
  for (const gear of ['D', 'R']) {
    const frames = poses.filter(p => p.gear === gear);
    if (!frames.length) continue;
    const vertices = [], line = [];
    let previous = -Infinity, arrowDistance = -Infinity;
    for (let i = 0; i < frames.length; i++) {
      const pose = frames[i];
      line.push(new THREE.Vector3(pose.x, 0.055, pose.z));
      if (pose.distance - previous >= 0.18 || i === frames.length - 1) {
        const p = footprint(pose, sweptWidth(pose));
        for (const index of [0, 1, 2, 0, 2, 3]) vertices.push(p[index].x, gear === 'D' ? 0.012 : 0.016, p[index].z);
        previous = pose.distance;
      }
      if (pose.distance - arrowDistance >= 1.8) {
        const sign = gear === 'R' ? -1 : 1;
        const forward = new THREE.Vector3(sign * Math.cos(pose.heading), 0, sign * Math.sin(pose.heading));
        routes.add(new THREE.ArrowHelper(forward, new THREE.Vector3(pose.x, 0.06, pose.z), 0.45, gear === 'D' ? '#526c42' : '#a86b31', 0.2, 0.2));
        arrowDistance = pose.distance;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    routes.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: gear === 'D' ? '#bcc7ab' : '#d9c1a1', side: THREE.DoubleSide })));
    routes.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line), new THREE.LineBasicMaterial({ color: gear === 'D' ? '#526c42' : '#a86b31' })));
  }
  return routes;
}
