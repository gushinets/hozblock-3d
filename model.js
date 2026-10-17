import * as THREE from 'three';

// Метры. X — вправо на плане, Z — вниз на плане, Y — высота.
export const DIMENSIONS = Object.freeze({
  width: 6, sectionDepth: 4, height: 3.55, paving: 11,
  canopyStart: 1.1, wall: 0.12, roof: 0.22, overhang: 0.15,
  soffit: 0.025, lampDrop: 0.044,
  gateWidth: 1.6, gateHeight: 1.92, doorWidth: 0.9, doorOffset: 1.1,
});

export const CAR_POSITIONS = Object.freeze({
  canopy: { x: 3.1, z: 2.6, rotation: 0 },
  outside: { x: 8.5, z: 6.5, rotation: Math.PI / 2 },
});

export const VEHICLE = Object.freeze({
  length: 4.770, width: 1.895, height: 1.689, wheelbase: 2.845,
  frontOverhang: 0.880, rearOverhang: 1.045, track: 1.610,
  tyreWidth: 0.235, wheelRadius: 0.360, curbRadius: 5.9,
  mirrors: 2.2, mountLift: 0.060,
});
export const ROOF_BOX = Object.freeze({ length: 2.23, width: 0.93, height: 0.45, hingeHeight: 0.15 });

export const SITE = Object.freeze({
  west: -1.1, gateStart: 5.9, gateEnd: 11, gateTravel: 5.3,
  height: 2, eastEnd: 16.5, southEnd: 11.4, streetDepth: 4,
});

export function createSite() {
  const site = new THREE.Group();
  site.name = 'Забор и въезд по плану участка';
  const fence = new THREE.Group();
  fence.name = 'Неподвижный забор';
  const entranceGate = new THREE.Group();
  entranceGate.name = 'Откатные въездные ворота';
  site.add(fence, entranceGate);
  const panel = new THREE.MeshStandardMaterial({ color: '#424c49', roughness: 0.8, metalness: 0.2 });
  const frame = new THREE.MeshStandardMaterial({ color: '#293532', roughness: 0.65, metalness: 0.35 });
  function box(name, size, position, material = panel, parent = fence) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  const posts = new Set();
  const runs = [
    [SITE.west, 0, SITE.gateStart - 0.08, 0],
    [SITE.gateEnd + 0.08, 0, SITE.eastEnd, 0],
    [SITE.west, 0, SITE.west, SITE.southEnd],
  ];
  for (const [x1, z1, x2, z2] of runs) {
    const length = Math.hypot(x2 - x1, z2 - z1);
    const count = Math.ceil(length / 2.5);
    const alongX = z1 === z2;
    for (let i = 0; i <= count; i++) {
      const x = x1 + (x2 - x1) * i / count;
      const z = z1 + (z2 - z1) * i / count;
      const key = `${x},${z}`;
      if (!posts.has(key)) {
        box('Столб забора', [0.16, SITE.height + 0.16, 0.16], [x, (SITE.height - 0.16) / 2, z], frame);
        posts.add(key);
      }
      if (i === count) continue;
      const centerX = x + (x2 - x1) / count / 2;
      const centerZ = z + (z2 - z1) / count / 2;
      const span = length / count - 0.12;
      box('Секция забора', alongX ? [span, 1.8, 0.06] : [0.06, 1.8, span], [centerX, 1, centerZ]);
      for (const y of [0.15, 1.87]) {
        box('Ригель забора', alongX ? [span, 0.035, 0.085] : [0.085, 0.035, span], [centerX, y, centerZ], frame);
      }
    }
  }
  const gateWidth = SITE.gateEnd - SITE.gateStart + 0.1;
  const center = (SITE.gateStart + SITE.gateEnd) / 2;
  box('Полотно въездных ворот', [gateWidth, 1.8, 0.06], [center, 1, -0.18], panel, entranceGate);
  for (const y of [0.1, 1.96]) {
    box('Рама въездных ворот', [gateWidth + 0.08, 0.08, 0.09], [center, y, -0.18], frame, entranceGate);
  }
  for (const x of [SITE.gateStart - 0.05, SITE.gateEnd + 0.05]) {
    box('Рама въездных ворот', [0.08, 1.94, 0.09], [x, 1.03, -0.18], frame, entranceGate);
  }
  box('Ручка въездных ворот', [0.035, 0.22, 0.07], [SITE.gateStart + 0.25, 1.05, -0.24], frame, entranceGate);
  box('Направляющая откатных ворот', [gateWidth + SITE.gateTravel + 0.1, 0.02, 0.055],
    [center + SITE.gateTravel / 2, 0.015, -0.18], frame, site);
  setEntranceOpen(entranceGate, true);
  return { site, fence, entranceGate };
}

export function setEntranceOpen(entranceGate, open) {
  entranceGate.position.x = open ? SITE.gateTravel : 0;
  entranceGate.updateMatrixWorld(true);
}

export function createModel(overrides = {}) {
  const d = DIMENSIONS;
  const materials = {
    wall: new THREE.MeshStandardMaterial({ color: '#f4f1e8', roughness: 0.85 }),
    dark: new THREE.MeshStandardMaterial({ color: '#333b40', roughness: 0.65, metalness: 0.22 }),
    roof: new THREE.MeshStandardMaterial({ color: '#565c5c', roughness: 0.92 }),
    soffit: new THREE.MeshStandardMaterial({ color: '#e8e0d0', roughness: 0.85 }),
    concrete: new THREE.MeshStandardMaterial({ color: '#a9aaa3', roughness: 1 }),
    lamp: new THREE.MeshStandardMaterial({ color: '#fff0cb', emissive: '#ffd79a', emissiveIntensity: 0.6 }),
    ...overrides,
  };
  const building = new THREE.Group();
  building.name = 'Хозблок и навес';
  const shell = new THREE.Group();
  shell.name = 'Стены хозблока 6 × 4';
  building.add(shell);

  function box(name, size, position, material, parent = building) {
    const geometry = new THREE.BoxGeometry(...size);
    // Обшивка сохраняет одинаковый масштаб на стенах разной длины.
    if (material === materials.wall || material === materials.soffit) {
      const uv = geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        const face = Math.floor(i / 4);
        uv.setXY(i, uv.getX(i) * (face < 2 ? size[2] : size[0]),
          uv.getY(i) * (face === 2 || face === 3 ? size[2] : size[1]));
      }
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  const start = d.canopyStart + d.sectionDepth;
  const end = start + d.sectionDepth;
  const wallHeight = d.height - d.roof;
  box('Общая стена', [6, wallHeight, d.wall], [3, wallHeight / 2, start + d.wall / 2], materials.wall, shell);
  box('Глухая западная стена', [d.wall, wallHeight, 4], [d.wall / 2, wallHeight / 2, start + 2], materials.wall, shell);

  const pier = (4 - d.gateWidth) / 2;
  for (const z of [start + pier / 2, end - pier / 2]) {
    box('Простенок у ворот', [d.wall, wallHeight, pier], [6 - d.wall / 2, wallHeight / 2, z], materials.wall, shell);
  }
  box('Перемычка ворот', [d.wall, wallHeight - d.gateHeight, d.gateWidth],
    [6 - d.wall / 2, (wallHeight + d.gateHeight) / 2, start + 2], materials.wall, shell);

  for (const [x, width] of [[d.doorOffset / 2, d.doorOffset], [(d.doorOffset + d.doorWidth + 6) / 2, 6 - d.doorOffset - d.doorWidth]]) {
    box('Стена с боковой дверью', [width, wallHeight, d.wall], [x, wallHeight / 2, end - d.wall / 2], materials.wall, shell);
  }
  box('Перемычка двери', [d.doorWidth, wallHeight - 1.9, d.wall],
    [d.doorOffset + d.doorWidth / 2, (wallHeight + 1.9) / 2, end - d.wall / 2], materials.wall, shell);

  const gate = new THREE.Group();
  gate.name = 'Двустворчатые ворота 1.6 м';
  building.add(gate);
  for (const side of [-1, 1]) {
    const z = start + 2 + side * d.gateWidth / 4;
    box('Створка', [0.055, d.gateHeight - 0.025, d.gateWidth / 2 - 0.012], [6.012, d.gateHeight / 2, z], materials.dark, gate);
    for (let y = 0.32; y < d.gateHeight; y += 0.32) {
      box('Шов панели ворот', [0.004, 0.008, d.gateWidth / 2 - 0.04], [6.042, y, z], materials.roof, gate);
    }
    for (const y of [0.3, 1.58]) {
      box('Петля', [0.035, 0.11, 0.035], [6.055, y, start + 2 + side * (d.gateWidth / 2 - 0.06)], materials.dark, gate);
    }
  }
  box('Ручка ворот', [0.07, 0.025, 0.12], [6.065, 0.96, start + 1.91], materials.dark, gate);

  box('Боковая дверь', [d.doorWidth - 0.035, 1.88, 0.045], [1.55, 0.95, end + 0.006], materials.dark);
  box('Ручка боковой двери', [0.12, 0.025, 0.07], [1.84, 0.95, end + 0.045], materials.dark);
  box('Цоколь', [6, 0.07, 4], [3, -0.035, start + 2], materials.concrete);

  const roof = new THREE.Group();
  roof.name = 'Общая кровля';
  building.add(roof);
  box('Тёмная окантовка', [6 + d.overhang * 2, d.roof, 8 + d.overhang * 2],
    [3, d.height - d.roof / 2, d.canopyStart + 4], materials.dark, roof);
  box('Поверхность кровли', [6.22, 0.015, 8.22], [3, d.height - 0.012, d.canopyStart + 4], materials.roof, roof);
  box('Подшивка навеса', [6, d.soffit, 4], [3, wallHeight - d.soffit / 2, d.canopyStart + 2], materials.soffit, roof);

  for (const x of [0.08, 3, 5.92]) {
    box('Стойка навеса', [0.16, wallHeight, 0.16], [x, wallHeight / 2, d.canopyStart + 0.08], materials.wall);
    box('Основание стойки', [0.18, 0.035, 0.18], [x, 0.0175, d.canopyStart + 0.08], materials.dark);
  }
  for (let y = 0.22; y < wallHeight - 0.08; y += 0.155) {
    box('Горизонтальная рейка экрана', [2.75, 0.09, 0.055], [1.54, y, d.canopyStart + 0.09], materials.dark);
  }

  for (const z of [start + 0.55, end - 0.55]) {
    box('Фасадный светильник', [0.08, 0.2, 0.08], [6.065, 1.55, z], materials.dark);
    box('Рассеиватель', [0.065, 0.008, 0.065], [6.065, 1.654, z], materials.lamp);
  }
  for (const x of [1.5, 4.5]) {
    for (const z of [d.canopyStart + 1, d.canopyStart + 3]) {
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.018, 16), materials.lamp);
      lamp.position.set(x, wallHeight - d.lampDrop + 0.009, z);
      building.add(lamp);
    }
  }
  building.updateMatrixWorld(true);
  return { building, shell, roof };
}

export function createCar({ box: withBox = true, mountLift = VEHICLE.mountLift } = {}) {
  const car = new THREE.Group();
  car.name = 'Geely Monjaro · 4770 × 1895 × 1689 мм';
  const body = new THREE.Group();
  body.name = 'Кузов Monjaro';
  car.add(body);
  const paint = new THREE.MeshStandardMaterial({ color: '#42535b', metalness: 0.65, roughness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: '#182b32', metalness: 0.3, roughness: 0.16 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#202222', roughness: 0.95 });
  const metal = new THREE.MeshStandardMaterial({ color: '#b5bab9', metalness: 0.85, roughness: 0.25 });
  const lights = new THREE.MeshStandardMaterial({ color: '#e2eee9', emissive: '#c7dddf', emissiveIntensity: 0.25 });
  function box(size, position, material, parent = body) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function profile(points, depth, material, parent = body) {
    const shape = new THREE.Shape();
    points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y));
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.045, bevelSize: 0.045, bevelSegments: 2, steps: 1 });
    geometry.translate(0, 0, -depth / 2);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  const bodyShell = profile([[-2.34, 0.48], [-2.30, 0.91], [-1.8, 1.08], [1.6, 1.08], [2.30, 0.96], [2.34, 0.48]], 1.805, paint);
  bodyShell.geometry.computeBoundingBox();
  const bodySize = bodyShell.geometry.boundingBox.getSize(new THREE.Vector3());
  const bodyCenter = bodyShell.geometry.boundingBox.getCenter(new THREE.Vector3());
  bodyShell.geometry.translate(-bodyCenter.x, 0, -bodyCenter.z);
  bodyShell.geometry.scale(VEHICLE.length / bodySize.x, 1, VEHICLE.width / bodySize.z);
  profile([[-1.65, 1.04], [-1.10, 1.58], [0.62, 1.60], [1.32, 1.04]], 1.54, glass);
  box([1.82, 0.045, 1.63], [-0.24, 1.6325, 0], paint);
  box([0.08, 0.54, 1.65], [-0.35, 1.31, 0], paint);
  box([4.55, 0.15, 1.74], [0, 0.335, 0], rubber);
  for (const side of [-1, 1]) box([1.95, 0.034, 0.06], [-0.15, 1.672, side * 0.6], metal);
  const frontSteering = [], wheelRoll = [];
  const rearX = -VEHICLE.length / 2 + VEHICLE.rearOverhang;
  for (const x of [rearX, rearX + VEHICLE.wheelbase]) {
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, VEHICLE.wheelRadius, side * VEHICLE.track / 2);
      const rolling = new THREE.Group();
      pivot.add(rolling);
      body.add(pivot);
      wheelRoll.push(rolling);
      if (x > 0) frontSteering.push({ pivot, side });
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(VEHICLE.wheelRadius, VEHICLE.wheelRadius, VEHICLE.tyreWidth, 28), rubber);
      wheel.rotation.x = Math.PI / 2;
      wheel.castShadow = true;
      rolling.add(wheel);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.014, 24), rubber);
      rim.rotation.x = Math.PI / 2;
      rim.position.z = side * 0.121;
      rolling.add(rim);
      for (let i = 0; i < 5; i++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.45, 0.013), metal);
        spoke.position.z = side * 0.132;
        spoke.rotation.z = i * Math.PI / 5;
        rolling.add(spoke);
      }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 16), rubber);
      hub.rotation.x = Math.PI / 2;
      hub.position.z = side * 0.14;
      rolling.add(hub);
    }
  }
  box([0.03, 0.32, 1.25], [2.37, 0.70, 0], rubber);
  for (let z = -0.56; z <= 0.57; z += 0.085) box([0.028, 0.29, 0.018], [2.37, 0.71, z], metal);
  for (const side of [-1, 1]) {
    box([0.025, 0.07, 0.28], [2.37, 0.96, side * 0.73], lights);
    box([0.22, 0.1, 0.13], [0.73, 1.22, side * 1.035], paint);
    box([0.025, 0.1, 0.30], [-2.37, 0.88, side * 0.64], new THREE.MeshStandardMaterial({ color: '#873b35' }));
    for (const x of [-0.8, 0.5]) box([0.15, 0.025, 0.022], [x, 1.0, side * 0.934], metal);
  }
  const rack = new THREE.Group();
  rack.name = 'Turtle Air 2 · установочная прибавка уточняется';
  rack.position.y = VEHICLE.height;
  car.add(rack);
  const bars = [], feet = [];
  for (const x of [-0.65, 0.55]) {
    bars.push(box([0.07, 0.024, 1.18], [x, 0.048, 0], metal, rack));
    for (const side of [-1, 1]) feet.push(box([0.13, 0.036, 0.12], [x, 0.018, side * 0.55], rubber, rack));
  }
  const roofBox = new THREE.Group();
  roofBox.name = 'Sotra Volcano 750 · 2230 × 930 × 450 мм';
  car.add(roofBox);
  const boxMaterial = new THREE.MeshStandardMaterial({ color: '#303638', metalness: 0.12, roughness: 0.25 });
  const { length, width, hingeHeight } = ROOF_BOX;
  box([length - 0.08, 0.025, width - 0.08], [0, 0.0125, 0], rubber, roofBox);
  for (const side of [-1, 1]) {
    box([length, hingeHeight, 0.035], [0, hingeHeight / 2, side * (width - 0.035) / 2], boxMaterial, roofBox);
    box([0.035, hingeHeight, width - 0.07], [side * (length - 0.035) / 2, hingeHeight / 2, 0], boxMaterial, roofBox);
  }
  const lidPivot = new THREE.Group();
  lidPivot.name = 'Крышка · условная ось, открывание до 90°';
  roofBox.add(lidPivot);
  const lid = profile([[-1.075, 0.03], [-0.9, 0.22], [-0.35, 0.29], [0.55, 0.26], [1.075, 0.07], [1.035, 0.01], [-1.035, 0.01]],
    0.84, boxMaterial, lidPivot);
  lid.geometry.computeBoundingBox();
  const bounds = lid.geometry.boundingBox;
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  lid.geometry.translate(-center.x, -bounds.min.y, -center.z);
  lid.geometry.scale(length / size.x, (ROOF_BOX.height - hingeHeight) / size.y, width / size.z);
  const struts = [-0.65, 0.65].map(x => {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 1, 8), metal);
    rod.userData.x = x;
    roofBox.add(rod);
    return rod;
  });
  const loadOutline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(ROOF_BOX.length, ROOF_BOX.height, ROOF_BOX.width)),
    new THREE.LineBasicMaterial({ color: '#cc553e', depthTest: false }));
  loadOutline.position.y = ROOF_BOX.height / 2;
  loadOutline.visible = false;
  loadOutline.renderOrder = 8;
  roofBox.add(loadOutline);
  car.userData = { frontSteering, wheelRoll, rack, bars, feet, roofBox, loadOutline, body, lidPivot, lid, struts };
  updateRoofLoad(car, withBox, mountLift);
  return car;
}

export function updateRoofLoad(car, enabled, mountLift = VEHICLE.mountLift) {
  if (!Number.isFinite(mountLift) || mountLift < 0 || mountLift > 0.2) throw new Error('Прибавка крепления должна быть от 0 до 200 мм');
  const { roofBox, bars, feet, loadOutline } = car.userData;
  roofBox.visible = enabled;
  roofBox.position.y = VEHICLE.height + mountLift;
  bars.forEach(bar => { bar.position.y = mountLift - 0.012; });
  feet.forEach(foot => {
    const height = Math.max(0, mountLift - 0.024);
    foot.visible = height > 0;
    foot.scale.y = height / 0.036;
    foot.position.y = height / 2;
  });
  loadOutline.visible = false;
  setRoofBoxOpening(car, 'closed');
}

export function setRoofBoxOpening(car, side, angle = Math.PI / 2) {
  if (!['closed', 'left', 'right'].includes(side) || !Number.isFinite(angle) || angle < 0 || angle > Math.PI / 2) {
    throw new Error('Некорректная сторона или угол открывания бокса');
  }
  const { lidPivot, lid, struts } = car.userData;
  const sign = side === 'right' ? -1 : 1;
  const rotation = side === 'closed' ? 0 : sign * angle;
  // shortcut: ось на высоте 15 см и угол 90° условные; заменить после замера реального механизма.
  lidPivot.position.set(0, ROOF_BOX.hingeHeight, sign * ROOF_BOX.width / 2);
  lidPivot.rotation.x = rotation;
  lid.position.z = -sign * ROOF_BOX.width / 2;
  for (const rod of struts) {
    const start = new THREE.Vector3(rod.userData.x, 0.1, -sign * 0.25);
    const end = new THREE.Vector3(rod.userData.x, 0.03, -sign * (ROOF_BOX.width / 2 + 0.25))
      .applyAxisAngle(new THREE.Vector3(1, 0, 0), rotation).add(lidPivot.position);
    rod.position.copy(start).lerp(end, 0.5);
    rod.scale.y = side === 'closed' ? 0 : start.distanceTo(end);
    rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize());
    rod.visible = side !== 'closed' && angle > 0;
  }
  car.updateMatrixWorld(true);
}

export function setCarPose(car, pose) {
  const offset = VEHICLE.length / 2 - VEHICLE.rearOverhang;
  car.position.set(pose.x + offset * Math.cos(pose.heading), 0, pose.z + offset * Math.sin(pose.heading));
  car.rotation.y = -pose.heading;
  const radius = pose.steering ? VEHICLE.wheelbase / Math.tan(pose.steering) : Infinity;
  for (const { pivot, side } of car.userData.frontSteering) {
    pivot.rotation.y = pose.steering ? -Math.atan(VEHICLE.wheelbase / (radius - side * VEHICLE.track / 2)) : 0;
  }
  car.userData.wheelRoll.forEach(wheel => { wheel.rotation.z = -(pose.signedDistance || 0) / VEHICLE.wheelRadius; });
  car.updateMatrixWorld(true);
}

export function collisionBoxes(...groups) {
  const boxes = [];
  for (const group of groups) {
    group.updateMatrixWorld(true);
    group.traverse(mesh => {
      if (!mesh.isMesh) return;
      const bounds = new THREE.Box3().setFromObject(mesh);
      boxes.push({ name: mesh.name, minX: bounds.min.x, maxX: bounds.max.x, minZ: bounds.min.z, maxZ: bounds.max.z,
        minY: bounds.min.y, maxY: bounds.max.y });
    });
  }
  return boxes;
}

export function placeCar(car, place) {
  car.visible = place !== 'hidden';
  if (!car.visible) return;
  const position = CAR_POSITIONS[place];
  if (!position) throw new Error('Неизвестное место автомобиля');
  car.position.set(position.x, 0, position.z);
  car.rotation.y = position.rotation;
  car.updateMatrixWorld(true);
}
