import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3 } from 'three';
import { DIMENSIONS as d } from '../model.js';
import { INTERIOR as room, FURNITURE, INSIDE_VIEWS, createInterior, canStandInside, moveInside, furnitureBounds } from '../interior.js';

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
    const footprint = furnitureBounds(item);
    assert.ok(b.min.x >= footprint.minX - 1e-6 && b.max.x <= footprint.maxX + 1e-6
      && b.min.z >= footprint.minZ - 1e-6 && b.max.z <= footprint.maxZ + 1e-6,
    `${item.id}: реальная геометрия выходит за габарит, используемый для проходов`);
  }
});

test('Камера останавливается перед стенами и мебелью даже при большом шаге', () => {
  const initial = INSIDE_VIEWS.passage;
  const wall = moveInside({ x: 4.95, z: 7.1 }, 50, 0);
  assert.ok(canStandInside(wall.x, wall.z));
  assert.ok(wall.x <= room.east - room.radius && wall.x > room.east - room.radius - 0.05);
  const returnEdge = furnitureBounds(FURNITURE.find(item => item.id === 'return')).maxX;
  const rack = moveInside({ x: 3.05, z: 7.6 }, -20, 0);
  assert.ok(rack.x >= returnEdge + room.radius - 1e-6 && rack.x < returnEdge + room.radius + 0.05);
  const bins = moveInside({ x: 3.2, z: 7.9 }, 0, 20);
  const binFront = furnitureBounds(FURNITURE.find(item => item.id === 'bins')).minZ;
  assert.ok(bins.z <= binFront - room.radius + 1e-6, 'Камера не должна проходить сквозь ящики');
  let position = initial;
  for (let i = 0; i < 100; i++) {
    position = moveInside(position, Math.sin(i) * 0.8, Math.cos(i) * 0.8);
    assert.ok(canStandInside(position.x, position.z));
  }
  assert.throws(() => moveInside(initial, NaN, 0));
  const blocked = FURNITURE.find(item => item.id === 'return');
  assert.throws(() => moveInside(blocked, 0, 0));
});

test('Тачка висит у стены колесом вниз, ручками вверх и освобождает проход', () => {
  const { furnishings } = createInterior();
  const barrow = furnishings.getObjectByName('barrow');
  const bounds = new Box3().setFromObject(barrow);
  assert.ok(bounds.min.y > 0.3, 'Подвешенная тачка не должна стоять на полу');
  const body = new Box3().setFromObject(barrow.getObjectByName('Тачка на настенном подвесе'));
  assert.ok(body.max.y - body.min.y >= 1.25 && body.max.y - body.min.y <= 1.35,
    'Длина эскизной тачки от колеса до ручек должна быть около 1,30 м');
  assert.ok(body.max.x - body.min.x >= 0.60 && body.max.x - body.min.x <= 0.66, 'Корыто около 65 см шириной');
  const handles = barrow.getObjectByName('Ручка тачки');
  assert.ok(handles.matrixWorld.elements[13] > 1.7, 'Ручки должны быть направлены вверх');
  const tray = new Box3().setFromObject(barrow.getObjectByName('Дно тачки'));
  assert.ok(tray.max.z - tray.min.z < 0.08 && tray.max.y - tray.min.y > 0.4,
    'Дно корыта должно располагаться вертикально вдоль стены');
  assert.ok(canStandInside(5.39, 6.38), 'Перед подвесом должен освободиться проход');
});

test('Велосипед подвешен за переднее колесо рядом с тачкой, руль учтён в проходе', () => {
  const { furnishings } = createInterior();
  const bike = furnishings.getObjectByName('bike');
  const wheels = [];
  bike.traverse(object => {
    if (object.name === 'Шина велосипеда') wheels.push(new Box3().setFromObject(object));
  });
  assert.equal(wheels.length, 2);
  assert.ok(wheels[0].min.y > 0.3, 'Заднее колесо должно быть поднято над полом');
  assert.ok(wheels[1].min.y > wheels[0].max.y, 'Переднее колесо должно находиться над задним');
  assert.ok(wheels.every(wheel => wheel.max.x - wheel.min.x < 0.1), 'Колёса должны стоять поперёк стены');
  const body = new Box3().setFromObject(bike.getObjectByName('Велосипед на крюке за переднее колесо'));
  assert.ok(body.max.x - body.min.x >= 0.65 && body.max.x - body.min.x <= 0.67, 'Ширина реального руля около 66 см');
  assert.ok(body.max.y - body.min.y >= 1.75 && body.max.y - body.min.y <= 1.85, 'Длина эскизного велосипеда около 1,80 м');
  const item = FURNITURE.find(item => item.id === 'bike');
  assert.ok(!canStandInside(item.x, 6.12), 'Камера не должна проходить сквозь выступающие раму и руль');
});

test('Новая расстановка заполняет стены, уплотняет подвесы и оставляет подход к хранению', () => {
  const { furnishings } = createInterior();
  const bounds = id => new Box3().setFromObject(furnishings.getObjectByName(id));
  const west = bounds('west');
  assert.ok(Math.abs(west.min.z - room.north) < 0.006 && Math.abs(west.max.z - room.south) < 0.006,
    'Стеллаж №1 должен занимать стену от угла до угла');
  const returned = FURNITURE.find(item => item.id === 'return');
  assert.equal(returned.angle, Math.PI / 2, 'Секция №2 должна быть повёрнута на 90 градусов');
  assert.ok(Math.abs(bounds('return').max.z - room.south) < 0.006, 'Торец секции должен быть у стены с обычной дверью');
  const north = furnitureBounds(FURNITURE.find(item => item.id === 'north'));
  const bike = furnitureBounds(FURNITURE.find(item => item.id === 'bike'));
  const barrow = furnitureBounds(FURNITURE.find(item => item.id === 'barrow'));
  for (const gap of [bike.minX - north.maxX, barrow.minX - bike.maxX, room.east - barrow.maxX]) {
    assert.ok(gap >= 0.08 - 1e-6 && gap <= 0.12 + 1e-6, 'У подвесов нужны небольшие рабочие зазоры вместо пустой стены');
  }
  assert.ok(bike.maxX - bike.minX >= 0.66, 'Габарит велосипедного руля нельзя ужать для увеличения полок');
  const table = furnitureBounds(FURNITURE.find(item => item.id === 'mowers'));
  const bins = furnitureBounds(FURNITURE.find(item => item.id === 'bins'));
  const ladder = furnitureBounds(FURNITURE.find(item => item.id === 'ladder'));
  const tools = furnitureBounds(FURNITURE.find(item => item.id === 'tools'));
  assert.ok(Math.abs(bins.maxX - 3.9) < 1e-6, 'Крайняя секция ящиков со стороны техники удалена');
  const drawers = furnishings.getObjectByName('bins').getObjectsByProperty('name', 'Дно ящика');
  assert.equal(drawers.length, 10, 'Остались две секции по пять ящиков');
  assert.ok(table.minX >= bins.maxX && table.minX - bins.maxX <= 0.05,
    'Стойка с техникой должна стоять рядом с оставшимися ящиками');
  assert.ok(room.south - bounds('mowers').max.z <= 0.08, 'Стойка с техникой должна стоять вдоль стены');
  assert.ok(tools.minX - table.maxX >= 0.75 && canStandInside(5.3, 8.5),
    'Справа от стойки нужен подход к лестнице и садовому инструменту');
  assert.ok(canStandInside(3.8, 7.12), 'Середина помещения должна освободиться');
  assert.ok(bounds('ladder').max.z > room.south - 0.08, 'Лестница перенесена к стене со стеллажами');
  assert.ok(bounds('tools').max.x > room.east - 0.08, 'Стойка с инструментом перенесена на стену с воротами');
  for (let i = 0; i < FURNITURE.length; i++) for (let j = i + 1; j < FURNITURE.length; j++) {
    const a = furnitureBounds(FURNITURE[i]), b = furnitureBounds(FURNITURE[j]);
    assert.ok(a.maxX <= b.minX + 1e-6 || b.maxX <= a.minX + 1e-6 || a.maxZ <= b.minZ + 1e-6 || b.maxZ <= a.minZ + 1e-6,
      `${FURNITURE[i].id} пересекается с ${FURNITURE[j].id}`);
  }
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
  const points = [...Object.values(INSIDE_VIEWS), { x: 1.3, z: 6.3 }, { x: 1.55, z: 8.48 },
    { x: 5.25, z: 8.35 }, { x: 5.25, z: 8.55 }, { x: 3.4, z: 8.0 }, { x: 4.68, z: 6.8 }];
  for (const point of points) {
    assert.ok(canStandInside(point.x, point.z), 'Исходная точка камеры должна быть свободна');
    assert.ok(visited.has(cell(point.x, point.z).join(',')), `Нет прохода к ${point.x}, ${point.z}`);
  }
});
