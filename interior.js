import * as THREE from 'three';
import { DIMENSIONS as d } from './model.js';

const start = d.canopyStart + d.sectionDepth;
export const INTERIOR = Object.freeze({
  west: d.wall, east: d.width - d.wall, north: start + d.wall,
  south: start + d.sectionDepth - d.wall, height: 2.3, eye: 1.6, radius: 0.18,
});

// Размеры мебели восстановлены по пропорциям фотографий; заменить после обмеров.
export const FURNITURE = [
  { id: 'west', type: 'rack', x: 0.475, z: 7.1, width: 3.12, depth: 0.55, angle: Math.PI / 2 },
  { id: 'north', type: 'rack', x: 1.94, z: 5.52, width: 2.38, depth: 0.55, angle: 0 },
  { id: 'return', type: 'rack', x: 1.65, z: 7.30, width: 1.8, depth: 0.55, angle: 0 },
  { id: 'bins', type: 'bins', x: 3.32, z: 8.66, width: 2.5, depth: 0.56, angle: 0 },
  { id: 'mowers', type: 'table', x: 5.20, z: 8.52, width: 1, depth: 0.78, angle: 0 },
  { id: 'bike', type: 'bike', x: 4.05, z: 5.53, width: 1.7, depth: 0.56, angle: 0 },
  { id: 'barrow', type: 'barrow', x: 5.39, z: 5.78, width: 0.74, depth: 1, angle: 0 },
  { id: 'ladder', type: 'ladder', x: 5.83, z: 8.48, width: 0.08, depth: 0.7, angle: 0 },
].map(Object.freeze);

export const INSIDE_VIEWS = Object.freeze({
  passage: { x: 3.15, z: 7.12, yaw: Math.PI / 2, pitch: -0.07 },
  shelves: { x: 3.2, z: 6.55, yaw: -1.95, pitch: -0.10 },
  equipment: { x: 4.1, z: 7.05, yaw: 2.55, pitch: -0.13 },
  door: { x: 1.55, z: 8.48, yaw: 1.15, pitch: -0.07 },
});

export function furnitureBounds(item) {
  const width = Math.abs(Math.cos(item.angle)) * item.width + Math.abs(Math.sin(item.angle)) * item.depth;
  const depth = Math.abs(Math.sin(item.angle)) * item.width + Math.abs(Math.cos(item.angle)) * item.depth;
  return { minX: item.x - width / 2, maxX: item.x + width / 2, minZ: item.z - depth / 2, maxZ: item.z + depth / 2 };
}

export function canStandInside(x, z) {
  const r = INTERIOR.radius;
  if (!Number.isFinite(x) || !Number.isFinite(z) || x < INTERIOR.west + r || x > INTERIOR.east - r
    || z < INTERIOR.north + r || z > INTERIOR.south - r) return false;
  return FURNITURE.every(item => {
    const b = furnitureBounds(item);
    const dx = x - Math.max(b.minX, Math.min(x, b.maxX));
    const dz = z - Math.max(b.minZ, Math.min(z, b.maxZ));
    return dx * dx + dz * dz >= r * r;
  });
}

export function moveInside(position, dx, dz) {
  if (![position.x, position.z, dx, dz].every(Number.isFinite) || !canStandInside(position.x, position.z)) {
    throw new Error('Недопустимая позиция внутри помещения');
  }
  // Маленький шаг не позволяет перескочить стену или стеллаж; вдоль препятствия можно скользить.
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.04));
  let { x, z } = position;
  for (let i = 0; i < steps; i++) {
    if (canStandInside(x + dx / steps, z)) x += dx / steps;
    if (canStandInside(x, z + dz / steps)) z += dz / steps;
  }
  return { x, z };
}

export function createInterior(overrides = {}) {
  const interior = new THREE.Group();
  interior.name = 'Интерьер по исходным фотографиям';
  const enclosure = new THREE.Group();
  const ceiling = new THREE.Group();
  const furnishings = new THREE.Group();
  enclosure.name = 'Стены и дверные проёмы интерьера';
  ceiling.name = 'Отдельный потолок 2.3 м';
  furnishings.name = 'Стеллажи и садовый инвентарь';
  interior.add(enclosure, ceiling, furnishings);
  const material = {
    plaster: new THREE.MeshStandardMaterial({ color: '#f5f1e9', roughness: 0.94 }),
    wood: new THREE.MeshStandardMaterial({ color: '#d4b78c', roughness: 0.82 }),
    floor: new THREE.MeshStandardMaterial({ color: '#c7bca2', roughness: 0.88 }),
    door: new THREE.MeshStandardMaterial({ color: '#79634b', roughness: 0.84 }),
    black: new THREE.MeshStandardMaterial({ color: '#303330', roughness: 0.73 }),
    white: new THREE.MeshStandardMaterial({ color: '#e5e2d7', roughness: 0.72 }),
    metal: new THREE.MeshStandardMaterial({ color: '#a4aaa7', metalness: 0.62, roughness: 0.38 }),
    gate: new THREE.MeshStandardMaterial({ color: '#89918d', metalness: 0.18, roughness: 0.7 }),
    red: new THREE.MeshStandardMaterial({ color: '#af433b', roughness: 0.58 }),
    yellow: new THREE.MeshStandardMaterial({ color: '#e2b32b', roughness: 0.54 }),
    green: new THREE.MeshStandardMaterial({ color: '#6e8740', roughness: 0.8 }),
    light: new THREE.MeshStandardMaterial({ color: '#fff8e5', emissive: '#fff2d1', emissiveIntensity: 1.2 }),
    ...overrides,
  };
  function box(name, size, position, mat, parent = furnishings) {
    const geometry = new THREE.BoxGeometry(...size);
    if (mat.map) {
      const uv = geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        const face = Math.floor(i / 4);
        uv.setXY(i, uv.getX(i) * (face < 2 ? size[2] : size[0]),
          uv.getY(i) * (face === 2 || face === 3 ? size[2] : size[1]));
      }
    }
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function tube(name, from, to, radius, mat, parent = furnishings) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const direction = b.clone().sub(a);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 8), mat);
    mesh.name = name;
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function ring(name, radius, thickness, position, mat, parent = furnishings) {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, thickness, 8, 32), mat);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  const h = INTERIOR.height, end = start + d.sectionDepth;
  box('Пол под дерево', [6, 0.06, 4], [3, -0.03, start + 2], material.floor, interior);
  box('Стена со стороны навеса', [6, h, d.wall], [3, h / 2, start + d.wall / 2], material.plaster, enclosure);
  box('Западная стена', [d.wall, h, 4], [d.wall / 2, h / 2, start + 2], material.plaster, enclosure);
  const pier = (4 - d.gateWidth) / 2;
  for (const z of [start + pier / 2, end - pier / 2]) {
    box('Простенок ворот изнутри', [d.wall, h, pier], [6 - d.wall / 2, h / 2, z], material.plaster, enclosure);
  }
  box('Над воротами', [d.wall, h - d.gateHeight, d.gateWidth], [6 - d.wall / 2, (h + d.gateHeight) / 2, start + 2], material.plaster, enclosure);
  box('Внутренняя сторона двустворчатых ворот', [0.055, d.gateHeight, d.gateWidth], [6.01, d.gateHeight / 2, start + 2], material.gate, enclosure);
  for (let y = 0.3; y < d.gateHeight; y += 0.3) {
    box('Шов панели ворот изнутри', [0.006, 0.007, d.gateWidth], [5.978, y, start + 2], material.metal, enclosure);
  }
  box('Стык створок', [0.006, d.gateHeight, 0.008], [5.978, d.gateHeight / 2, start + 2], material.black, enclosure);
  for (const [x, width] of [[d.doorOffset / 2, d.doorOffset], [(d.doorOffset + d.doorWidth + 6) / 2, 6 - d.doorOffset - d.doorWidth]]) {
    box('Стена у обычной двери', [width, h, d.wall], [x, h / 2, end - d.wall / 2], material.plaster, enclosure);
  }
  box('Над обычной дверью', [d.doorWidth, h - 1.9, d.wall], [1.55, (h + 1.9) / 2, end - d.wall / 2], material.plaster, enclosure);
  box('Деревянная дверь изнутри', [d.doorWidth - 0.025, 1.88, 0.045], [1.55, 0.95, end - 0.04], material.door, enclosure);
  for (const x of [1.08, 2.02]) box('Наличник двери', [0.045, 1.95, 0.035], [x, 0.975, end - d.wall - 0.01], material.white, enclosure);
  box('Верхний наличник', [0.985, 0.045, 0.035], [1.55, 1.95, end - d.wall - 0.01], material.white, enclosure);
  tube('Ручка двери изнутри', [1.79, 0.96, end - 0.085], [1.91, 0.96, end - 0.085], 0.014, material.black, enclosure);
  box('Потолок на отдельной отметке', [6, 0.04, 4], [3, h + 0.02, start + 2], material.plaster, ceiling);
  for (const x of [1.8, 4.4]) {
    box('Потолочный светильник', [0.75, 0.035, 0.20], [x, h - 0.025, 7.1], material.light, ceiling);
    const light = new THREE.PointLight('#fff2d9', 8, 7, 2);
    light.position.set(x, h - 0.12, 7.1);
    interior.add(light);
  }
  interior.add(new THREE.AmbientLight('#fff7e7', 0.35));

  function rack(item, parent) {
    const count = item.type === 'bins' ? 3 : Math.ceil(item.width / 0.8);
    for (let i = 0; i <= count; i++) {
      for (const z of [-1, 1]) {
        box('Стойка деревянного стеллажа', [0.045, 1.92, 0.045], [-item.width / 2 + 0.025 + (item.width - 0.05) * i / count, 0.96, z * (item.depth / 2 - 0.025)], material.wood, parent);
      }
    }
    for (const y of [0.1, 0.45, 0.8, 1.15, 1.5, 1.86]) {
      box('Деревянная полка', [item.width - 0.03, 0.035, item.depth - 0.02], [0, y, 0], material.wood, parent);
    }
    if (item.type !== 'bins') return;
    for (let col = 0; col < 3; col++) {
      const x = (col - 1) * (item.width - 0.08) / 3;
      for (let row = 0; row < 5; row++) {
        const y = 0.12 + row * 0.35;
        const mat = col === 1 && row >= 2 ? material.white : material.black;
        const width = (item.width - 0.25) / 3;
        box('Дно ящика', [width, 0.025, 0.45], [x, y, 0], mat, parent);
        for (const side of [-1, 1]) {
          box('Боковина ящика', [0.018, 0.245, 0.45], [x + side * (width / 2 - 0.009), y + 0.125, 0], mat, parent);
          box('Борт ящика', [width, 0.245, 0.018], [x, y + 0.125, side * 0.22], mat, parent);
        }
        box('Кромка ящика', [width + 0.025, 0.025, 0.035], [x, y + 0.25, -0.235], mat, parent);
      }
    }
  }

  function mower(parent, base, folded) {
    box('Жёлтая дека газонокосилки', [0.68, 0.12, 0.49], [0, base + 0.16, 0], material.yellow, parent);
    box('Корпус двигателя', [0.31, 0.15, 0.32], [0.12, base + 0.27, 0], material.black, parent);
    box('Чёрный травосборник', [0.32, 0.28, 0.45], [-0.30, base + 0.23, 0], material.black, parent);
    for (const x of [-0.25, 0.26]) for (const z of [-0.27, 0.27]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.05, 16), material.black);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, base + 0.11, z);
      parent.add(wheel);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.052, 12), material.metal);
      hub.rotation.x = Math.PI / 2;
      hub.position.copy(wheel.position);
      parent.add(hub);
    }
    for (const z of [-0.20, 0.20]) {
      tube('Рукоять газонокосилки', [-0.1, base + 0.27, z], [-0.36, base + (folded ? 0.43 : 1.05), z], 0.018, material.metal, parent);
    }
    tube('Поперечная ручка газонокосилки', [-0.36, base + (folded ? 0.43 : 1.05), -0.22], [-0.36, base + (folded ? 0.43 : 1.05), 0.22], 0.03, material.black, parent);
  }

  for (const item of FURNITURE) {
    const group = new THREE.Group();
    group.name = item.id;
    group.position.set(item.x, 0, item.z);
    group.rotation.y = item.angle;
    furnishings.add(group);
    if (item.type === 'rack' || item.type === 'bins') rack(item, group);
    if (item.type === 'table') {
      box('Стол для двух газонокосилок', [1, 0.055, 0.78], [0, 0.80, 0], material.wood, group);
      for (const x of [-0.45, 0.45]) for (const z of [-0.33, 0.33]) box('Ножка стола', [0.065, 0.78, 0.065], [x, 0.39, z], material.wood, group);
      mower(group, 0.03, true);
      mower(group, 0.83, false);
    }
    if (item.type === 'bike') {
      for (const x of [-0.52, 0.52]) {
        ring('Шина велосипеда', 0.31, 0.022, [x, 0.34, 0], material.black, group);
        ring('Обод велосипеда', 0.285, 0.008, [x, 0.34, 0], material.metal, group);
        const points = [];
        for (let i = 0; i < 16; i++) {
          const angle = i * Math.PI / 8;
          points.push(new THREE.Vector3(x, 0.34, 0), new THREE.Vector3(x + Math.cos(angle) * 0.28, 0.34 + Math.sin(angle) * 0.28, 0));
        }
        group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#b9bfbb' })));
      }
      const rear = [-0.52, 0.34, 0], crank = [-0.05, 0.36, 0], seat = [-0.20, 0.89, 0], head = [0.35, 0.88, 0], front = [0.52, 0.34, 0];
      for (const [a, b] of [[rear, crank], [crank, seat], [seat, rear], [seat, head], [head, crank], [head, front]]) tube('Красная рама велосипеда', a, b, 0.025, material.red, group);
      tube('Подседельная трубка', seat, [-0.20, 1.01, 0], 0.019, material.metal, group);
      box('Седло', [0.26, 0.055, 0.17], [-0.22, 1.02, 0], material.black, group);
      tube('Вынос руля', head, [0.34, 1.16, 0], 0.017, material.metal, group);
      tube('Руль', [0.34, 1.16, -0.24], [0.34, 1.16, 0.24], 0.018, material.metal, group);
      for (const side of [-1, 1]) box('Резиновая ручка велосипеда', [0.10, 0.035, 0.06], [0.34, 1.16, side * 0.23], material.black, group);
      tube('Ось педалей', [-0.05, 0.36, -0.15], [-0.05, 0.36, 0.15], 0.012, material.metal, group);
    }
    if (item.type === 'barrow') {
      box('Дно тачки', [0.48, 0.04, 0.48], [0, 0.48, -0.1], material.metal, group);
      for (const side of [-1, 1]) {
        const sidePanel = box('Борт тачки', [0.035, 0.24, 0.61], [side * 0.28, 0.60, -0.1], material.metal, group);
        sidePanel.rotation.z = -side * 0.20;
        tube('Рама тачки', [side * 0.22, 0.21, -0.25], [side * 0.27, 0.76, 0.42], 0.018, material.metal, group);
        tube('Ножка тачки', [side * 0.22, 0.48, 0.1], [side * 0.25, 0.03, 0.27], 0.018, material.metal, group);
        tube('Ручка тачки', [side * 0.27, 0.76, 0.31], [side * 0.27, 0.76, 0.47], 0.027, material.black, group);
        box('Торцевой борт тачки', [0.53, 0.21, 0.03], [0, 0.59, -0.1 + side * 0.28], material.metal, group);
      }
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.09, 20), material.black);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(0, 0.19, -0.25);
      group.add(wheel);
    }
    if (item.type === 'ladder') {
      for (const z of [-0.28, 0.28]) tube('Стойка стремянки', [0, 0.04, z], [0, 1.95, z], 0.022, material.metal, group);
      for (let y = 0.25; y < 1.8; y += 0.25) box('Ступень стремянки', [0.06, 0.08, 0.52], [0, y, 0], material.black, group);
    }
  }

  // Инструмент расположен на стене, вне прохода.
  for (const [x, head] of [[4.85, 'rake'], [5.1, 'shovel'], [5.56, 'spade']]) {
    tube('Деревянная рукоять инструмента', [x, 0.12, 8.935], [x, 1.50, 8.935], 0.014, material.door);
    if (head === 'rake') {
      box('Грабли', [0.28, 0.035, 0.05], [x, 1.52, 8.935], material.metal);
      for (let i = 0; i < 7; i++) box('Зуб граблей', [0.012, 0.09, 0.02], [x - 0.12 + i * 0.04, 1.47, 8.91], material.metal);
    } else box('Полотно лопаты', [0.16, 0.24, 0.035], [x, 1.47, 8.935], head === 'spade' ? material.red : material.metal);
  }
  for (const radius of [0.12, 0.15, 0.18]) ring('Свёрнутый садовый шланг', radius, 0.014, [5.34, 1.28, 8.92], material.green);
  box('Жёлтый кусторез', [0.13, 0.30, 0.13], [5.86, 1.2, 6.07], material.yellow);
  box('Лезвие кустореза', [0.035, 0.53, 0.055], [5.86, 0.81, 6.07], material.black);
  box('Красная цепная пила', [0.14, 0.19, 0.22], [5.85, 0.95, 5.86], material.red);
  box('Шина цепной пилы', [0.025, 0.37, 0.075], [5.85, 0.67, 5.86], material.metal);
  interior.updateMatrixWorld(true);
  return { interior, enclosure, ceiling, furnishings };
}
