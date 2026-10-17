import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SITE, DIMENSIONS, createModel, createCar, createSite, setEntranceOpen, updateRoofLoad, setRoofBoxOpening, setCarPose, collisionBoxes } from './model.js';
import { buildManeuver, sampleManeuver, analyzeManeuver, createAccessRoutes, CANOPY_CLEARANCE, SOFFIT_CLEARANCE, OPENING_RESERVE } from './driving.js';

const host = document.getElementById('scene');
const labelsLayer = document.getElementById('dimension-labels');
const accessLabelsLayer = document.getElementById('access-labels');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.98;
renderer.domElement.tabIndex = 0;
renderer.domElement.setAttribute('aria-label', '3D-модель. Перетащите для вращения, колесо для масштаба. Также доступны кнопки управления камерой.');
host.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#e6e9e0');
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 150);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = !matchMedia('(prefers-reduced-motion: reduce)').matches;
controls.dampingFactor = 0.1;
controls.minDistance = 4;
controls.maxDistance = 100;
controls.minPolarAngle = 0.015;
controls.maxPolarAngle = Math.PI / 2 - 0.015;
controls.screenSpacePanning = true;
controls.listenToKeyEvents(renderer.domElement);
controls.target.set(4.1, 0.55, 5.1);

const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
const environment = pmrem.fromScene(room, 0.04);
scene.environment = environment.texture;
scene.environmentIntensity = 0.3;
room.dispose();
pmrem.dispose();
scene.add(new THREE.HemisphereLight('#f7f6ee', '#788171', 1.9));
const sun = new THREE.DirectionalLight('#fff4dc', 3.2);
sun.position.set(2, 13, -7);
sun.target.position.set(3, 0, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -18;
sun.shadow.camera.right = 18;
sun.shadow.camera.top = 18;
sun.shadow.camera.bottom = -18;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 45;
sun.shadow.normalBias = 0.025;
sun.shadow.bias = -0.00015;
scene.add(sun, sun.target);

let seed = 718;
function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
function texture(draw, size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return map;
}

const siding = texture((ctx, size) => {
  ctx.fillStyle = '#f4f0e7';
  ctx.fillRect(0, 0, size, size);
  for (let row = 0; row < 7; row++) {
    const y = row * size / 7;
    ctx.fillStyle = '#bfc2b8';
    ctx.fillRect(0, y, size, 3);
    ctx.fillStyle = '#fffaf0';
    ctx.fillRect(0, y + 2, size, 2);
    for (let i = 0; i < 65; i++) {
      ctx.strokeStyle = `rgba(150,143,125,${random() * 0.05})`;
      const x = random() * size;
      const grainY = y + 5 + random() * (size / 7 - 8);
      ctx.beginPath();ctx.moveTo(x, grainY);ctx.lineTo(x + 20 + random() * 180, grainY);ctx.stroke();
    }
  }
});
const wallMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', map: siding, roughness: 0.84 });
const soffitMaterial = new THREE.MeshStandardMaterial({ color: '#eee7d6', map: siding, roughness: 0.88 });
const { building, roof } = createModel({ wall: wallMaterial, soffit: soffitMaterial });
scene.add(building);
const { site, entranceGate } = createSite();
scene.add(site);

const paving = texture((ctx, size) => {
  ctx.fillStyle = '#969d91';
  ctx.fillRect(0, 0, size, size);
  const w = size / 6;
  const h = size / 12;
  for (let row = 0; row < 12; row++) {
    for (let col = -1; col < 7; col++) {
      const shade = Math.floor(145 + random() * 32);
      const x = (col + (row % 2) / 2) * w;
      const y = row * h;
      ctx.fillStyle = `rgb(${shade + 7},${shade + 8},${shade + 2})`;
      ctx.fillRect(x + 1.7, y + 1.7, w - 3.4, h - 3.4);
      ctx.strokeStyle = '#ffffff22';
      ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
    }
  }
  for (let i = 0; i < 19000; i++) {
    ctx.fillStyle = random() > 0.5 ? '#ffffff0c' : '#2a332813';
    ctx.fillRect(random() * size, random() * size, 1, 1);
  }
}, 1024);
paving.repeat.set(11 / 2.4, 11 / 2.4);
const paverMaterial = new THREE.MeshStandardMaterial({ map: paving, roughness: 0.96 });
const edgeMaterial = new THREE.MeshStandardMaterial({ color: '#a8ada0', roughness: 1 });
const slab = new THREE.Mesh(new THREE.BoxGeometry(11, 0.12, 11), [edgeMaterial, edgeMaterial, paverMaterial, edgeMaterial, edgeMaterial, edgeMaterial]);
slab.position.set(5.5, -0.065, 5.5);
slab.receiveShadow = true;
scene.add(slab);

const grass = texture((ctx, size) => {
  ctx.fillStyle = '#788a59';ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 55000; i++) {
    ctx.fillStyle = random() > 0.5 ? '#d1d4a12b' : '#42553d2c';
    ctx.fillRect(random() * size, random() * size, 1, 2 + random() * 3);
  }
});
grass.repeat.set(7, 7);
const lawn = new THREE.Mesh(new THREE.BoxGeometry(18.8, 0.1, 16.4), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }));
lawn.position.set(7.6, -0.15, 3.9);
lawn.receiveShadow = true;
scene.add(lawn);
const earth = new THREE.Mesh(new THREE.BoxGeometry(18.8, 0.13, 16.4), new THREE.MeshStandardMaterial({ color: '#8b8974', roughness: 1 }));
earth.position.set(7.6, -0.265, 3.9);
earth.castShadow = true;
scene.add(earth);
const street = new THREE.Mesh(new THREE.BoxGeometry(18.8, 0.12, SITE.streetDepth), new THREE.MeshStandardMaterial({ color: '#707873', roughness: 0.98 }));
street.position.set(7.6, -0.065, -SITE.streetDepth / 2);
street.receiveShadow = true;
scene.add(street);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#e6e9e0', roughness: 1 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.335;
floor.receiveShadow = true;
scene.add(floor);

const car = createCar();
scene.add(car);
const accessRoutes = new THREE.Group();
scene.add(accessRoutes);
let entranceOpen = true;
const obstacles = collisionBoxes(building, site);
const routeSelect = document.getElementById('car-position');
const boxToggle = document.getElementById('roof-box');
const lidSelect = document.getElementById('box-opening');
const mountInput = document.getElementById('mount-lift');
const playButton = document.getElementById('drive-play');
const progress = document.getElementById('drive-progress');
const playback = document.querySelector('.playback');
const stageLabel = document.getElementById('drive-stage');
const gearLabel = document.getElementById('drive-gear');
const driveTime = document.getElementById('drive-time');
const driveNote = document.getElementById('drive-note');
let poses, analysis, maxTime = 0, elapsed = 0, playing = false, previousTime = 0;
const decimal = (value, digits = 3) => value.toFixed(digits).replace('.', ',');

function updatePlayback() {
  const hidden = routeSelect.value === 'hidden';
  const blocked = elapsed >= maxTime && maxTime < analysis.duration;
  const finished = elapsed >= maxTime;
  const pose = sampleManeuver(poses, elapsed);
  setCarPose(car, pose);
  car.visible = !hidden;
  const parked = !hidden && !playing && pose.gear === 'P' && maxTime === analysis.duration;
  lidSelect.disabled = !parked || !boxToggle.checked || !!analysis.openingCollision || !mountInput.checkValidity();
  if (lidSelect.disabled && lidSelect.value !== 'closed') {
    lidSelect.value = 'closed';
    setRoofBoxOpening(car, 'closed');
  }
  car.userData.loadOutline.visible = blocked && boxToggle.checked;
  progress.value = elapsed;
  progress.setAttribute('aria-valuetext', `${decimal(elapsed, 1)} секунд. ${pose.stage}`);
  progress.disabled = hidden || !entranceOpen || !mountInput.checkValidity();
  playback.dataset.blocked = String(blocked);
  stageLabel.textContent = hidden ? 'Автомобиль скрыт' : blocked ? 'Стоп перед кровлей' : pose.stage;
  if (parked && lidSelect.value !== 'closed') stageLabel.textContent += lidSelect.value === 'left' ? ' · крышка слева' : ' · крышка справа';
  gearLabel.textContent = pose.gear;
  gearLabel.dataset.gear = pose.gear;
  gearLabel.setAttribute('aria-label', `Передача ${pose.gear}`);
  driveTime.textContent = `${decimal(elapsed, 1)} / ${decimal(analysis.duration, 1)} с`;
  playButton.textContent = playing ? 'Ⅱ Пауза' : finished ? '↻ Повторить' : '▶ Заезд';
  playButton.disabled = hidden || !entranceOpen || !mountInput.checkValidity();
  driveNote.textContent = !entranceOpen ? 'Откройте ворота, чтобы начать заезд.' : analysis.firstHeight >= 0
    ? `Высота ${decimal(analysis.totalHeight)} м: заезд остановится перед препятствием.`
    : parked && boxToggle.checked ? `Крышка: габарит ≤ ${decimal(analysis.openingHeight)} м. Выберите сторону открытия в параметрах.`
      : 'Полный заезд · оливковый — вперёд · песочный — задний ход';
}

function seek(time) {
  elapsed = Math.max(0, Math.min(time, maxTime));
  updatePlayback();
  requestRender();
}

function pause() {
  playing = false;
  previousTime = 0;
  updatePlayback();
}

function rebuildManeuver() {
  if (!mountInput.checkValidity()) {
    mountInput.closest('details').open = true;
    pause();
    mountInput.reportValidity();
    return;
  }
  playing = false;
  previousTime = 0;
  elapsed = 0;
  lidSelect.value = 'closed';
  poses = buildManeuver(routeSelect.value === 'outside' ? 'outside' : 'canopy');
  const mountLift = mountInput.valueAsNumber / 1000;
  updateRoofLoad(car, boxToggle.checked, mountLift);
  analysis = analyzeManeuver(poses, obstacles, { box: boxToggle.checked, mountLift });
  const collisions = [analysis.firstPlan, analysis.firstHeight].filter(index => index >= 0);
  // Останавливаемся за 0,1 с до первого возможного касания габаритного прямоугольника.
  maxTime = collisions.length ? Math.max(0, poses[Math.max(0, Math.min(...collisions) - 1)].time - 0.1) : analysis.duration;
  progress.max = Math.ceil(analysis.duration * 1000) / 1000;
  accessRoutes.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
  accessRoutes.clear();
  accessRoutes.add(createAccessRoutes(poses));
  const heightFits = analysis.clearance >= 0;
  const openingFits = !boxToggle.checked || (analysis.openingClearance >= OPENING_RESERVE && !analysis.openingCollision);
  const outside = routeSelect.value === 'outside';
  document.getElementById('fit-summary').dataset.fit = String(analysis.firstPlan < 0 && (outside || (heightFits && openingFits)));
  document.getElementById('fit-verdict').textContent = analysis.firstPlan >= 0 ? 'Маршрут пересекает препятствие' : outside
    ? 'Заезд на площадку проходит' : !heightFits ? 'Под навес не проходит' : !openingFits ? 'Заезд проходит · для крышки нет запаса'
      : boxToggle.checked ? 'Заезд и открывание бокса проходят' : 'Без бокса под навес проходит';
  document.getElementById('height-result').textContent = `${outside ? 'Под навесом: высота' : 'Высота'} ${decimal(analysis.totalHeight)} м · мин. просвет ${decimal(CANOPY_CLEARANCE)} м. `
    + (heightFits ? `Запас ${Math.round(analysis.clearance * 1000)} мм.` : `Не хватает ${Math.round(-analysis.clearance * 1000)} мм.`);
  const openingResult = document.getElementById('opening-result');
  openingResult.hidden = !boxToggle.checked;
  openingResult.textContent = !boxToggle.checked ? '' : analysis.openingCollision ? `Габарит открывания пересекает: ${analysis.openingCollision}.`
    : `Крышка с любой стороны: расчётный габарит ≤ ${decimal(analysis.openingHeight)} м; запас ${Math.round(analysis.openingClearance * 1000)} мм. Заложено ≥ ${OPENING_RESERVE * 1000} мм.`;
  document.getElementById('roof-height').textContent = decimal(DIMENSIONS.height, 2);
  document.getElementById('soffit-height').textContent = decimal(SOFFIT_CLEARANCE);
  document.getElementById('clear-height').textContent = decimal(CANOPY_CLEARANCE);
  document.getElementById('plan-result').textContent = `На всём маршруте: до препятствий ≥ ${Math.round(analysis.minObstacle * 100)} см, до края покрытия ≥ ${Math.round(analysis.minSurface * 100)} см. По эскизным размерам.`;
  updateAccess();
  updatePlayback();
}

const accessLabels = [
  { text: 'Въезд ≈ 5,1 м', position: new THREE.Vector3(8.45, 2.3, 0) },
  { text: 'Улица', position: new THREE.Vector3(3, 0.12, -2.5) },
].map(label => {
  const element = document.createElement('span');
  element.className = 'access-label';
  element.textContent = label.text;
  accessLabelsLayer.append(element);
  return { element, position: label.position };
});

const dimensions = new THREE.Group();
dimensions.visible = false;
scene.add(dimensions);
const dimensionLabels = [];
const dimensionMaterial = new THREE.LineBasicMaterial({ color: '#5d704c', depthTest: false, transparent: true, opacity: 0.85 });
function dimension(from, to, text, labelPosition, tick) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const t = new THREE.Vector3(...tick);
  const points = [a, b, a.clone().sub(t), a.clone().add(t), b.clone().sub(t), b.clone().add(t)];
  const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), dimensionMaterial);
  line.renderOrder = 5;
  dimensions.add(line);
  const label = document.createElement('span');
  label.className = 'dimension-label';
  label.textContent = text;
  labelsLayer.append(label);
  dimensionLabels.push({ element: label, position: new THREE.Vector3(...labelPosition) });
}
dimension([0, 0.045, 9.65], [6, 0.045, 9.65], '6 м', [3, 0.1, 9.65], [0, 0, 0.12]);
dimension([-0.5, 0.045, 1.1], [-0.5, 0.045, 9.1], '8 м', [-0.5, 0.1, 5.1], [0.12, 0, 0]);
dimension([6.42, 0.045, 1.1], [6.42, 0.045, 5.1], 'Навес · 4 м', [6.42, 0.1, 3.1], [0.12, 0, 0]);
dimension([6.42, 0.045, 5.1], [6.42, 0.045, 9.1], 'Хозблок · 4 м', [6.42, 0.1, 7.1], [0.12, 0, 0]);
dimension([6.65, 0, 9.25], [6.65, DIMENSIONS.height, 9.25], `${decimal(DIMENSIONS.height, 2)} м`, [6.65, DIMENSIONS.height / 2, 9.25], [0.13, 0, 0]);
dimension([6.28, 0, 1.5], [6.28, CANOPY_CLEARANCE, 1.5], `Мин. просвет · ${decimal(CANOPY_CLEARANCE)} м`, [6.28, CANOPY_CLEARANCE / 2, 1.5], [0, 0, 0.13]);
dimension([0, -0.04, 11.35], [11, -0.04, 11.35], 'Площадка · 11 м', [5.5, 0, 11.35], [0, 0, 0.12]);
dimension([SITE.gateStart, 0.08, -0.6], [SITE.gateEnd, 0.08, -0.6], 'Въезд ≈ 5,1 м', [8.45, 0.1, -0.6], [0, 0, 0.14]);
dimension([SITE.west, 0.08, -0.6], [SITE.gateStart, 0.08, -0.6], 'Забор · 7 м', [2.4, 0.1, -0.6], [0, 0, 0.14]);
labelsLayer.hidden = true;

function positionLabels(labels) {
  const { clientWidth: width, clientHeight: height } = host;
  for (const label of labels) {
    const point = label.position.clone().project(camera);
    label.element.style.left = `${(point.x * 0.5 + 0.5) * width}px`;
    label.element.style.top = `${(-point.y * 0.5 + 0.5) * height}px`;
    label.element.hidden = point.z < -1 || point.z > 1;
  }
}
let frame = 0;
function requestRender() {
  if (frame) return;
  frame = requestAnimationFrame(timestamp => {
    frame = 0;
    if (playing) {
      if (previousTime) elapsed = Math.min(maxTime, elapsed + Math.min((timestamp - previousTime) / 1000, 0.1));
      previousTime = timestamp;
      if (elapsed >= maxTime) { playing = false; previousTime = 0; }
      updatePlayback();
      if (!playing) document.getElementById('view-status').textContent = maxTime < analysis.duration ? 'Автомобиль остановлен перед кровлей: бокс выше просвета.' : 'Манёвр завершён.';
    }
    controls.update();
    renderer.render(scene, camera);
    if (dimensions.visible) positionLabels(dimensionLabels);
    if (!accessLabelsLayer.hidden) positionLabels(accessLabels);
    if (playing) requestRender();
  });
}
controls.addEventListener('change', requestRender);

function markView(name) {
  document.querySelectorAll('[data-view]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.view === name));
  });
}
const views = {
  perspective: [1.2, 0.8, -0.95],
  entrance: [0.65, 1.3, -1],
  front: [1, 0.24, 0],
  top: [0, 1, 0.001],
  back: [-1, 0.6, 0.8],
  clearance: [1, 0.15, 0],
};
function applyView(name) {
  controls.reset();
  const wholeSite = ['perspective', 'entrance', 'top'].includes(name);
  const closeView = name === 'clearance';
  controls.target.set(closeView ? 3.5 : wholeSite ? 5.9 : 4.1, closeView ? 1.55 : 0.55, closeView ? 2.6 : wholeSite ? 3.9 : 5.1);
  const distance = (closeView ? 9 : 23) / Math.min(camera.aspect, 1.35);
  const direction = new THREE.Vector3(...views[name]).normalize();
  camera.position.copy(controls.target).add(direction.clone().multiplyScalar(distance));
  // Общие ракурсы включают улицу и место отката; фасадные приближают хозблок.
  const corners = [];
  for (const x of closeView ? [0, 10.2] : wholeSite ? [-1.8, 17] : [-1.6, 11.6]) {
    for (const z of closeView ? [0.9, 5.1] : wholeSite ? [-4.3, 12.1] : [-1.1, 12.1]) corners.push(new THREE.Vector3(x, -0.33, z));
  }
  for (const x of [-0.15, 6.15]) for (const z of closeView ? [0.95, 5.1] : [0.95, 9.25]) corners.push(new THREE.Vector3(x, DIMENSIONS.height, z));
  if (wholeSite) {
    for (const [x, z] of [[SITE.west, 0], [SITE.eastEnd, 0], [SITE.west, SITE.southEnd]]) {
      corners.push(new THREE.Vector3(x, SITE.height, z));
    }
  }
  for (let step = 0; step < 24; step++) {
    camera.lookAt(controls.target);
    camera.updateMatrixWorld();
    if (corners.every(corner => {
      const point = corner.clone().project(camera);
      return Math.abs(point.x) < 0.87 && point.y < 0.82 && point.y > -0.88;
    })) break;
    camera.position.copy(controls.target).add(direction.clone().multiplyScalar(distance * 1.06 ** (step + 1)));
  }
  controls.update();
  markView(name);
  const button = document.querySelector(`[data-view="${name}"]`);
  document.getElementById('view-status').textContent = button.textContent;
  requestRender();
}
controls.addEventListener('start', () => markView('custom'));
document.querySelectorAll('[data-view]').forEach(button => {
  button.addEventListener('click', () => applyView(button.dataset.view));
});

function zoom(factor) {
  const offset = camera.position.clone().sub(controls.target);
  const distance = THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance);
  camera.position.copy(controls.target).add(offset.setLength(distance));
  controls.update();
  markView('custom');
  requestRender();
}
function orbit(theta, phi = 0) {
  const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  spherical.theta += theta;
  spherical.phi = THREE.MathUtils.clamp(spherical.phi + phi, controls.minPolarAngle, controls.maxPolarAngle);
  camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
  controls.update();
  markView('custom');
  requestRender();
}
document.getElementById('zoom-in').addEventListener('click', () => zoom(0.8));
document.getElementById('zoom-out').addEventListener('click', () => zoom(1.25));
document.getElementById('rotate-left').addEventListener('click', () => orbit(-Math.PI / 8));
document.getElementById('rotate-right').addEventListener('click', () => orbit(Math.PI / 8));
document.getElementById('tilt-up').addEventListener('click', () => orbit(0, -0.16));
document.getElementById('tilt-down').addEventListener('click', () => orbit(0, 0.16));
document.getElementById('reset').addEventListener('click', () => applyView('perspective'));
document.getElementById('dimensions').addEventListener('change', event => {
  dimensions.visible = event.target.checked;
  labelsLayer.hidden = !event.target.checked;
  requestRender();
});
routeSelect.addEventListener('change', rebuildManeuver);
boxToggle.addEventListener('change', rebuildManeuver);
lidSelect.addEventListener('change', () => {
  setRoofBoxOpening(car, lidSelect.value);
  updatePlayback();
  requestRender();
  if (matchMedia('(max-width: 760px)').matches) document.getElementById('viewer').scrollIntoView({ block: 'start' });
});
mountInput.addEventListener('input', () => {
  mountInput.setAttribute('aria-invalid', String(!mountInput.checkValidity()));
  if (mountInput.checkValidity()) rebuildManeuver();
  else pause();
});
mountInput.addEventListener('change', () => mountInput.reportValidity());
playButton.addEventListener('click', () => {
  if (playing) pause();
  else {
    if (elapsed >= maxTime) elapsed = 0;
    playing = true;
    previousTime = 0;
    updatePlayback();
  }
  requestRender();
});
document.getElementById('drive-reset').addEventListener('click', () => { pause(); seek(0); });
progress.addEventListener('input', () => { const time = progress.valueAsNumber; pause(); seek(time); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
document.getElementById('roof-cutaway').addEventListener('change', event => { roof.visible = !event.target.checked; requestRender(); });
function updateAccess() {
  setEntranceOpen(entranceGate, entranceOpen);
  const showRoutes = document.getElementById('access-routes').checked;
  accessRoutes.visible = entranceOpen && showRoutes;
  accessLabelsLayer.hidden = !showRoutes;
  document.getElementById('entrance-gate').textContent = entranceOpen ? 'Закрыть въездные ворота' : 'Открыть въездные ворота';
  document.getElementById('access-note').textContent = entranceOpen ? 'Въезд вперёд · под навес задним ходом' : 'Въезд закрыт · откройте ворота для заезда';
  requestRender();
}
document.getElementById('entrance-gate').addEventListener('click', () => {
  pause();
  seek(0);
  entranceOpen = !entranceOpen;
  updateAccess();
  updatePlayback();
});
document.getElementById('access-routes').addEventListener('change', updateAccess);
renderer.domElement.addEventListener('keydown', event => {
  if (event.key === '+' || event.key === '=') zoom(0.8);
  if (event.key === '-') zoom(1.25);
  if (event.key === 'Home') applyView('perspective');
});
renderer.domElement.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  pause();
  const message = document.getElementById('loading');
  message.hidden = false;
  message.textContent = 'Браузер приостановил 3D-сцену. Обновите страницу, чтобы восстановить просмотр.';
  message.setAttribute('role', 'alert');
});

document.querySelector('.specifications').open = false;
rebuildManeuver();
let fitted = false;
new ResizeObserver(() => {
  if (!host.clientWidth || !host.clientHeight) return;
  camera.aspect = host.clientWidth / host.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(host.clientWidth, host.clientHeight);
  if (!fitted) { fitted = true; applyView('perspective'); controls.saveState(); }
  else {
    const selected = document.querySelector('[data-view][aria-pressed="true"]');
    if (selected) applyView(selected.dataset.view);
  }
  requestRender();
}).observe(host);
requestRender();
document.getElementById('loading').hidden = true;
host.dataset.ready = 'true';
