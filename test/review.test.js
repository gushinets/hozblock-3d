import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReview, serializeReview, mergeReviews, validateComment } from '../review-data.js';

const sample = () => ({
  id: 'comment-1', element: 'Стойка навеса', author: 'Архитектор', text: 'Уточнить сечение стойки',
  createdAt: '2026-10-18T12:00:00.000Z', updatedAt: '2026-10-18T12:00:00.000Z', modelVersion: 'layout-1',
  anchor: { root: 'building', path: [0, 1], point: [0, 1, 0], world: [6, 1, 2] },
  view: { variant: 'mono', mode: 'outside', plan: false,
    walker: { x: 3.1, z: 6.45, yaw: 1.57, pitch: -0.07 },
    camera: { position: [10, 3, 2], target: [3, 1, 2], fov: 38 },
    scene: { route: 'canopy', box: true, mountLift: 60, time: 23.64, lid: 'closed', entrance: true,
      roof: true, fascia: true, dimensions: false, routes: false } },
  preview: '',
});

test('Файл замечаний сохраняет точку, ракурс и состояние машины без потерь', () => {
  const comment = sample();
  assert.deepEqual(parseReview(serializeReview([comment])), [comment]);
  const interior = sample();
  interior.view.mode = 'inside'; interior.view.plan = true;
  assert.deepEqual(parseReview(serializeReview([interior])), [interior]);
});

test('Импорт отклоняет чужие файлы, невалидные координаты и активные ссылки в миниатюрах', () => {
  assert.throws(() => parseReview('{}'));
  assert.throws(() => parseReview('{'));
  for (const change of [
    c => { c.anchor.point[0] = Infinity; },
    c => { c.anchor.path = [-1]; },
    c => { c.anchor.root = '__proto__'; },
    c => { c.view.scene.mountLift = 999; },
    c => { c.view.camera.fov = 0; },
    c => { c.view.variant = 'unknown'; },
    c => { c.preview = 'javascript:alert(1)'; },
    c => { c.preview = 'data:image/svg+xml,<svg onload="alert(1)"/>'; },
    c => { c.text = ' '; },
    c => { c.text = 'x'.repeat(3001); },
  ]) {
    const comment = sample(); change(comment);
    assert.throws(() => validateComment(comment));
  }
  assert.throws(() => parseReview(serializeReview([sample(), sample()])));
});

test('Повторная загрузка не дублирует метки и сохраняет более новую редакцию', () => {
  const original = sample(), updated = { ...sample(), text: 'Новая редакция', updatedAt: '2026-10-18T13:00:00.000Z' };
  assert.deepEqual(mergeReviews([original], [updated, { ...sample(), id: 'comment-2' }]), [updated, { ...sample(), id: 'comment-2' }]);
  assert.deepEqual(mergeReviews([updated], [original]), [updated]);
  const literal = { ...sample(), text: '<img src=x onerror=alert(1)>' };
  assert.equal(validateComment(literal).text, literal.text, 'Текст сохраняется как текст, без интерпретации HTML');
});
