import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3 } from 'three';
import { DIMENSIONS as d } from '../model.js';
import { INTERIOR as room, FURNITURE, INSIDE_VIEWS, createInterior, canStandInside, moveInside } from '../interior.js';

test('Интерьер помещается в хозблоке, потолок 2.455 м согласован с кровлей 2.70 м', () => {
  const { interior, furnishings, ceiling } = createInterior();
  const floor = new Box3().setFromObject(interior.getObjectByName('Пол под дерево'));
  assert.ok(Math.abs(floor.max.x - floor.min.x - 6) < 1e-6);
  assert.ok(Math.abs(floor.max.z - floor.min.z - 4) < 1e-6);
  const ceilingBounds = new Box3().setFromObject(ceiling.getObjectByName('Подшивка потолка'));
  assert.ok(Math.abs(ceilingBounds.min.y - 2.455) < 1e-6);
  assert.ok(Math.abs(ceilingBounds.min.y - room.height) < 1e-6);
  assert.ok(Math.abs(ceilingBounds.max.y - (d.height - d.roof)) < 1e-6);
  assert.ok(room.eye < room.height && room.eye === 1.6);
  for (const item of FURNITURE) {
    const b = new Box3().setFromObject(furnishings.getObjectByName(item.id));
    assert.ok(b.min.x >= room.west && b.max.x <= room.east, `${item.id} пересекает боковую стену`);
    assert.ok(b.min.z >= room.north && b.max.z <= room.south, `${item.id} пересекает торцевую стену`);
    assert.ok(b.max.y < room.height, `${item.id} выше потолка`);
  }
});

test('Камера останавливается перед стенами и мебелью даже при большом шаге', () => {
  const initial = INSIDE_VIEWS.passage;
  const wall = moveInside(initial, 50, 0);
  assert.ok(canStandInside(wall.x, wall.z));
  assert.ok(wall.x <= room.east - room.radius && wall.x > room.east - room.radius - 0.05);
  const rack = moveInside({ x: 3.2, z: 7.3 }, -20, 0);
  assert.ok(rack.x >= 2.55 + room.radius - 1e-6 && rack.x < 2.8);
  const bins = moveInside(initial, 0, 20);
  assert.ok(bins.z < 8.21, 'Камера не должна проходить сквозь ящики');
  let position = initial;
  for (let i = 0; i < 100; i++) {
    position = moveInside(position, Math.sin(i) * 0.8, Math.cos(i) * 0.8);
    assert.ok(canStandInside(position.x, position.z));
  }
  assert.throws(() => moveInside(initial, NaN, 0));
  assert.throws(() => moveInside({ x: 1.6, z: 7.3 }, 0, 0));
});

test('Все внутренние ракурсы и оба прохода вокруг стеллажей связаны между собой', () => {
  const step = 0.08, visited = new Set(), queue = [];
  const cell = (x, z) => [Math.round(x / step), Math.round(z / step)];
  queue.push(cell(INSIDE_VIEWS.passage.x, INSIDE_VIEWS.passage.z));
  for (let i = 0; i < queue.length; i++) {
    const [x, z] = queue[i], key = `${x},${z}`;
    if (visited.has(key) || !canStandInside(x * step, z * step)) continue;
    visited.add(key);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const neighbor = [x + dx, z + dz];
      if (!visited.has(neighbor.join(','))) queue.push(neighbor);
    }
  }
  const points = [...Object.values(INSIDE_VIEWS), { x: 1.3, z: 6.3 }, { x: 1.55, z: 8.48 }];
  for (const point of points) {
    assert.ok(canStandInside(point.x, point.z), 'Исходная точка камеры должна быть свободна');
    assert.ok(visited.has(cell(point.x, point.z).join(',')), `Нет прохода к ${point.x}, ${point.z}`);
  }
});
