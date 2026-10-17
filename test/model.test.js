import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3 } from 'three';
import { DIMENSIONS as d, SITE, VEHICLE, ROOF_BOX, createModel, createCar, placeCar, createSite, setEntranceOpen, updateRoofLoad, setRoofBoxOpening, setCarPose } from '../model.js';
import { roofBoxOpeningEnvelope, OPENING_RESERVE, CANOPY_CLEARANCE } from '../driving.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);

test('Габариты стен 6 × 4 м, единая кровля поднята до 3.55 м', () => {
  const { shell, roof } = createModel();
  const walls = new Box3().setFromObject(shell);
  close(walls.min.x, 0);
  close(walls.max.x, d.width);
  close(walls.min.z, d.canopyStart + d.sectionDepth);
  close(walls.max.z, d.canopyStart + d.sectionDepth * 2);
  close(walls.max.y, d.height - d.roof);
  const roofBounds = new Box3().setFromObject(roof);
  close(roofBounds.max.y, d.height);
  close(roofBounds.max.y, 3.55);
  close(roofBounds.max.x - roofBounds.min.x, 6 + 2 * d.overhang);
  close(roofBounds.max.z - roofBounds.min.z, 8 + 2 * d.overhang);
});

test('Крышка открывается поочерёдно с двух сторон; весь ход входит в расчётный габарит', () => {
  const car = createCar();
  placeCar(car, 'canopy');
  const envelope = roofBoxOpeningEnvelope({ x: 3.1 - 1.34, z: 2.6, heading: 0 });
  const minX = Math.min(...envelope.polygon.map(p => p.x));
  const maxX = Math.max(...envelope.polygon.map(p => p.x));
  const minZ = Math.min(...envelope.polygon.map(p => p.z));
  const maxZ = Math.max(...envelope.polygon.map(p => p.z));
  for (const side of ['left', 'right']) {
    for (let degrees = 0; degrees <= 90; degrees++) {
      setRoofBoxOpening(car, side, degrees * Math.PI / 180);
      const bounds = new Box3().setFromObject(car.userData.roofBox);
      assert.ok(bounds.min.x >= minX - 1e-6 && bounds.max.x <= maxX + 1e-6);
      assert.ok(bounds.min.z >= minZ - 1e-6 && bounds.max.z <= maxZ + 1e-6);
      assert.ok(bounds.max.y <= envelope.maxY);
      assert.ok(CANOPY_CLEARANCE - bounds.max.y >= OPENING_RESERVE);
    }
  }
  assert.throws(() => setRoofBoxOpening(car, 'both'));
  assert.throws(() => setRoofBoxOpening(car, 'left', NaN));
  assert.throws(() => setRoofBoxOpening(car, 'left', Math.PI));
  setRoofBoxOpening(car, 'closed');
  const bounds = new Box3().setFromObject(car.userData.roofBox);
  close(bounds.max.y, VEHICLE.height + VEHICLE.mountLift + ROOF_BOX.height);
  setRoofBoxOpening(car, 'left');
  updateRoofLoad(car, false);
  close(car.userData.lidPivot.rotation.x, 0);
});

test('Автомобиль помещается под навесом и на открытой площадке', () => {
  const car = createCar({ box: false });
  placeCar(car, 'canopy');
  let bounds = new Box3().setFromObject(car);
  assert.ok(bounds.min.x > 0.2 && bounds.max.x < 6);
  assert.ok(bounds.min.z > d.canopyStart + 0.2);
  assert.ok(bounds.max.z < d.canopyStart + d.sectionDepth - d.wall);
  assert.ok(new Box3().setFromObject(car.userData.body).max.y < d.height - d.roof);
  assert.equal(car.userData.roofBox.visible, false);
  placeCar(car, 'outside');
  bounds = new Box3().setFromObject(car);
  assert.ok(bounds.min.x > 6 && bounds.max.x < d.paving);
  assert.ok(bounds.min.z > 0 && bounds.max.z < d.paving);
  placeCar(car, 'hidden');
  assert.equal(car.visible, false);
  assert.throws(() => placeCar(car, 'unknown'));
});

test('Габариты Monjaro, оси и автобокс соответствуют исходным размерам', () => {
  const car = createCar();
  const body = new Box3().setFromObject(car.userData.body);
  close(body.max.x - body.min.x, VEHICLE.length);
  close(body.max.z - body.min.z, VEHICLE.mirrors);
  close(body.max.y, VEHICLE.height);
  close(car.userData.frontSteering[0].pivot.position.x, VEHICLE.wheelbase - (VEHICLE.length / 2 - VEHICLE.rearOverhang));
  const load = new Box3().setFromObject(car.userData.roofBox);
  close(load.max.x - load.min.x, ROOF_BOX.length);
  close(load.max.z - load.min.z, ROOF_BOX.width);
  close(load.max.y - load.min.y, ROOF_BOX.height);
  close(load.max.y, VEHICLE.height + VEHICLE.mountLift + ROOF_BOX.height);
  updateRoofLoad(car, true, 0.09);
  close(new Box3().setFromObject(car.userData.roofBox).max.y, 2.229);
  assert.throws(() => updateRoofLoad(car, true, NaN));
  assert.throws(() => updateRoofLoad(car, true, -0.01));
  assert.throws(() => updateRoofLoad(car, true, 0.201));
});

test('Кузов следует задней оси, внутреннее переднее колесо поворачивает сильнее', () => {
  const car = createCar();
  setCarPose(car, { x: 8.5, z: 7.1, heading: Math.PI / 2, steering: Math.atan(VEHICLE.wheelbase / 4.5), signedDistance: 2 });
  close(car.position.x, 8.5);
  close(car.position.z, 8.44);
  close(car.rotation.y, -Math.PI / 2);
  const inner = car.userData.frontSteering.find(w => w.side === 1).pivot;
  const outer = car.userData.frontSteering.find(w => w.side === -1).pivot;
  assert.ok(Math.abs(inner.rotation.y) > Math.abs(outer.rotation.y));
  close(car.userData.wheelRoll[0].rotation.z, -2 / VEHICLE.wheelRadius);
});

test('Въезд по плану свободен от секций забора, ворота откатываются вправо', () => {
  const { fence, entranceGate } = createSite();
  close(SITE.gateStart - SITE.west, 7);
  close(SITE.gateEnd - SITE.gateStart, 5.1);
  for (const part of fence.children) {
    const bounds = new Box3().setFromObject(part);
    assert.ok(bounds.max.x <= SITE.gateStart + 1e-6 || bounds.min.x >= SITE.gateEnd - 1e-6,
      `${part.name} перекрывает въезд`);
  }
  let gateBounds = new Box3().setFromObject(entranceGate);
  assert.ok(gateBounds.min.x > SITE.gateEnd, 'Открытое полотно должно полностью освободить проём');
  assert.ok(gateBounds.max.x < SITE.eastEnd, 'Для отката предусмотрено место вдоль уличного забора');
  setEntranceOpen(entranceGate, false);
  gateBounds = new Box3().setFromObject(entranceGate);
  assert.ok(gateBounds.min.x < SITE.gateStart && gateBounds.max.x > SITE.gateEnd,
    'Закрытое полотно должно перекрывать весь въезд');
});
