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

  // Networking + remote player smoothing/labels
  const socket = window.io ? window.io() : null;
  const remotePlayers = {}; // id -> { mesh, target: Vector3, labelEl, name }

  // overlay for name labels
  const labelsContainer = document.createElement('div');
  labelsContainer.id = 'labels';
  document.body.appendChild(labelsContainer);

  function createLabel(text) {
    const el = document.createElement('div');
    el.className = 'player-label';
    el.textContent = text;
    labelsContainer.appendChild(el);
    return el;
  }

  function createRemotePlayer(id, state) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x5555ff });
    const mesh = new THREE.Mesh(geometry.clone(), mat);
    mesh.position.set(state.position.x, state.position.y, state.position.z);
    scene.add(mesh);
    const target = new THREE.Vector3(state.position.x, state.position.y, state.position.z);
    const name = state.name || `Player_${id.slice(0,4)}`;
    const labelEl = createLabel(name);
    remotePlayers[id] = { mesh, target, labelEl, name };
    return remotePlayers[id];
  }

  // local player name and join
  const localName = (window.prompt && prompt('Enter your player name', 'Player')) || `Player_${Math.random().toString(36).slice(2,6)}`;

  if (socket) {
    socket.on('connect', () => {
      console.log('connected to server', socket.id);
      socket.emit('player:join', { name: localName });
    });

    socket.on('players:init', (all) => {
      Object.keys(all).forEach((id) => {
        if (id === socket.id) return;
        createRemotePlayer(id, all[id]);
      });
    });

    socket.on('player:joined', ({ id, state }) => {
      if (id === socket.id) return;
      createRemotePlayer(id, state);
    });

    // server confirms our assigned spawn/name
    socket.on('player:joined:you', ({ id, state }) => {
      // set local player position to assigned spawn
      player.position.set(state.position.x, state.position.y, state.position.z);
      // create local label
      const label = createLabel(state.name || localName);
      // attach local label to a simple local record
      remotePlayers[id] = remotePlayers[id] || {};
      remotePlayers[id].local = true;
      remotePlayers[id].labelEl = label;
      remotePlayers[id].name = state.name || localName;
    });

    socket.on('player:update', ({ id, position }) => {
      if (id === socket.id) return;
      const rec = remotePlayers[id] || createRemotePlayer(id, { position, name: `Player_${id.slice(0,4)}` });
      rec.target.set(position.x, position.y, position.z);
    });

    socket.on('player:remove', ({ id }) => {
      const rec = remotePlayers[id];
      if (rec) {
        if (rec.mesh) scene.remove(rec.mesh);
        if (rec.labelEl && rec.labelEl.parentNode) rec.labelEl.parentNode.removeChild(rec.labelEl);
        delete remotePlayers[id];
      }
    });
  }

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

      // send position updates at 10Hz (every 100ms)
      // use a simple timer based on lastSent
      if (socket) {
        if (!socket._lastSent || now - socket._lastSent > 90) {
          socket.emit('player:update', { position: { x: player.position.x, y: player.position.y, z: player.position.z } });
          socket._lastSent = now;
        }
      }

      // smooth remote players toward target positions
      Object.keys(remotePlayers).forEach((id) => {
        const rec = remotePlayers[id];
        if (!rec.mesh || !rec.target) return;
        // lerp towards target
        rec.mesh.position.lerp(rec.target, 0.18);
        // update label position
        if (rec.labelEl) {
          const pos = rec.mesh.position.clone();
          pos.y += 1.2;
          pos.project(camera);
          const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
          const y = (-pos.y * 0.5 + 0.5) * window.innerHeight;
          rec.labelEl.style.transform = `translate(-50%,-100%) translate(${x}px,${y}px)`;
          rec.labelEl.style.display = pos.z > 1 || pos.z < -1 ? 'none' : 'block';
        }
      });

    // update remote players (interpolation could go here)
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
