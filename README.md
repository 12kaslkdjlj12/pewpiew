# pewpiew

A lightweight starting scaffold for a Roblox-like web prototype.

This repository contains a minimal Node + Express server and a browser client using Three.js. The client renders a simple 3D scene with a controllable cube to serve as a starting point for a Roblox-style project.

Quick start

- Install dependencies:

```bash
npm install
```

- Start the server:

```bash
npm start
```

- Open http://localhost:3000 in your browser.

Next steps

- Extend `public/main.js` with networking, player avatars, physics, and level loading.
- Add build tooling, TypeScript, and automated tests as needed.

Files added

- `src/server.js` — Express static server
- `public/index.html` — Client entry
- `public/main.js` — Three.js scene + player controls
- `package.json` — scripts and dependencies
- `.gitignore`

Enjoy building!
