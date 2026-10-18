import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createLandscape } from './landscape.js';
import { createReviewer } from './review.js';
import { SITE, DIMENSIONS, createModel, createCar, createSite, setEntranceOpen, updateRoofLoad, setRoofBoxOpening, setCarPose, collisionBoxes } from './model.js';
import { buildManeuver, sampleManeuver, analyzeManeuver, createAccessRoutes, CANOPY_CLEARANCE, SOFFIT_CLEARANCE, OPENING_RESERVE } from './driving.js';
import { INTERIOR, INSIDE_VIEWS, createInterior, moveInside, canStandInside } from './interior.js';

let insideMode = false, planMode = false;
let walker = { ...INSIDE_VIEWS.passage };
const heldKeys = new Set();
let walkTick = 0, drag = null;
let review = null;

const host = document.getElementById('scene');
const labelsLayer = document.getElementById('dimension-labels');
const accessLabelsLayer = document.getElementById('access-labels');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.domElement.tabIndex = 0;
renderer.domElement.setAttribute('aria-label', '3D-модель. Перетащите для вращения, колесо для масштаба. Также доступны кнопки управления камерой.');
host.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#b6bec1');
scene.fog = new THREE.Fog('#b6bec1', 32, 95);
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
scene.environmentIntensity = 0.45;
room.dispose();
pmrem.dispose();
const skyLight = new THREE.HemisphereLight('#e8eef4', '#68705b', 1.1);
scene.add(skyLight);
const sun = new THREE.DirectionalLight('#fff5e4', 2.1);
sun.position.set(-5, 16, -8);
sun.target.position.set(3, 0, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.radius = 5;
sun.shadow.camera.left = -18;
sun.shadow.camera.right = 18;
sun.shadow.camera.top = 18;
sun.shadow.camera.bottom = -18;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 45;
sun.shadow.normalBias = 0.025;
sun.shadow.bias = -0.00015;
scene.add(sun, sun.target);
const composer = new EffectComposer(renderer);
composer.renderTarget1.samples = 4;
composer.renderTarget2.samples = 4;
composer.addPass(new RenderPass(scene, camera));
const ambientOcclusion = new SSAOPass(scene, camera, 1, 1, 16);
ambientOcclusion.kernelRadius = 6;
ambientOcclusion.minDistance = 0.001;
ambientOcclusion.maxDistance = 0.025;
composer.addPass(ambientOcclusion);
composer.addPass(new OutputPass());

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
  ctx.fillStyle = '#c9c5b9';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 65000; i++) {
    const shade = Math.floor(130 + random() * 100);
    ctx.fillStyle = `rgba(${shade},${shade - 3},${shade - 9},0.14)`;
    ctx.fillRect(random() * size, random() * size, 0.6 + random() * 2, 0.6 + random() * 2);
  }
}, 1024);
const surfaceGrain = texture((ctx, size) => {
  ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 42000; i++) {
    ctx.fillStyle = random() > 0.5 ? '#ffffff20' : '#00000020';
    ctx.fillRect(random() * size, random() * size, 1, 1);
  }
});
surfaceGrain.colorSpace = THREE.NoColorSpace;
surfaceGrain.repeat.set(6, 6);
const wallMaterial = new THREE.MeshStandardMaterial({ map: siding, bumpMap: surfaceGrain, bumpScale: 0.004, roughness: 0.94 });
const soffitMaterial = new THREE.MeshStandardMaterial({ color: '#b6b1a4', bumpMap: surfaceGrain, bumpScale: 0.002, roughness: 0.85 });
const monoRoof = new URLSearchParams(location.search).get('roof') === 'mono';
const { building, roof, profile } = createModel({ wall: wallMaterial, soffit: soffitMaterial,
  dark: new THREE.MeshStandardMaterial({ color: '#252a2c', metalness: 0.3, roughness: 0.4, bumpMap: surfaceGrain, bumpScale: 0.001 }),
  roof: new THREE.MeshStandardMaterial({ color: '#555a59', roughness: 0.88, bumpMap: surfaceGrain, bumpScale: 0.0015 }) },
  monoRoof ? { slope: 0.03, minClearHeight: 2.3, concealed: true } : null);
const fascia = roof.getObjectByName('Съёмная фальшпанель кровли');
document.getElementById('fascia-row').hidden = !fascia;
document.getElementById('fascia-cutaway').addEventListener('change', event => {
  if (fascia) fascia.visible = !event.target.checked;
  requestRender();
});
const canopyClearance = profile?.canopyClearance ?? CANOPY_CLEARANCE;
const soffitClearance = profile?.canopySoffit ?? SOFFIT_CLEARANCE;
const interiorHeight = profile?.minClearHeight ?? INTERIOR.height;
const roofHeight = profile?.highEdge ?? DIMENSIONS.height;
const silhouetteHeight = profile?.screenTop ?? roofHeight;
document.getElementById('roof-profile-panel').hidden = !monoRoof;
document.getElementById(monoRoof ? 'roof-mono-link' : 'roof-flat-link').setAttribute('aria-current', 'page');
if (profile) {
  document.title = 'Скрытый скат — хозблок с навесом';
  document.getElementById('roof-clearance-note').textContent = 'Эскиз: уклон 3% от навеса к задней стене, под мембранное или рулонное покрытие. Верхний край 2,79 м, низкий 2,54 м; чистый потолок внутри от 2,30 до 2,42 м. Расчётный просвет навеса с резервом на светильники — 2,401 м. Толщина конструкции условная. Скрытие кровли влияет только на изображение.';
  document.getElementById('lid-note').textContent = 'Под этой кровлей бокс остаётся закрытым. Двустороннее открывание доступно после парковки на открытой площадке. Геометрия механизма и креплений пока эскизная.';
}
scene.add(building);
for (const z of [5.65, 8.55]) {
  for (const direction of [-1, 1]) {
    const light = new THREE.SpotLight('#ffe0ab', 9, 1.7, 0.48, 0.7, 2);
    light.position.set(6.14, 1.55 + direction * 0.1, z);
    light.target.position.set(6.005, 1.55 + direction * 1.0, z);
    building.add(light, light.target);
  }
}
const { site, entranceGate } = createSite();
scene.add(site);
const landscape = createLandscape(texture, random);
scene.add(landscape);

const paving = texture((ctx, size) => {
  ctx.fillStyle = '#555c60';
  ctx.fillRect(0, 0, size, size);
  const w = size / 12;
  const h = size / 24;
  for (let row = 0; row < 24; row++) {
    for (let col = -1; col < 13; col++) {
      const shade = Math.floor(105 + random() * 28);
      const x = (col + (row % 2) / 2) * w;
      const y = row * h;
      ctx.fillStyle = `rgb(${shade},${shade + 2},${shade + 3})`;
      ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
      ctx.strokeStyle = '#ffffff16';
      ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
    }
  }
  for (let i = 0; i < 19000; i++) {
    ctx.fillStyle = random() > 0.5 ? '#ffffff0c' : '#2a332813';
    ctx.fillRect(random() * size, random() * size, 1, 1);
  }
}, 1024);
paving.repeat.set(11 / 3.6, 11 / 3.6);
const paverMaterial = new THREE.MeshStandardMaterial({ map: paving, bumpMap: paving, bumpScale: 0.012, roughness: 0.94 });
const edgeMaterial = new THREE.MeshStandardMaterial({ color: '#777d7d', roughness: 1 });
const slab = new THREE.Mesh(new THREE.BoxGeometry(11, 0.12, 11), [edgeMaterial, edgeMaterial, paverMaterial, edgeMaterial, edgeMaterial, edgeMaterial]);
slab.position.set(5.5, -0.065, 5.5);
slab.receiveShadow = true;
scene.add(slab);

const grass = texture((ctx, size) => {
  ctx.fillStyle = '#697347';ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 85000; i++) {
    ctx.fillStyle = ['#9b9e5945', '#45542e60', '#a8a46b35', '#3d552e45'][i % 4];
    ctx.fillRect(random() * size, random() * size, 1, 1 + random() * 4);
  }
});
grass.repeat.set(40, 40);
const lawn = new THREE.Mesh(new THREE.BoxGeometry(150, 0.1, 150), new THREE.MeshStandardMaterial({ map: grass, bumpMap: grass, bumpScale: 0.018, roughness: 1 }));
lawn.position.set(7.6, -0.15, 3.9);
lawn.receiveShadow = true;
scene.add(lawn);
const earth = new THREE.Mesh(new THREE.BoxGeometry(18.8, 0.13, 16.4), new THREE.MeshStandardMaterial({ color: '#8b8974', roughness: 1 }));
earth.position.set(7.6, -0.265, 3.9);
earth.castShadow = true;
scene.add(earth);
const asphalt = texture((ctx, size) => {
  ctx.fillStyle = '#50565a'; ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 65000; i++) {
    ctx.fillStyle = random() > 0.5 ? '#f6f4e22b' : '#17201930';
    const grain = 0.5 + random() * 1.8;
    ctx.fillRect(random() * size, random() * size, grain, grain);
  }
});
asphalt.repeat.set(8, 2);
const street = new THREE.Mesh(new THREE.BoxGeometry(150, 0.12, SITE.streetDepth), new THREE.MeshStandardMaterial({ map: asphalt, bumpMap: asphalt, bumpScale: 0.006, roughness: 0.98 }));
street.position.set(7.6, -0.065, -SITE.streetDepth / 2);
street.receiveShadow = true;
scene.add(street);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#787d69', roughness: 1 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.335;
floor.receiveShadow = true;
scene.add(floor);

const pine = texture((ctx, size) => {
  ctx.fillStyle = '#d9bf95';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    const y = random() * size;
    ctx.strokeStyle = `rgba(111,77,37,${0.025 + random() * 0.085})`;
    ctx.lineWidth = 0.4 + random();
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(size * 0.3, y + random() * 5, size * 0.7, y - random() * 5, size, y + 2);
    ctx.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const x = random() * size, y = random() * size;
    ctx.strokeStyle = '#97744832';
    ctx.beginPath();ctx.ellipse(x, y, 9 + random() * 12, 2.5, 0, 0, Math.PI * 2);ctx.stroke();
  }
});
const oakFloor = texture((ctx, size) => {
  const rowHeight = size / 8;
  for (let row = 0; row < 8; row++) {
    for (let col = -1; col < 3; col++) {
      const x = (col / 2 + (row % 2) / 4) * size, y = row * rowHeight;
      const shade = Math.floor(random() * 20);
      ctx.fillStyle = `rgb(${190 + shade},${180 + shade},${157 + shade})`;
      ctx.fillRect(x, y, size / 2, rowHeight);
      ctx.strokeStyle = '#8e847252';ctx.lineWidth = 1.4;
      ctx.strokeRect(x + 0.5, y + 0.5, size / 2 - 1, rowHeight - 1);
      for (let i = 0; i < 60; i++) {
        const grainY = y + random() * rowHeight;
        ctx.strokeStyle = random() > 0.5 ? '#ffffff18' : '#75624416';
        ctx.beginPath();ctx.moveTo(x + 3, grainY);
        ctx.bezierCurveTo(x + size / 6, grainY + 4, x + size / 3, grainY - 4, x + size / 2 - 3, grainY);ctx.stroke();
      }
    }
  }
}, 1024);
const { interior, enclosure, ceiling } = createInterior({
  wood: new THREE.MeshStandardMaterial({ map: pine, bumpMap: pine, bumpScale: 0.0025, roughness: 0.78 }),
  floor: new THREE.MeshStandardMaterial({ map: oakFloor, bumpMap: oakFloor, bumpScale: 0.003, roughness: 0.76 }),
  door: new THREE.MeshStandardMaterial({ map: pine, color: '#79634b', bumpMap: pine, bumpScale: 0.002, roughness: 0.8 }),
  plaster: new THREE.MeshStandardMaterial({ color: '#f1eee6', bumpMap: surfaceGrain, bumpScale: 0.0015, roughness: 0.94 }),
  gate: new THREE.MeshStandardMaterial({ color: '#838b87', metalness: 0.3, roughness: 0.5, bumpMap: surfaceGrain, bumpScale: 0.001 }),
}, profile);
interior.visible = false;
scene.add(interior);

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
  car.visible = !hidden && !insideMode;
  const parked = !hidden && !playing && pose.gear === 'P' && maxTime === analysis.duration;
  const lidFits = !analysis.openingCollision && (routeSelect.value === 'outside' || analysis.openingClearance >= OPENING_RESERVE);
  lidSelect.disabled = !parked || !boxToggle.checked || !lidFits || !mountInput.checkValidity();
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
    : parked && boxToggle.checked ? lidFits ? 'Припаркован. Крышку можно открыть в параметрах.' : 'Полный заезд завершён · под навесом бокс остаётся закрытым.'
      : `${boxToggle.checked ? 'Заезд с закрытым боксом' : 'Полный заезд'} · оливковый — вперёд · песочный — задний ход`;
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
  analysis = analyzeManeuver(poses, obstacles, { box: boxToggle.checked, mountLift, canopyClearance });
  const collisions = [analysis.firstPlan, analysis.firstHeight].filter(index => index >= 0);
  // Останавливаемся за 0,1 с до первого возможного касания габаритного прямоугольника.
  maxTime = collisions.length ? Math.max(0, poses[Math.max(0, Math.min(...collisions) - 1)].time - 0.1) : analysis.duration;
  progress.max = Math.ceil(analysis.duration * 1000) / 1000;
  accessRoutes.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
  accessRoutes.clear();
  accessRoutes.add(createAccessRoutes(poses));
  const heightFits = analysis.clearance >= 0;
  const outside = routeSelect.value === 'outside';
  const openingFits = !analysis.openingCollision && (outside || analysis.openingClearance >= OPENING_RESERVE);
  document.getElementById('fit-summary').dataset.fit = String(analysis.firstPlan < 0 && analysis.firstHeight < 0 && (outside || heightFits));
  document.getElementById('fit-verdict').textContent = analysis.firstPlan >= 0 ? 'Маршрут пересекает препятствие'
    : analysis.firstHeight >= 0 ? 'Заезд остановится перед препятствием' : outside
    ? 'Заезд на площадку проходит' : !heightFits ? 'Под навес не проходит'
      : boxToggle.checked ? 'Monjaro с закрытым боксом проходит' : 'Без бокса под навес проходит';
  document.getElementById('height-result').textContent = `${outside ? 'Под навесом: высота' : 'Высота'} ${decimal(analysis.totalHeight)} м · расчётный просвет ${decimal(canopyClearance)} м. `
    + (heightFits ? `Запас ${Math.round(analysis.clearance * 1000)} мм.` : `Не хватает ${Math.round(-analysis.clearance * 1000)} мм.`);
  const openingResult = document.getElementById('opening-result');
  openingResult.hidden = !boxToggle.checked;
  openingResult.textContent = !boxToggle.checked ? '' : !openingFits
    ? 'Под навесом бокс остаётся закрытым: для открывания высоты не хватает.'
    : outside ? 'На открытой стоянке крышку можно открыть после парковки.'
      : `Открывание проходит с рабочим запасом ≥ ${OPENING_RESERVE * 1000} мм.`;
  document.getElementById('roof-height').textContent = decimal(roofHeight, 2);
  document.getElementById('soffit-height').textContent = decimal(soffitClearance);
  document.getElementById('clear-height').textContent = decimal(canopyClearance);
  document.getElementById('interior-height').textContent = decimal(interiorHeight);
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
const lowRoof = profile?.lowEdge ?? roofHeight;
dimension([6.65, 0, 9.25], [6.65, lowRoof, 9.25], `${decimal(lowRoof, 2)} м`, [6.65, lowRoof / 2, 9.25], [0.13, 0, 0]);
if (profile) dimension([6.65, 0, 0.95], [6.65, roofHeight, 0.95], `Верх · ${decimal(roofHeight, 2)} м`, [6.65, roofHeight / 2, 0.95], [0.13, 0, 0]);
dimension([6.28, 0, 1.5], [6.28, canopyClearance, 1.5], `Просвет · ${decimal(canopyClearance)} м`, [6.28, canopyClearance / 2, 1.5], [0, 0, 0.13]);
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
    const walking = insideMode && !planMode && heldKeys.size > 0;
    if (walking) {
      const dt = walkTick ? Math.min((timestamp - walkTick) / 1000, 0.05) : 1 / 60;
      walkTick = timestamp;
      const forward = Number(heldKeys.has('KeyW') || heldKeys.has('ArrowUp')) - Number(heldKeys.has('KeyS') || heldKeys.has('ArrowDown'));
      const right = Number(heldKeys.has('KeyD') || heldKeys.has('ArrowRight')) - Number(heldKeys.has('KeyA') || heldKeys.has('ArrowLeft'));
      stepInside(forward, right, dt * 1.1);
    } else walkTick = 0;
    if (controls.enabled) controls.update();
    composer.render();
    review?.update();
    if (dimensions.visible) positionLabels(dimensionLabels);
    if (!accessLabelsLayer.hidden) positionLabels(accessLabels);
    if (playing || walking) requestRender();
  });
}
controls.addEventListener('change', requestRender);

function markView(name) {
  document.querySelectorAll('[data-view]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.view === name));
  });
}
const views = {
  render: [1, 0.42, -0.42],
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
  const distance = (closeView ? 9 : name === 'render' ? 17 : 23) / Math.min(camera.aspect, 1.35);
  const direction = new THREE.Vector3(...views[name]).normalize();
  camera.position.copy(controls.target).add(direction.clone().multiplyScalar(distance));
  // Общие ракурсы включают улицу и место отката; фасадные приближают хозблок.
  const corners = [];
  for (const x of name === 'render' ? [-0.4, 7] : closeView ? [0, 10.2] : wholeSite ? [-1.8, 17] : [-1.6, 11.6]) {
    for (const z of name === 'render' ? [0.8, 9.8] : closeView ? [0.9, 5.1] : wholeSite ? [-4.3, 12.1] : [-1.1, 12.1]) corners.push(new THREE.Vector3(x, -0.33, z));
  }
  for (const x of [-0.15, 6.15]) for (const z of closeView ? [0.95, 5.1] : [0.95, 9.25]) corners.push(new THREE.Vector3(x, silhouetteHeight, z));
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
  if (insideMode && !planMode) {
    camera.fov = THREE.MathUtils.clamp(camera.fov * factor, 35, 85);
    camera.updateProjectionMatrix();
    requestRender();
    return;
  }
  const offset = camera.position.clone().sub(controls.target);
  const distance = THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance);
  camera.position.copy(controls.target).add(offset.setLength(distance));
  controls.update();
  markView('custom');
  requestRender();
}
function orbit(theta, phi = 0) {
  if (insideMode && !planMode) {
    walker.yaw += theta;
    walker.pitch = THREE.MathUtils.clamp(walker.pitch - phi, -1.15, 1.15);
    updateInsideCamera();
    return;
  }
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
document.getElementById('reset').addEventListener('click', () => insideMode ? applyInsideView('passage') : applyView('perspective'));

function updateInsideCamera() {
  camera.position.set(walker.x, INTERIOR.eye, walker.z);
  camera.rotation.set(walker.pitch, -walker.yaw, 0, 'YXZ');
  requestRender();
}

function stepInside(forward, right, distance = 0.32) {
  if (!insideMode || planMode) return;
  const length = Math.hypot(forward, right) || 1;
  const dx = (Math.sin(walker.yaw) * forward + Math.cos(walker.yaw) * right) * distance / length;
  const dz = (-Math.cos(walker.yaw) * forward + Math.sin(walker.yaw) * right) * distance / length;
  Object.assign(walker, moveInside(walker, dx, dz));
  updateInsideCamera();
}

function applyInsideView(name) {
  heldKeys.clear();
  walkTick = 0;
  drag = null;
  planMode = name === 'plan';
  document.body.dataset.insideView = name;
  ceiling.visible = !planMode;
  enclosure.scale.y = planMode ? 0.24 : 1;
  controls.enableDamping = false;
  controls.update();
  controls.reset();
  controls.enabled = planMode;
  controls.enableDamping = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  controls.minDistance = 4;
  controls.maxDistance = 25;
  controls.enablePan = planMode;
  camera.near = 0.035;
  camera.fov = planMode ? 42 : 65;
  camera.updateProjectionMatrix();
  if (planMode) {
    controls.target.set(3, 0.65, 7.1);
    const direction = new THREE.Vector3(0.45, 1, 0.65).normalize();
    let distance = 10 / Math.min(camera.aspect, 1.35);
    const corners = [];
    for (const x of [0, 6]) for (const z of [5.1, 9.1]) for (const y of [0, 1.95]) corners.push(new THREE.Vector3(x, y, z));
    for (let i = 0; i < 24; i++) {
      camera.position.copy(controls.target).addScaledVector(direction, distance);
      camera.lookAt(controls.target);
      camera.updateMatrixWorld();
      if (corners.every(corner => {
        const p = corner.clone().project(camera);
        return Math.abs(p.x) < 0.87 && p.y < 0.70 && p.y > -0.88;
      })) break;
      distance *= 1.06;
    }
    controls.update();
  } else {
    walker = { ...INSIDE_VIEWS[name] };
    updateInsideCamera();
  }
  document.querySelectorAll('button[data-inside-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.insideView === name)));
  document.getElementById('view-status').textContent = planMode ? 'Вся расстановка сверху. Потолок снят, стены условно понижены.' : `Осмотр изнутри. Уровень глаз 1,6 метра. Минимальный потолок ${decimal(interiorHeight)} метра.`;
  document.querySelector('.desktop-help').textContent = planMode ? 'Мышь — вращать · Колесо — масштаб · Правая кнопка — сдвиг' : 'Тяните — осмотреться · W A S D / стрелки — идти · Колесо — приблизить';
  document.querySelector('.touch-help').textContent = planMode ? 'Один палец — вращать · Два — масштаб и сдвиг' : 'Тяните — осмотреться · Кнопки со стрелками — идти';
  renderer.domElement.setAttribute('aria-label', planMode ? 'Расстановка интерьера сверху. Перетащите для вращения, колесо для масштаба.' : 'Осмотр внутри. Перетащите, чтобы оглядеться. W A S D или стрелки для перемещения. Home — исходная точка.');
  requestRender();
}

function setMode(mode) {
  pause();
  heldKeys.clear();
  insideMode = mode === 'inside';
  planMode = false;
  document.body.dataset.mode = mode;
  if (insideMode) history.replaceState(null, '', '#interior');
  else if (location.hash === '#interior') history.replaceState(null, '', location.pathname + location.search);
  interior.visible = insideMode;
  for (const object of [building, site, slab, lawn, earth, street, landscape]) object.visible = !insideMode;
  car.visible = !insideMode && routeSelect.value !== 'hidden';
  dimensions.visible = !insideMode && document.getElementById('dimensions').checked;
  labelsLayer.hidden = !dimensions.visible;
  scene.background.set(insideMode ? '#d5d1c7' : '#b6bec1');
  scene.fog = insideMode ? null : new THREE.Fog('#b6bec1', 32, 95);
  skyLight.intensity = insideMode ? 0.65 : 1.1;
  sun.intensity = insideMode ? 0.55 : 2.1;
  renderer.toneMappingExposure = insideMode ? 0.95 : 1.05;
  ambientOcclusion.kernelRadius = insideMode ? 5 : 6;
  document.querySelectorAll('button[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
  document.querySelector('.view-label').textContent = insideMode ? 'ИНТЕРЬЕР / ОСМОТР ПОМЕЩЕНИЯ' : 'АРХИТЕКТУРНЫЙ ВИД / ПО РЕФЕРЕНСУ';
  host.setAttribute('aria-label', insideMode ? '3D-интерьер хозблока: деревянные стеллажи, ящики и садовый инвентарь' : '3D-сцена: хозблок с навесом, забором и анимацией заезда Geely Monjaro с боксом Sotra Volcano 750');
  if (insideMode) applyInsideView('passage');
  else {
    controls.enabled = true;
    controls.enablePan = true;
    controls.minDistance = 4;
    controls.maxDistance = 100;
    camera.near = 0.1;
    camera.fov = 38;
    camera.updateProjectionMatrix();
    renderer.domElement.setAttribute('aria-label', '3D-модель. Перетащите для вращения, колесо для масштаба. Также доступны кнопки управления камерой.');
    document.querySelector('.desktop-help').textContent = 'Мышь — вращать · Колесо — масштаб · Правая кнопка — сдвиг';
    document.querySelector('.touch-help').textContent = 'Один палец — вращать · Два — масштаб и сдвиг';
    applyView('render');
  }
  updateAccess();
  renderer.domElement.focus({ preventScroll: true });
  if (matchMedia('(max-width: 760px)').matches) document.getElementById('viewer').scrollIntoView({ block: 'start' });
}

document.querySelectorAll('button[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
document.querySelectorAll('button[data-inside-view]').forEach(button => button.addEventListener('click', () => applyInsideView(button.dataset.insideView)));
document.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => {
  const [forward, right] = { forward: [1, 0], back: [-1, 0], left: [0, -1], right: [0, 1] }[button.dataset.step];
  stepInside(forward, right);
}));
renderer.domElement.addEventListener('pointerdown', event => {
  if (!insideMode || planMode || event.button !== 0 || drag) return;
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  renderer.domElement.setPointerCapture(event.pointerId);
  renderer.domElement.focus({ preventScroll: true });
});
renderer.domElement.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.id) return;
  walker.yaw -= (event.clientX - drag.x) * 0.0045;
  walker.pitch = THREE.MathUtils.clamp(walker.pitch + (event.clientY - drag.y) * 0.0035, -1.15, 1.15);
  drag.x = event.clientX;
  drag.y = event.clientY;
  updateInsideCamera();
});
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) renderer.domElement.addEventListener(name, () => { drag = null; });
renderer.domElement.addEventListener('wheel', event => {
  if (!insideMode || planMode) return;
  event.preventDefault();
  zoom(event.deltaY > 0 ? 1.08 : 1 / 1.08);
}, { passive: false });
window.addEventListener('keyup', event => heldKeys.delete(event.code));
window.addEventListener('blur', () => { heldKeys.clear(); drag = null; });
renderer.domElement.addEventListener('blur', () => { heldKeys.clear(); drag = null; });
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
document.addEventListener('visibilitychange', () => { if (document.hidden) { heldKeys.clear(); pause(); } });
document.getElementById('roof-cutaway').addEventListener('change', event => { roof.visible = !event.target.checked; requestRender(); });
function updateAccess() {
  setEntranceOpen(entranceGate, entranceOpen);
  const showRoutes = document.getElementById('access-routes').checked;
  accessRoutes.visible = !insideMode && entranceOpen && showRoutes;
  accessLabelsLayer.hidden = insideMode || !showRoutes;
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
  if (insideMode && !planMode && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
    event.preventDefault();
    heldKeys.add(event.code);
    requestRender();
    return;
  }
  if (event.key === '+' || event.key === '=') zoom(0.8);
  if (event.key === '-') zoom(1.25);
  if (event.key === 'Home') {
    event.preventDefault();
    if (insideMode) applyInsideView('passage');
    else applyView('perspective');
  }
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
review = createReviewer({
  canvas: renderer.domElement, camera, roots: { building, site, car, paving: slab, street, interior },
  modelVersion: 'hozblock-wall-mowers-2026-10-18-v1', variant: monoRoof ? 'mono' : 'flat',
  pause() { heldKeys.clear(); drag = null; pause(); }, requestRender,
  getView() {
    return {
      variant: monoRoof ? 'mono' : 'flat', mode: insideMode ? 'inside' : 'outside', plan: planMode,
      walker: { ...walker }, camera: { position: camera.position.toArray(), target: controls.target.toArray(), fov: camera.fov },
      scene: { route: routeSelect.value, box: boxToggle.checked, mountLift: mountInput.valueAsNumber, time: elapsed,
        lid: lidSelect.value, entrance: entranceOpen, roof: roof.visible, fascia: fascia?.visible ?? true,
        dimensions: document.getElementById('dimensions').checked, routes: document.getElementById('access-routes').checked },
    };
  },
  restoreView(view) {
    const s = view.scene;
    pause(); heldKeys.clear(); drag = null;
    routeSelect.value = s.route; boxToggle.checked = s.box; mountInput.value = s.mountLift;
    entranceOpen = s.entrance; rebuildManeuver(); seek(s.time);
    if (!lidSelect.disabled) { lidSelect.value = s.lid; setRoofBoxOpening(car, s.lid); }
    document.getElementById('roof-cutaway').checked = !s.roof; roof.visible = s.roof;
    document.getElementById('fascia-cutaway').checked = !s.fascia;
    if (fascia) fascia.visible = s.fascia;
    document.getElementById('dimensions').checked = s.dimensions;
    document.getElementById('access-routes').checked = s.routes;
    setMode(view.mode);
    if (view.mode === 'inside') {
      if (view.plan) applyInsideView('plan');
      else if (!canStandInside(view.walker.x, view.walker.z)) { applyInsideView('plan'); return false; }
      else {
        walker = { ...view.walker }; camera.fov = view.camera.fov; camera.updateProjectionMatrix();
        updateInsideCamera(); updatePlayback(); return true;
      }
    }
    const damping = controls.enableDamping;
    controls.enableDamping = false;
    camera.position.fromArray(view.camera.position); controls.target.fromArray(view.camera.target);
    camera.fov = view.camera.fov; camera.updateProjectionMatrix(); controls.update();
    controls.enableDamping = damping; markView('custom'); updatePlayback(); requestRender();
    return true;
  },
  capturePreview(point) {
    composer.render();
    const preview = document.createElement('canvas');
    preview.width = Math.min(640, renderer.domElement.width);
    preview.height = Math.round(preview.width * renderer.domElement.height / renderer.domElement.width);
    const ctx = preview.getContext('2d');
    ctx.drawImage(renderer.domElement, 0, 0, preview.width, preview.height);
    const p = point.clone().project(camera), x = (p.x + 1) * preview.width / 2, y = (1 - p.y) * preview.height / 2;
    ctx.fillStyle = '#277bb6'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    return preview.toDataURL('image/jpeg', 0.78);
  },
});
let fitted = false;
new ResizeObserver(() => {
  if (!host.clientWidth || !host.clientHeight) return;
  camera.aspect = host.clientWidth / host.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(host.clientWidth, host.clientHeight);
  composer.setSize(host.clientWidth, host.clientHeight);
  if (!fitted) {
    fitted = true;
    applyView('render');
    controls.saveState();
    if (location.hash === '#interior') setMode('inside');
    review?.ready();
  }
  else if (insideMode) {
    if (planMode) applyInsideView('plan');
  } else {
    const selected = document.querySelector('[data-view][aria-pressed="true"]');
    if (selected) applyView(selected.dataset.view);
  }
  requestRender();
}).observe(host);
requestRender();
document.getElementById('loading').hidden = true;
host.dataset.ready = 'true';
