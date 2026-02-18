(() => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 6, 10);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambient);

  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(5, 10, 7);
  scene.add(dir);

  // Ground grid
  const grid = new THREE.GridHelper(200, 40, 0x444444, 0x888888);
  scene.add(grid);

  // Player cube
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0xff5555 });
  const player = new THREE.Mesh(geometry, material);
  player.position.y = 0.5;
  scene.add(player);

  // Simple camera follow
  function updateCamera() {
    const offset = new THREE.Vector3(0, 5, 10);
    const target = player.position.clone();
    camera.position.copy(target).add(offset);
    camera.lookAt(target);
  }

  // Movement
  const keys = {};
  window.addEventListener('keydown', (e) => (keys[e.code] = true));
  window.addEventListener('keyup', (e) => (keys[e.code] = false));

  const speed = 5;

  function step(dt) {
    const dir = new THREE.Vector3();
    if (keys['KeyW'] || keys['ArrowUp']) dir.z -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) dir.z += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) dir.x -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) dir.x += 1;
    if (dir.lengthSq() > 0) {
      dir.normalize();
      player.position.addScaledVector(dir, speed * dt);
    }
  }

  let last = performance.now();
  function animate() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    step(dt);
    updateCamera();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  animate();
})();
