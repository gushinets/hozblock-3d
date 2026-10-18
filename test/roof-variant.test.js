import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3 } from 'three';
import { createModel, createSite, collisionBoxes } from '../model.js';
import { createInterior } from '../interior.js';
import { buildManeuver, analyzeManeuver } from '../driving.js';

const spec = { slope: 0.03, minClearHeight: 2.3 };
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-5, `${actual} != ${expected}`);

test('Односкатная кровля падает к задней стене, верхний край 2.7895 м', () => {
  const { roof, shell } = createModel({}, spec);
  const fascia = new Box3().setFromObject(roof.getObjectByName('Тёмная окантовка'));
  close(fascia.max.y, 2.7895);
  close(fascia.min.y, 2.3205);
  close(fascia.max.z - fascia.min.z, 8.3);
  const walls = new Box3().setFromObject(shell);
  close(walls.max.y, 2.445);
  close(walls.min.y, 0);
});

test('Минимальный чистый потолок нового варианта 2.30 м, мебель остаётся ниже него', () => {
  const { profile } = createModel({}, spec);
  const { ceiling, furnishings } = createInterior({}, profile);
  const bounds = new Box3().setFromObject(ceiling);
  close(bounds.min.y, 2.3);
  close(bounds.max.y, 2.445);
  assert.ok(new Box3().setFromObject(furnishings).max.y < bounds.min.y);
});

test('Уклон учитывается в заезде: 202 мм с обычным креплением, высокое крепление тоже проходит', () => {
  const { building } = createModel({}, spec);
  const { site } = createSite();
  const obstacles = collisionBoxes(building, site);
  const poses = buildManeuver();
  const result = analyzeManeuver(poses, obstacles, { canopyClearance: 2.401 });
  assert.equal(result.firstPlan, -1);
  assert.equal(result.firstHeight, -1);
  close(result.clearance, 0.202);
  const taller = analyzeManeuver(poses, obstacles, { mountLift: 0.2, canopyClearance: 2.401 });
  assert.equal(taller.firstHeight, -1, 'Низкая задняя кромка не должна ложно блокировать заезд под высокой частью');
});

test('Водосток собирает воду за задней стеной и уходит в закрытый подземный отвод', () => {
  const { roof } = createModel({}, spec);
  const gutter = roof.getObjectByName('Водосборный жёлоб');
  const pipe = roof.getObjectByName('Закрытая водосточная труба');
  assert.ok(gutter && pipe, 'Нужны и жёлоб, и труба');
  const gutterBounds = new Box3().setFromObject(gutter);
  assert.ok(gutterBounds.min.z > 9.1);
  assert.ok(new Box3().setFromObject(pipe).min.y < -0.2, 'Труба должна уходить ниже мощения');
});

test('Фальшпанель скрывает скат ровным верхом и сохраняет заезд с боксом', () => {
  const { building, roof, profile } = createModel({}, { ...spec, concealed: true });
  const fascia = roof.getObjectByName('Съёмная фальшпанель кровли');
  assert.ok(fascia, 'Нужна отдельная оболочка, которую можно скрыть');
  fascia.traverse(mesh => {
    if (mesh.isMesh) close(new Box3().setFromObject(mesh).max.y, 2.86);
  });
  close(new Box3().setFromObject(roof.getObjectByName('Тёмная окантовка')).max.y, 2.7895);
  const { site } = createSite();
  const result = analyzeManeuver(buildManeuver(), collisionBoxes(building, site), { canopyClearance: profile.canopyClearance });
  assert.equal(result.firstHeight, -1);
  assert.equal(result.firstPlan, -1);
  close(result.clearance, 0.202);
});
