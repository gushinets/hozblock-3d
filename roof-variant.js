import * as THREE from 'three';

export function createRoofProfile(d, { slope, minClearHeight, concealed = false }) {
  if (!Number.isFinite(slope) || slope <= 0 || slope > 0.25
    || !Number.isFinite(minClearHeight) || minClearHeight < 2.3) {
    throw new Error('Некорректный уклон или минимальная чистая высота');
  }
  const end = d.canopyStart + 2 * d.sectionDepth;
  const ceilingAt = z => minClearHeight + slope * (end - z);
  const topAt = z => ceilingAt(z) + d.roof + d.soffit;
  return Object.freeze({
    slope, minClearHeight, concealed, end, ceilingAt, topAt,
    screenTop: Math.ceil((topAt(d.canopyStart - d.overhang) + 0.07) * 100) / 100,
    highEdge: topAt(d.canopyStart - d.overhang),
    lowEdge: topAt(end + d.overhang),
    canopySoffit: ceilingAt(d.canopyStart + d.sectionDepth),
    canopyClearance: ceilingAt(d.canopyStart + d.sectionDepth) - (d.lampDrop - d.soffit),
  });
}

// Вертикальный сдвиг вершин сохраняет горизонтальные проёмы и вертикальную толщину кровли.
function mapMesh(mesh, height) {
  const points = mesh.geometry.attributes.position;
  const inverse = mesh.matrixWorld.clone().invert();
  const point = new THREE.Vector3();
  for (let i = 0; i < points.count; i++) {
    point.fromBufferAttribute(points, i).applyMatrix4(mesh.matrixWorld);
    point.y = height(point);
    point.applyMatrix4(inverse);
    points.setXYZ(i, point.x, point.y, point.z);
  }
  points.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.geometry.computeBoundingBox();
  mesh.geometry.computeBoundingSphere();
}

export function applyBuildingRoof(building, shell, roof, profile, d) {
  building.updateMatrixWorld(true);
  const oldWallTop = d.height - d.roof;
  roof.traverse(mesh => {
    if (!mesh.isMesh) return;
    mapMesh(mesh, p => p.y + profile.topAt(p.z) - d.height);
    mesh.userData.roofSlope = profile.slope;
  });
  shell.traverse(mesh => {
    if (mesh.isMesh) mapMesh(mesh, p => p.y >= oldWallTop - 1e-4 ? profile.topAt(p.z) - d.roof : p.y);
  });
  for (const mesh of building.children) {
    if (!mesh.isMesh) continue;
    if (mesh.name === 'Стойка навеса') {
      mapMesh(mesh, p => p.y >= oldWallTop - 1e-4 ? profile.topAt(p.z) - d.roof : p.y);
    } else if (mesh.geometry.type === 'CylinderGeometry' && mesh.position.y > 2.4) {
      mapMesh(mesh, p => p.y + profile.topAt(p.z) - d.height);
    }
  }
  addDrainage(roof, profile, d);
  if (profile.concealed) addFascia(roof, profile, d);
}

function addFascia(roof, profile, d) {
  const fascia = new THREE.Group();
  fascia.name = 'Съёмная фальшпанель кровли';
  roof.add(fascia);
  const material = new THREE.MeshStandardMaterial({ color: '#3e4549', roughness: 0.48, metalness: 0.35 });
  const capMaterial = new THREE.MeshStandardMaterial({ color: '#343b40', roughness: 0.38, metalness: 0.5 });
  const front = d.canopyStart - d.overhang - 0.02;
  const joint = d.canopyStart + d.sectionDepth;
  const back = profile.end + d.overhang + 0.20;
  const left = -d.overhang - 0.02, right = d.width + d.overhang + 0.02;
  const roomBottom = profile.lowEdge - d.roof - 0.03;
  function panel(name, width, depth, x, z, bottom) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, profile.screenTop - bottom, depth), material);
    mesh.name = name;
    mesh.position.set(x, (profile.screenTop + bottom) / 2, z);
    mesh.castShadow = mesh.receiveShadow = true;
    fascia.add(mesh);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(width + 0.025, 0.02, depth + 0.025), capMaterial);
    cap.name = 'Горизонтальный отлив фальшпанели';
    cap.position.set(x, profile.screenTop - 0.01, z);
    cap.castShadow = cap.receiveShadow = true;
    fascia.add(cap);
  }
  panel('Передняя фальшпанель над въездом', right - left, 0.04, 3, front, profile.canopyClearance);
  panel('Задняя фальшпанель перед жёлобом', right - left, 0.04, 3, back, roomBottom);
  for (const x of [left, right]) {
    panel('Боковая фальшпанель навеса', 0.04, joint - front, x, (joint + front) / 2, profile.canopyClearance);
    panel('Боковая фальшпанель хозблока', 0.04, back - joint, x, (back + joint) / 2, roomBottom);
  }
}

export function applyInteriorRoof(interior, enclosure, ceiling, profile, d) {
  interior.updateMatrixWorld(true);
  const oldCeiling = d.height - d.roof - d.soffit;
  enclosure.traverse(mesh => {
    if (mesh.isMesh) mapMesh(mesh, p => p.y >= oldCeiling - 1e-4 ? profile.ceilingAt(p.z) : p.y);
  });
  ceiling.traverse(mesh => {
    if (mesh.isMesh) mapMesh(mesh, p => p.y + profile.topAt(p.z) - d.height);
  });
  for (const light of interior.children) {
    if (light.isPointLight) light.position.y += profile.topAt(light.position.z) - d.height;
  }
}

function addDrainage(roof, profile, d) {
  const gutter = new THREE.Group();
  gutter.name = 'Водосборный жёлоб';
  roof.add(gutter);
  const material = new THREE.MeshStandardMaterial({ color: '#353f43', metalness: 0.5, roughness: 0.5 });
  const length = d.width + 2 * d.overhang;
  const z = profile.end + d.overhang + 0.075;
  const y = profile.lowEdge - 0.055;
  function part(name, size, position) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = mesh.receiveShadow = true;
    gutter.add(mesh);
    mesh.updateMatrixWorld(true);
    // Жёлоб дополнительно падает на 5 мм/м вправо, к водосточной трубе.
    mapMesh(mesh, p => p.y - 0.005 * (p.x + d.overhang));
  }
  part('Дно жёлоба', [length, 0.012, 0.16], [3, y - 0.05, z]);
  for (const side of [-1, 1]) part('Борт жёлоба', [length, 0.10, 0.012], [3, y, z + side * 0.074]);
  part('Заглушка жёлоба', [0.012, 0.10, 0.16], [-d.overhang, y, z]);
  part('Заглушка жёлоба', [0.012, 0.10, 0.16], [d.width + d.overhang, y, z]);
  const outletY = y - 0.005 * length - 0.05;
  const points = [
    [6.07, outletY + 0.015, z], [6.07, outletY - 0.12, z], [6.34, outletY - 0.24, z],
    [6.34, 0.12, z], [6.34, -0.30, z], [7.0, -0.30, z],
  ].map(p => new THREE.Vector3(...p));
  const path = new THREE.CurvePath();
  for (let i = 1; i < points.length; i++) path.add(new THREE.LineCurve3(points[i - 1], points[i]));
  const pipe = new THREE.Mesh(new THREE.TubeGeometry(path, 80, 0.05, 12, false), material);
  pipe.name = 'Закрытая водосточная труба';
  pipe.castShadow = pipe.receiveShadow = true;
  roof.add(pipe);
  for (const height of [0.5, 1.5, 2.2]) {
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.025), material);
    bracket.name = 'Кронштейн водостока';
    bracket.position.set(6.26, height, z);
    roof.add(bracket);
  }
}
