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

  // minimap canvas
  const minimap = document.createElement('canvas');
  minimap.id = 'minimap';
  minimap.width = 200;
  minimap.height = 200;
  document.body.appendChild(minimap);
  const minimapCtx = minimap.getContext('2d');

  // map data from server
  const mapData = { spawnPoints: [], objectives: [] };

  // hover / confirm UI state for minimap
  let hoveredSpawn = null;
  const spawnConfirm = document.createElement('div');
  spawnConfirm.id = 'spawn-confirm-ui';
  spawnConfirm.style.display = 'none';
  spawnConfirm.innerHTML = `
    <div class="spawn-confirm-panel">
      <div class="spawn-confirm-text"></div>
      <div class="spawn-confirm-actions">
        <button id="spawn-confirm-yes">Respawn</button>
        <button id="spawn-confirm-no">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(spawnConfirm);

  function showSpawnConfirm(idx) {
    const s = mapData.spawnPoints[idx];
    if (!s) return;
    spawnConfirm.querySelector('.spawn-confirm-text').textContent = `Respawn at Spawn ${idx + 1}?`;
    // position near minimap
    const rect = minimap.getBoundingClientRect();
    spawnConfirm.style.left = (rect.left - 10) + 'px';
    spawnConfirm.style.top = (rect.bottom + 8) + 'px';
    spawnConfirm.style.display = 'block';
    spawnConfirm._pending = idx;
  }
  function hideSpawnConfirm() { spawnConfirm.style.display = 'none'; spawnConfirm._pending = null }
  spawnConfirm.querySelector('#spawn-confirm-no').addEventListener('click', hideSpawnConfirm);
  spawnConfirm.querySelector('#spawn-confirm-yes').addEventListener('click', () => {
    const idx = spawnConfirm._pending;
    if (idx != null && socket && socket.connected) socket.emit('player:respawn', { spawnIndex: idx });
    hideSpawnConfirm();
  });

  // minimap legend (shows colors & interactivity)
  const legend = document.createElement('div');
  legend.className = 'minimap-legend';
  legend.innerHTML = `
    <div class="legend-item"><div class="legend-swatch" style="background:#00ff66"></div><div class="legend-label">Spawn points</div></div>
    <div class="legend-item"><div class="legend-swatch" style="background:#ff4444"></div><div class="legend-label">Objectives</div></div>
    <div class="hint">Click a spawn on the minimap to respawn there.</div>`;
  document.body.appendChild(legend);

  function createLabel(text) {
    const el = document.createElement('div');
    el.className = 'player-label';
    el.textContent = text;
    labelsContainer.appendChild(el);
    return el;
  }

  function createRemotePlayer(id, state) {
    const colorHex = state.color ? state.color : '#5555ff';
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(colorHex) });
    const mesh = new THREE.Mesh(geometry.clone(), mat);
    mesh.position.set(state.position.x, state.position.y, state.position.z);
    scene.add(mesh);
    const target = new THREE.Vector3(state.position.x, state.position.y, state.position.z);
    const name = state.name || `Player_${id.slice(0,4)}`;
    const labelEl = createLabel(name);
    if (state.color) labelEl.style.background = state.color;
    remotePlayers[id] = { mesh, target, labelEl, name };
    return remotePlayers[id];
  }

  // local player name and join
  const localName = (window.prompt && prompt('Enter your player name', 'Player')) || `Player_${Math.random().toString(36).slice(2,6)}`;

  // Spawn selection UI state
  let selectedSpawn = null; // null = random

  function createSpawnUI() {
    const container = document.createElement('div');
    container.id = 'spawn-ui';
    container.innerHTML = `
      <div class="spawn-panel">
        <div class="spawn-title">Choose spawn</div>
        <div class="spawn-list"></div>
        <div style="margin:8px 0">Color: <input id="spawn-color" type="color" value="#ff5555"></div>
        <div class="spawn-actions">
          <button id="spawn-confirm">Spawn</button>
        </div>
      </div>`;
    document.body.appendChild(container);

    const list = container.querySelector('.spawn-list');
    // create 5 spawn options (match server spawnPoints length)
    for (let i = 0; i < 5; i++) {
      const b = document.createElement('button');
      b.className = 'spawn-option';
      b.textContent = `Spawn ${i + 1}`;
      b.dataset.index = i;
      b.addEventListener('click', () => {
        selectedSpawn = i;
        // highlight
        container.querySelectorAll('.spawn-option').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
      });
      list.appendChild(b);
    }

    container.querySelector('#spawn-confirm').addEventListener('click', () => {
      // if socket connected, send join/respawn
      const colorInput = container.querySelector('#spawn-color');
      const color = colorInput ? colorInput.value : null;
      if (socket && socket.connected) {
        // if not yet joined, send join; otherwise request respawn
        socket.emit('player:respawn', { spawnIndex: selectedSpawn, color });
        // hide the spawn UI after choosing
        container.style.display = 'none';
      }
    });

    return container;
  }

  const spawnUI = createSpawnUI();

  // add a small respawn button to UI
  const respawnBtn = document.createElement('button');
  respawnBtn.id = 'respawn-btn';
  respawnBtn.textContent = 'Respawn';
  respawnBtn.addEventListener('click', () => {
    // show spawn UI so user can pick a spawn
    spawnUI.style.display = 'block';
  });
  document.getElementById('ui').appendChild(respawnBtn);

  if (socket) {
    // ensure we send color on initial join
    socket.on('connect', () => {
      console.log('connected to server', socket.id);
      const colorInput = document.querySelector('#spawn-color');
      const color = colorInput ? colorInput.value : null;
      socket.emit('player:join', { name: localName, spawnIndex: selectedSpawn, color });
    });

    socket.on('players:init', (all) => {
      Object.keys(all).forEach((id) => {
        if (id === socket.id) return;
        createRemotePlayer(id, all[id]);
      });
    });

    socket.on('map:data', (data) => {
      if (!data) return;
      mapData.spawnPoints = data.spawnPoints || [];
      mapData.objectives = data.objectives || [];
    });

    socket.on('player:joined', ({ id, state }) => {
      if (id === socket.id) return;
      createRemotePlayer(id, state);
    });

    // server confirms our assigned spawn/name
    socket.on('player:joined:you', ({ id, state }) => {
      // set local player position to assigned spawn
      player.position.set(state.position.x, state.position.y, state.position.z);
      // set local player color
      if (state.color) player.material.color.set(state.color);
      // create local label
      const label = createLabel(state.name || localName);
      if (state.color) label.style.background = state.color;
      // attach local label to a simple local record
      remotePlayers[id] = remotePlayers[id] || {};
      remotePlayers[id].local = true;
      remotePlayers[id].labelEl = label;
      remotePlayers[id].name = state.name || localName;
      remotePlayers[id].color = state.color;
    });

    // receive meta updates (like color change)
    socket.on('player:meta', ({ id, meta }) => {
      const rec = remotePlayers[id];
      if (!rec) return;
      if (meta.color) {
        rec.color = meta.color;
        if (rec.mesh) rec.mesh.material.color.set(meta.color);
        if (rec.labelEl) rec.labelEl.style.background = meta.color;
      }
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

      // Draw minimap (top-right)
      if (minimapCtx) {
        const size = Math.min(minimap.width, minimap.height);
        // clear
        minimapCtx.clearRect(0, 0, minimap.width, minimap.height);
        // background
        minimapCtx.fillStyle = 'rgba(0,0,0,0.6)';
        minimapCtx.fillRect(0, 0, minimap.width, minimap.height);
        // settings: show area around local player
        const viewSize = 30; // world units across
        const half = viewSize / 2;
        const scale = size / viewSize;
        // center on local player
        const cx = player.position.x;
        const cz = player.position.z;

        // draw grid
        minimapCtx.strokeStyle = 'rgba(255,255,255,0.06)';
        minimapCtx.lineWidth = 1;
        for (let g = -half; g <= half; g += 5) {
          const gx = (g + half) * scale;
          minimapCtx.beginPath();
          minimapCtx.moveTo(gx, 0);
          minimapCtx.lineTo(gx, size);
          minimapCtx.stroke();
          minimapCtx.beginPath();
          minimapCtx.moveTo(0, gx);
          minimapCtx.lineTo(size, gx);
          minimapCtx.stroke();
        }

        // draw players
        Object.keys(remotePlayers).forEach((id) => {
          const rec = remotePlayers[id];
          if (!rec) return;
          const px = (rec.mesh.position.x - (cx - half)) * scale;
          const pz = (rec.mesh.position.z - (cz - half)) * scale;
          // skip if outside
          if (px < 0 || px > size || pz < 0 || pz > size) return;
          minimapCtx.beginPath();
          minimapCtx.fillStyle = rec.color || '#55f';
          minimapCtx.arc(px, pz, id === (socket && socket.id) ? 5 : 4, 0, Math.PI * 2);
          minimapCtx.fill();
        });

        // draw local player in center indicator
        const localX = (player.position.x - (cx - half)) * scale;
        const localZ = (player.position.z - (cz - half)) * scale;
        minimapCtx.beginPath();
        minimapCtx.fillStyle = '#ff5';
        minimapCtx.arc(localX, localZ, 6, 0, Math.PI * 2);
        minimapCtx.fill();

        // border
        minimapCtx.strokeStyle = 'rgba(255,255,255,0.3)';
        minimapCtx.lineWidth = 2;
        minimapCtx.strokeRect(0, 0, size, size);
      }

      // end animate loop actions


    // Click-to-respawn: map canvas coordinate -> world coordinate -> nearest spawn
    function minimapToWorld(mx, my) {
      const size = Math.min(minimap.width, minimap.height);
      const viewSize = 30;
      const half = viewSize / 2;
      const scale = size / viewSize;
      const cx = player.position.x;
      const cz = player.position.z;
      // convert canvas coords to map-space (0..size)
      const localX = mx;
      const localY = my;
      const worldX = (localX / scale) + (cx - half);
      const worldZ = (localY / scale) + (cz - half);
      return { x: worldX, z: worldZ };
    }

    minimap.addEventListener('click', (ev) => {
      const rect = minimap.getBoundingClientRect();
      const mx = ev.clientX - rect.left;
      const my = ev.clientY - rect.top;
      const w = minimapToWorld(mx, my);
      // find closest spawn point within threshold (world units)
      let best = null;
      let bestDist = 9999;
      mapData.spawnPoints.forEach((s, idx) => {
        const dx = s.x - w.x;
        const dz = s.z - w.z;
        const d = Math.sqrt(dx*dx + dz*dz);
        if (d < bestDist) { bestDist = d; best = { s, idx }; }
      });
      if (best && bestDist < 4) {
        // show confirmation dialog rather than immediate respawn
        showSpawnConfirm(best.idx);
      }
    });

    minimap.addEventListener('mousemove', (ev) => {
      const rect = minimap.getBoundingClientRect();
      const mx = ev.clientX - rect.left;
      const my = ev.clientY - rect.top;
      const w = minimapToWorld(mx, my);
      // find nearest spawn within hover threshold
      let best = null; let bestDist = 9999;
      mapData.spawnPoints.forEach((s, idx) => {
        const dx = s.x - w.x; const dz = s.z - w.z; const d = Math.sqrt(dx*dx + dz*dz);
        if (d < bestDist) { bestDist = d; best = { s, idx }; }
      });
      if (best && bestDist < 4) hoveredSpawn = best.idx; else hoveredSpawn = null;
    });

    minimap.addEventListener('mouseleave', () => { hoveredSpawn = null; });
      // end animate loop actions

      // draw spawn points
      mapData.spawnPoints.forEach((s, idx) => {
        const px = (s.x - (cx - half)) * scale;
        const pz = (s.z - (cz - half)) * scale;
        if (px < 0 || px > size || pz < 0 || pz > size) return;
        // highlight if hovered
        const isHover = hoveredSpawn === idx;
        minimapCtx.fillStyle = isHover ? '#99ffbb' : '#00ff66';
        minimapCtx.beginPath();
        const sizeTri = isHover ? 9 : 6;
        minimapCtx.moveTo(px, pz - sizeTri);
        minimapCtx.lineTo(px - sizeTri, pz + sizeTri);
        minimapCtx.lineTo(px + sizeTri, pz + sizeTri);
        minimapCtx.closePath();
        minimapCtx.fill();
        if (isHover) {
          minimapCtx.strokeStyle = 'rgba(0,0,0,0.5)'; minimapCtx.lineWidth = 2; minimapCtx.stroke();
        }
        // small index label
        minimapCtx.fillStyle = 'rgba(0,0,0,0.7)';
        minimapCtx.font = '10px sans-serif';
        minimapCtx.fillText(String(idx + 1), px - 3, pz + 4);
      });

      // draw objectives
      mapData.objectives.forEach((o) => {
        const px = (o.x - (cx - half)) * scale;
        const pz = (o.z - (cz - half)) * scale;
        if (px < 0 || px > size || pz < 0 || pz > size) return;
        minimapCtx.fillStyle = '#ff4444';
        minimapCtx.beginPath();
        minimapCtx.rect(px - 5, pz - 5, 10, 10);
        minimapCtx.fill();
        // objective initial
        minimapCtx.fillStyle = 'white';
        minimapCtx.font = '9px sans-serif';
        minimapCtx.fillText((o.name || 'O').charAt(0), px - 3, pz + 3);
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
