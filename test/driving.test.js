import test from 'node:test';
import assert from 'node:assert/strict';
import { VEHICLE as v, CAR_POSITIONS, createModel, createSite, collisionBoxes, setEntranceOpen } from '../model.js';
import { buildManeuver, sampleManeuver, footprint, overlaps, polygonDistance, analyzeManeuver, CANOPY_CLEARANCE, SOFFIT_CLEARANCE, CENTER_FROM_REAR, REAR_TURN_RADIUS } from '../driving.js';

const close = (a, b, epsilon = 1e-6) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
const { building } = createModel();
const { site, entranceGate } = createSite();
const obstacles = collisionBoxes(building, site);

test('Маршрут имеет базу Monjaro, прямые и дуги без бокового скольжения', () => {
  const poses = buildManeuver();
  for (let i = 1; i < poses.length; i++) {
    const p = poses[i], a = poses[i - 1];
    const travel = p.signedDistance - a.signedDistance;
    assert.ok(p.time > a.time);
    assert.ok(Math.abs(travel) <= 0.010001);
    if (!travel) { close(p.x, a.x); close(p.z, a.z); continue; }
    const middle = (p.heading + a.heading) / 2;
    const dx = p.x - a.x, dz = p.z - a.z;
    close(-dx * Math.sin(middle) + dz * Math.cos(middle), 0);
    close(p.heading - a.heading, travel * Math.tan(p.steering) / v.wheelbase);
    assert.equal(Math.sign(travel), p.gear === 'D' ? 1 : -1);
  }
  const radiusAtOuterTyre = Math.hypot(REAR_TURN_RADIUS + v.track / 2, v.wheelbase) + v.tyreWidth / 2;
  assert.ok(radiusAtOuterTyre >= v.curbRadius, 'Не использовать меньший радиус, чем позволяет автомобиль');
  assert.throws(() => buildManeuver('unknown'));
});

test('Оба маршрута заканчиваются в заданных местах, паузы не перемещают кузов', () => {
  for (const destination of ['canopy', 'outside']) {
    const poses = buildManeuver(destination);
    const end = poses.at(-1), target = CAR_POSITIONS[destination];
    close(end.x + CENTER_FROM_REAR * Math.cos(end.heading), target.x);
    close(end.z + CENTER_FROM_REAR * Math.sin(end.heading), target.z);
    close(end.heading, destination === 'canopy' ? 0 : Math.PI / 2);
    assert.equal(end.gear, 'P');
    const holdIndex = poses.findIndex((p, i) => i > 0 && p.distance === poses[i - 1].distance);
    const a = poses[holdIndex - 1], b = poses[holdIndex];
    const middle = sampleManeuver(poses, (a.time + b.time) / 2);
    close(middle.x, a.x); close(middle.z, a.z);
    assert.ok(middle.steering > 0 && middle.steering < b.steering);
    close(sampleManeuver(poses, 1e6).x, end.x);
    close(sampleManeuver(poses, -100).x, poses[0].x);
  }
});

test('Проверка пересечений учитывает поворот кузова, касание и расстояние', () => {
  const polygon = footprint({ x: -CENTER_FROM_REAR, z: 0, heading: 0 }, 2, 4);
  const far = { minX: 3, maxX: 4, minZ: -1, maxZ: 1 };
  close(polygonDistance(polygon, far), 1);
  assert.equal(overlaps(polygon, far), false);
  assert.equal(overlaps(polygon, { minX: 2, maxX: 3, minZ: 0, maxZ: 1 }), true);
  const rotated = footprint({ x: 0, z: -CENTER_FROM_REAR, heading: Math.PI / 2 }, 2, 4);
  close(polygonDistance(rotated, far), 2);
});

test('Кровля 2.70 м пропускает полный заезд с закрытым боксом с запасом 237 мм', () => {
  const poses = buildManeuver();
  const loaded = analyzeManeuver(poses, obstacles);
  assert.equal(loaded.firstPlan, -1);
  assert.equal(loaded.firstHeight, -1);
  assert.ok(loaded.minObstacle >= 0.17 && loaded.minObstacle < 0.19);
  close(loaded.minSurface, 0.155);
  close(loaded.totalHeight, 2.199);
  close(SOFFIT_CLEARANCE, 2.455);
  close(CANOPY_CLEARANCE, 2.436);
  close(loaded.clearance, 0.237);
  assert.ok(loaded.clearance >= 0.20);
  close(loaded.openingHeight, 3.129);
  close(loaded.openingClearance, -0.693);
  assert.ok(loaded.openingCollision, 'Под кровлей крышка должна оставаться закрытой');
  const unloaded = analyzeManeuver(poses, obstacles, { box: false });
  assert.equal(unloaded.firstPlan, -1);
  assert.equal(unloaded.firstHeight, -1);
  close(unloaded.clearance, 0.687);
  assert.equal(unloaded.openingHeight, null);
  const zeroLift = analyzeManeuver(poses, obstacles, { mountLift: 0 });
  assert.equal(zeroLift.firstHeight, -1);
  close(zeroLift.clearance, 0.297);
  const higherRack = analyzeManeuver(poses, obstacles, { mountLift: 0.09 });
  assert.equal(higherRack.firstHeight, -1);
  close(higherRack.clearance, 0.207);
  assert.throws(() => analyzeManeuver(poses, obstacles, { mountLift: Infinity }));
});

test('Низкая балка всё ещё останавливает заезд, препятствие сбоку блокирует открывание', () => {
  const poses = buildManeuver();
  const beam = { name: 'Низкая балка', minX: 0, maxX: 6.15, minZ: 1.1, maxZ: 5.1, minY: 2.055, maxY: 2.3 };
  const blocked = analyzeManeuver(poses, [...obstacles, beam]);
  assert.ok(blocked.firstHeight > 0);
  const shelf = { name: 'Полка над боксом', minX: 2, maxX: 4, minZ: 2, maxZ: 3, minY: 2.7, maxY: 2.8 };
  const opening = analyzeManeuver(poses, [shelf]);
  assert.equal(opening.firstHeight, -1);
  assert.equal(opening.openingCollision, shelf.name);
});

test('Бокс допускает стоянку на открытой площадке; закрытые ворота блокируют въезд', () => {
  const poses = buildManeuver('outside');
  const open = analyzeManeuver(poses, obstacles);
  assert.equal(open.firstPlan, -1);
  assert.equal(open.firstHeight, -1);
  assert.equal(open.openingCollision, '', 'На открытой площадке над боксом нет кровли');
  setEntranceOpen(entranceGate, false);
  const closed = analyzeManeuver(poses, collisionBoxes(building, site));
  assert.ok(closed.firstPlan > 0);
});
