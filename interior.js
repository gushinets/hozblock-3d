import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DIMENSIONS as d } from './model.js';
import { applyInteriorRoof } from './roof-variant.js';

const start = d.canopyStart + d.sectionDepth;
export const INTERIOR = Object.freeze({
  west: d.wall, east: d.width - d.wall, north: start + d.wall,
  south: start + d.sectionDepth - d.wall, height: d.height - d.roof - d.soffit, eye: 1.6, radius: 0.18,
});

// Планировка уточнена по отметкам Натальи. Мебель и инвентарь остаются эскизными.
export const FURNITURE = [
  { id: 'west', type: 'rack', x: 0.395, z: 7.1, width: 3.76, depth: 0.55, angle: Math.PI / 2 },
  { id: 'north', type: 'rack', x: 2.465, z: 5.495, width: 3.43, depth: 0.55, angle: 0 },
  { id: 'return', type: 'rack', x: 2.38, z: 8.08, width: 1.8, depth: 0.55, angle: Math.PI / 2 },
  { id: 'bins', type: 'bins', x: 3.30, z: 8.70, width: 1.2, depth: 0.56, angle: 0 },
  { id: 'mowers', type: 'table', x: 4.425, z: 8.53, width: 1, depth: 0.90, angle: 0 },
  { id: 'bike', type: 'bike', x: 4.63, z: 5.85, width: 0.70, depth: 1.26, angle: 0 },
  { id: 'barrow', type: 'barrow', x: 5.43, z: 5.64, width: 0.70, depth: 0.80, angle: 0 },
  { id: 'ladder', type: 'ladder', x: 5.30, z: 8.93, width: 0.08, depth: 0.70, angle: Math.PI / 2 },
  { id: 'tools', type: 'tools', x: 5.79, z: 8.40, width: 0.94, depth: 0.17, angle: Math.PI / 2 },
].map(Object.freeze);

export const INSIDE_VIEWS = Object.freeze({
  passage: { x: 3.10, z: 6.45, yaw: Math.PI / 2, pitch: -0.07 },
  shelves: { x: 2.9, z: 6.4, yaw: -1.95, pitch: -0.10 },
  equipment: { x: 4.3, z: 7.05, yaw: 3.05, pitch: -0.15 },
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

export function createInterior(overrides = {}, roofProfile = null) {
  const interior = new THREE.Group();
  interior.name = 'Интерьер по исходным фотографиям';
  const enclosure = new THREE.Group();
  const ceiling = new THREE.Group();
  const furnishings = new THREE.Group();
  enclosure.name = 'Стены и дверные проёмы интерьера';
  ceiling.name = 'Потолок под общей кровлей';
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
    makita: new THREE.MeshStandardMaterial({ color: '#008c95', roughness: 0.54 }),
    greenworks: new THREE.MeshStandardMaterial({ color: '#83c52b', roughness: 0.54 }),
    light: new THREE.MeshStandardMaterial({ color: '#fff8e5', emissive: '#fff2d1', emissiveIntensity: 1.2 }),
    ...overrides,
  };
  function box(name, size, position, mat, parent = furnishings) {
    const isMachine = parent.name === 'Газонокосилка Makita' || parent.name.startsWith('Аэратор-скарификатор');
    const geometry = isMachine ? new RoundedBoxGeometry(...size, 2, Math.min(0.025, Math.min(...size) * 0.18)) : new THREE.BoxGeometry(...size);
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
  box('Подшивка потолка', [6, d.soffit, 4], [3, h + d.soffit / 2, start + 2], material.plaster, ceiling);
  for (const x of [1.8, 4.4]) {
    box('Потолочный светильник', [0.75, 0.035, 0.20], [x, h - 0.025, 7.1], material.light, ceiling);
    const light = new THREE.PointLight('#fff2d9', 8, 7, 2);
    light.position.set(x, h - 0.12, 7.1);
    interior.add(light);
  }
  interior.add(new THREE.AmbientLight('#fff7e7', 0.35));

  function rack(item, parent) {
    const count = item.type === 'bins' ? Math.round(item.width / 0.6) : Math.ceil(item.width / 0.8);
    for (let i = 0; i <= count; i++) {
      for (const z of [-1, 1]) {
        box('Стойка деревянного стеллажа', [0.045, 1.92, 0.045], [-item.width / 2 + 0.025 + (item.width - 0.05) * i / count, 0.96, z * (item.depth / 2 - 0.025)], material.wood, parent);
      }
    }
    for (const y of [0.1, 0.45, 0.8, 1.15, 1.5, 1.86]) {
      box('Деревянная полка', [item.width - 0.03, 0.035, item.depth - 0.02], [0, y, 0], material.wood, parent);
    }
    if (item.type !== 'bins') return;
    for (let col = 0; col < count; col++) {
      const x = (col - (count - 1) / 2) * (item.width - 0.08) / count;
      for (let row = 0; row < 5; row++) {
        const y = 0.12 + row * 0.35;
        const mat = col === 1 && row >= 2 ? material.white : material.black;
        const width = (item.width - 0.25) / count;
        box('Дно ящика', [width, 0.025, 0.45], [x, y, 0], mat, parent);
        for (const side of [-1, 1]) {
          box('Боковина ящика', [0.018, 0.245, 0.45], [x + side * (width / 2 - 0.009), y + 0.125, 0], mat, parent);
          box('Борт ящика', [width, 0.245, 0.018], [x, y + 0.125, side * 0.22], mat, parent);
        }
        box('Кромка ящика', [width + 0.025, 0.025, 0.035], [x, y + 0.25, -0.235], mat, parent);
      }
    }
  }

  function gardenMachine(parent, base, scarifier) {
    const machine = new THREE.Group();
    machine.name = scarifier ? 'Аэратор-скарификатор Greenworks 2515507' : 'Газонокосилка Makita';
    machine.position.y = base;
    // Задняя часть и рукоятки обращены в поперечный проход по оси -Z.
    machine.rotation.y = -Math.PI / 2;
    parent.add(machine);
    const housing = scarifier ? material.greenworks : material.makita;
    box('Дека садовой машины', [scarifier ? 0.48 : 0.68, 0.12, scarifier ? 0.44 : 0.49], [0, 0.16, 0], housing, machine);
    box('Корпус двигателя', [scarifier ? 0.24 : 0.31, scarifier ? 0.24 : 0.15, 0.32], [0.09, scarifier ? 0.31 : 0.27, 0], scarifier ? housing : material.black, machine);
    box('Чёрный травосборник', [0.30, 0.28, scarifier ? 0.38 : 0.45], [-0.28, 0.23, 0], material.black, machine);
    if (scarifier) {
      for (let i = 0; i < 5; i++) {
        box('Вентиляция Greenworks', [0.012, 0.006, 0.23], [0.03 + i * 0.025, 0.433, 0], material.black, machine);
      }
      box('Регулятор глубины Greenworks', [0.075, 0.045, 0.055], [0.17, 0.25, 0.23], material.black, machine);
    }
    for (const x of scarifier ? [-0.18, 0.19] : [-0.25, 0.26]) for (const z of [-0.27, 0.27]) {
      const radius = scarifier ? 0.09 : 0.105;
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.05, 16), material.black);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, 0.11, z);
      machine.add(wheel);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.052, 12), material.metal);
      hub.rotation.x = Math.PI / 2;
      hub.position.copy(wheel.position);
      machine.add(hub);
    }
    // У Makita ручка сложена под столешницей; у верхнего агрегата поднята.
    const handleHeight = scarifier ? 1.05 : 0.43;
    for (const z of [-0.20, 0.20]) {
      tube('Рукоять садовой машины', [-0.1, 0.27, z], [-0.36, handleHeight, z], 0.018, material.black, machine);
      if (scarifier) box('Фиксатор рукояти Greenworks', [0.045, 0.055, 0.04], [-0.20, 0.57, z], housing, machine);
    }
    tube('Поперечная ручка садовой машины', [-0.36, handleHeight, -0.22], [-0.36, handleHeight, 0.22], 0.03, material.black, machine);
  }

  for (const item of FURNITURE) {
    const group = new THREE.Group();
    group.name = item.id;
    group.position.set(item.x, 0, item.z);
    group.rotation.y = item.angle;
    furnishings.add(group);
    if (item.type === 'rack' || item.type === 'bins') rack(item, group);
    if (item.type === 'table') {
      box('Стол для газонокосилки и аэратора', [1, 0.055, 0.78], [0, 0.80, 0], material.wood, group);
      for (const x of [-0.45, 0.45]) for (const z of [-0.33, 0.33]) box('Ножка стола', [0.065, 0.78, 0.065], [x, 0.39, z], material.wood, group);
      gardenMachine(group, 0.03, false);
      gardenMachine(group, 0.83, true);
    }
    if (item.type === 'bike') {
      const bike = new THREE.Group();
      bike.name = 'Велосипед на крюке за переднее колесо';
      bike.position.set(0, 1.25, INTERIOR.north + 0.042 - item.z);
      // Переднее колесо сверху; плоскость колёс перпендикулярна стене.
      bike.rotation.set(0, Math.PI / 2, Math.PI / 2);
      group.add(bike);
      for (const x of [-0.57, 0.57]) {
        ring('Шина велосипеда', 0.31, 0.022, [x, 0.34, 0], material.black, bike);
        ring('Обод велосипеда', 0.285, 0.008, [x, 0.34, 0], material.metal, bike);
        const points = [];
        for (let i = 0; i < 16; i++) {
          const angle = i * Math.PI / 8;
          points.push(new THREE.Vector3(x, 0.34, 0), new THREE.Vector3(x + Math.cos(angle) * 0.28, 0.34 + Math.sin(angle) * 0.28, 0));
        }
        bike.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#b9bfbb' })));
      }
      const rear = [-0.57, 0.34, 0], crank = [-0.05, 0.36, 0], seat = [-0.20, 0.89, 0], head = [0.35, 0.88, 0], front = [0.57, 0.34, 0];
      for (const [a, b] of [[rear, crank], [crank, seat], [seat, rear], [seat, head], [head, crank], [head, front]]) tube('Красная рама велосипеда', a, b, 0.025, material.red, bike);
      tube('Подседельная трубка', seat, [-0.20, 1.01, 0], 0.019, material.metal, bike);
      box('Седло', [0.26, 0.055, 0.17], [-0.22, 1.02, 0], material.black, bike);
      tube('Вынос руля', head, [0.34, 1.16, 0], 0.017, material.metal, bike);
      tube('Руль', [0.34, 1.16, -0.31], [0.34, 1.16, 0.31], 0.018, material.metal, bike);
      for (const side of [-1, 1]) box('Резиновая ручка велосипеда', [0.10, 0.035, 0.06], [0.34, 1.16, side * 0.30], material.black, bike);
      tube('Ось педалей', [-0.05, 0.36, -0.15], [-0.05, 0.36, 0.15], 0.012, material.metal, bike);

      const wall = INTERIOR.north - item.z + 0.002;
      box('Деревянная планка велоподвеса', [0.16, 2.05, 0.035], [0, 1.26, wall + 0.0175], material.wood, group);
      box('Монтажная пластина велокрюка', [0.10, 0.15, 0.025], [0, 2.03, wall + 0.045], material.black, group);
      tube('Крюк переднего колеса', [0, 2.03, wall + 0.055], [0, 2.03, wall + 0.40], 0.015, material.black, group);
      tube('Загиб велокрюка', [0, 2.03, wall + 0.40], [0, 1.90, wall + 0.40], 0.015, material.black, group);
      tube('Защитный конец велокрюка', [0, 1.90, wall + 0.40], [0, 1.90, wall + 0.35], 0.019, material.black, group);
      box('Упор заднего колеса', [0.10, 0.20, 0.035], [0, 0.73, wall + 0.0425], material.black, group);
      for (const y of [0.34, 1.2, 2.2]) {
        tube('Крепёж планки велоподвеса', [0, y, wall + 0.03], [0, y, wall + 0.043], 0.009, material.metal, group);
      }
    }
    if (item.type === 'barrow') {
      // Корыто обращено к стене; колесо внизу, удлинённые рукоятки наверху.
      const barrow = new THREE.Group();
      barrow.name = 'Тачка на настенном подвесе';
      barrow.position.set(0, 0.96, 0.40);
      barrow.rotation.x = -Math.PI / 2;
      // Около 1,30 м от колеса до концов рукояток; ширина корыта около 0,65 м.
      barrow.scale.z = 0.86;
      group.add(barrow);
      box('Дно тачки', [0.48, 0.04, 0.48], [0, 0.48, -0.1], material.metal, barrow);
      for (const side of [-1, 1]) {
        const sidePanel = box('Борт тачки', [0.035, 0.24, 0.61], [side * 0.28, 0.60, -0.1], material.metal, barrow);
        sidePanel.rotation.z = -side * 0.20;
        tube('Рама тачки', [side * 0.22, 0.21, -0.25], [side * 0.27, 0.76, 0.90], 0.018, material.metal, barrow);
        tube('Ножка тачки', [side * 0.22, 0.48, 0.1], [side * 0.25, 0.03, 0.27], 0.018, material.metal, barrow);
        tube('Ручка тачки', [side * 0.27, 0.76, 0.90], [side * 0.27, 0.76, 1.05], 0.027, material.black, barrow);
        box('Торцевой борт тачки', [0.53, 0.21, 0.03], [0, 0.59, -0.1 + side * 0.28], material.metal, barrow);
      }
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.09, 20), material.black);
      wheel.name = 'Колесо подвешенной тачки';
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(0, 0.19, -0.25);
      barrow.add(wheel);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.095, 24), material.metal);
      rim.name = 'Металлический диск колеса тачки';
      rim.rotation.z = Math.PI / 2;
      rim.position.copy(wheel.position);
      rim.castShadow = true;
      barrow.add(rim);
      tube('Ступица колеса тачки', [-0.055, 0.19, -0.25], [0.055, 0.19, -0.25], 0.032, material.black, barrow);

      const wall = INTERIOR.north - item.z + 0.02;
      box('Монтажная доска подвеса', [0.22, 0.92, 0.035], [0, 0.88, wall + 0.0175], material.wood, group);
      box('Нижняя опора тачки', [0.32, 0.04, 0.18], [0, 0.53, wall + 0.09], material.black, group);
      box('Нижний удерживающий бортик', [0.32, 0.08, 0.025], [0, 0.55, wall + 0.17], material.black, group);
      box('Пластина верхнего фиксатора', [0.14, 0.18, 0.025], [0, 1.20, wall + 0.045], material.black, group);
      box('Верхний фиксатор тачки', [0.12, 0.03, 0.14], [0, 1.19, wall + 0.10], material.black, group);
      box('Зацеп верхнего фиксатора', [0.12, 0.08, 0.025], [0, 1.155, wall + 0.16], material.black, group);
      for (const y of [0.48, 1.28]) {
        tube('Крепёж монтажной доски', [0, y, wall + 0.03], [0, y, wall + 0.042], 0.012, material.metal, group);
      }
    }
    if (item.type === 'ladder') {
      for (const z of [-0.28, 0.28]) tube('Стойка стремянки', [0, 0.20, z], [0, 2.11, z], 0.022, material.metal, group);
      for (let y = 0.41; y < 1.96; y += 0.25) box('Ступень стремянки', [0.06, 0.08, 0.52], [0, y, 0], material.black, group);
      for (const y of [0.55, 1.8]) box('Кронштейн лестницы', [0.025, 0.045, 0.66], [-0.025, y, 0], material.black, group);
    }
    if (item.type === 'tools') {
      for (const y of [0.8, 1.65]) box('Рейка стойки садового инструмента', [0.92, 0.065, 0.055], [0, y, 0.04], material.wood, group);
      for (const x of [-0.43, 0.43]) box('Вертикаль стойки садового инструмента', [0.045, 1.62, 0.035], [x, 0.88, 0.05], material.wood, group);
      for (const [x, head] of [[-0.28, 'rake'], [0, 'shovel'], [0.28, 'spade']]) {
        tube('Деревянная рукоять инструмента', [x, 0.12, 0], [x, 1.50, 0], 0.014, material.door, group);
        box('Зажим садового инструмента', [0.065, 0.06, 0.08], [x, 0.8, 0.005], material.black, group);
        if (head === 'rake') {
          box('Грабли', [0.28, 0.035, 0.05], [x, 1.52, 0], material.metal, group);
          for (let i = 0; i < 7; i++) box('Зуб граблей', [0.012, 0.09, 0.02], [x - 0.12 + i * 0.04, 1.47, -0.025], material.metal, group);
        } else box('Полотно лопаты', [0.16, 0.24, 0.035], [x, 1.47, 0], head === 'spade' ? material.red : material.metal, group);
      }
      for (const radius of [0.12, 0.15, 0.18]) ring('Свёрнутый садовый шланг', radius, 0.014, [0, 2.02, -0.04], material.green, group);
    }
  }

  box('Жёлтый кусторез', [0.13, 0.30, 0.13], [5.86, 1.2, 6.07], material.yellow);
  box('Лезвие кустореза', [0.035, 0.53, 0.055], [5.86, 0.81, 6.07], material.black);
  box('Красная цепная пила', [0.14, 0.19, 0.22], [5.85, 0.95, 5.86], material.red);
  box('Шина цепной пилы', [0.025, 0.37, 0.075], [5.85, 0.67, 5.86], material.metal);
  if (roofProfile) applyInteriorRoof(interior, enclosure, ceiling, roofProfile, d);
  interior.updateMatrixWorld(true);
  return { interior, enclosure, ceiling, furnishings };
}
