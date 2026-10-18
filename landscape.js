import * as THREE from 'three';

// Декоративное окружение: размеры участка и проезда задаются в model.js.
export function createLandscape(texture, random) {
  const garden = new THREE.Group();
  garden.name = 'Ландшафт архитектурного рендера';
  const leaves = texture((ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    for (let i = 0; i < 330; i++) {
      const a = random() * Math.PI * 2, r = Math.sqrt(random()) * size * 0.43;
      const x = size / 2 + Math.cos(a) * r, y = size / 2 + Math.sin(a) * r;
      ctx.fillStyle = ['#526b32', '#718a45', '#8d9b54', '#3b552c', '#a4aa66'][i % 5];
      ctx.beginPath(); ctx.ellipse(x, y, 5 + random() * 8, 2 + random() * 4, a, 0, Math.PI * 2); ctx.fill();
    }
  }, 256);
  const foliage = new THREE.MeshStandardMaterial({ map: leaves, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 });
  const bark = new THREE.MeshStandardMaterial({ color: '#726957', roughness: 1 });
  const card = new THREE.PlaneGeometry(1, 1);
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  function branch(parent, from, to, radius) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.32, radius, a.distanceTo(b), 7), bark);
    mesh.position.copy(a).lerp(b, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
    mesh.castShadow = true;
    parent.add(mesh);
  }
  function tree(x, z, height, spread) {
    const tree = new THREE.Group();
    tree.position.set(x, -0.10, z);
    garden.add(tree);
    branch(tree, [0, 0, 0], [0.12, height * 0.92, 0], height * 0.019);
    const count = 550;
    const crown = new THREE.InstancedMesh(card, foliage, count);
    const centers = [];
    for (let i = 0; i < 22; i++) {
      const a = i * 2.39996, t = i / 22;
      const y = height * (0.34 + t * 0.58);
      const radius = spread * (0.45 + Math.sin(t * Math.PI) * 0.55);
      const tip = [Math.cos(a) * radius, y + height * 0.04, Math.sin(a) * radius];
      branch(tree, [0, y - height * 0.11, 0], tip, height * 0.006 * (1 - t * 0.6));
      centers.push(tip);
    }
    for (let i = 0; i < count; i++) {
      const p = centers[i % centers.length];
      dummy.position.set(p[0] + (random() - 0.5) * spread * 0.65,
        p[1] + (random() - 0.5) * height * 0.14, p[2] + (random() - 0.5) * spread * 0.65);
      dummy.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
      const size = spread * (0.34 + random() * 0.24);
      dummy.scale.set(size, size, size); dummy.updateMatrix();
      crown.setMatrixAt(i, dummy.matrix);
      crown.setColorAt(i, tint.setHSL(0.23 + random() * 0.025, 0.22, 0.68 + random() * 0.25));
    }
    crown.castShadow = crown.receiveShadow = true;
    tree.add(crown);
  }
  // Деревья за границей эскизного участка, не в габаритах манёвра.
  for (let i = 0; i < 13; i++) tree(-12 + i * 4.4, 19 + random() * 7, 7 + random() * 4, 1.8 + random());
  for (let i = 0; i < 5; i++) tree(-7 - random() * 3, 2 + i * 4, 7 + random() * 3, 1.7 + random());
  for (let i = 0; i < 4; i++) tree(22 + random() * 4, 3 + i * 4.5, 7 + random() * 3, 2 + random());

  function shrub(x, z, radius, blue = false) {
    const count = 150;
    const bush = new THREE.InstancedMesh(card, foliage, count);
    for (let i = 0; i < count; i++) {
      const a = random() * Math.PI * 2, y = random(), r = Math.sqrt(1 - y * y) * radius * Math.sqrt(random());
      dummy.position.set(x + Math.cos(a) * r, -0.10 + y * radius * 1.5, z + Math.sin(a) * r);
      dummy.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
      dummy.scale.setScalar(radius * (0.4 + random() * 0.25)); dummy.updateMatrix();
      bush.setMatrixAt(i, dummy.matrix);
      bush.setColorAt(i, tint.set(blue ? '#a3b9bb' : '#aebc8e').multiplyScalar(0.7 + random() * 0.4));
    }
    bush.castShadow = bush.receiveShadow = true;
    garden.add(bush);
  }
  for (const [x, z, r] of [[12.5, 2.1, 0.7], [12.4, 5, 0.9], [13.1, 8.6, 0.8], [10, 12.5, 0.7], [7, 12.7, 0.9], [2.5, 12.7, 0.8], [-2.8, 8.8, 0.65]]) {
    shrub(x, z, r); shrub(x + 0.9, z + 0.5, r * 0.42, true);
    const bed = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.5, r * 1.5, 0.025, 32),
      new THREE.MeshStandardMaterial({ color: '#665d49', roughness: 1 }));
    bed.position.set(x + 0.2, -0.092, z + 0.15); bed.receiveShadow = true; garden.add(bed);
  }
  // Тонкая трава даёт силуэт по краям газона вместо однотонной плоскости.
  const blade = new THREE.BufferGeometry();
  blade.setAttribute('position', new THREE.Float32BufferAttribute([-0.014, 0, 0, 0.014, 0, 0, 0.006, 0.10, 0.012], 3));
  blade.computeVertexNormals();
  const blades = new THREE.InstancedMesh(blade, new THREE.MeshStandardMaterial({ color: '#82904f', roughness: 1, side: THREE.DoubleSide }), 18000);
  let n = 0;
  while (n < blades.count) {
    const x = -5 + random() * 24, z = 0.3 + random() * 15;
    if (x > -1.3 && x < 11.15 && z < 11.15) continue;
    dummy.position.set(x, -0.1, z); dummy.rotation.set(0, random() * Math.PI * 2, 0);
    dummy.scale.setScalar(0.45 + random() * 0.8); dummy.updateMatrix(); blades.setMatrixAt(n, dummy.matrix);
    blades.setColorAt(n++, tint.setHSL(0.20 + random() * 0.07, 0.25 + random() * 0.2, 0.33 + random() * 0.16));
  }
  blades.receiveShadow = true; garden.add(blades);
  const curbMaterial = new THREE.MeshStandardMaterial({ color: '#a5a6a1', roughness: 0.92 });
  for (const [size, position] of [[[0.12, 0.10, 11], [11.07, -0.025, 5.5]], [[11.2, 0.10, 0.12], [5.5, -0.025, 11.07]]]) {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(...size), curbMaterial);
    curb.position.set(...position); curb.castShadow = curb.receiveShadow = true; garden.add(curb);
  }
  return garden;
}
