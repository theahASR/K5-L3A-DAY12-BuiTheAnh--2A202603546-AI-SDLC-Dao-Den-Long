# Credits & Attribution

## Original Procedural Assets & Code
- **3D Models, Environments & Materials:** 100% procedurally generated in Three.js (`src/game/renderer3d.ts`) — Night 1 Đảo Bến, Night 2 Đảo Cau (twin islands, bamboo bridge, jump pads), Night 3 Đảo Chuông (3-tier island, straight ramps, Bell Tower, wind leaves), sea of clouds, starfield, Mây (with *nón lá* conical hat and hanging mini-lantern), Great Lanterns (inflated/deflated/torn states & 3D fuel bar), GPU-instanced Firefly motes and Ink Shades, Gió Lạc ribbon drifters, and Bùa Gió wind charms. Zero external copyrighted 3D models or textures used.
- **Audio (BGM & SFX):** 100% procedurally synthesized via Web Audio API (`src/game/audio.ts`) — night pentatonic ambient lullaby + sound effects for pickup, deposit, lantern lit, pulse, jump, dash, shade spawn, drifter steal/drop, hit, wind telegraph, final 10 s countdown, win, and defeat. Zero external audio files used.
- **Game Design & Narrative:** Original scenario from *Day 12 AI SDLC — Đảo Đèn Lồng* lab.

## Open-Source Libraries & Tooling
- **Three.js** (`^0.170.0`) — MIT License (https://threejs.org/)
- **Vite** (`^6.0.3`) — MIT License (https://vite.dev/)
- **TypeScript** (`^5.7.2`) — Apache-2.0 License (https://www.typescriptlang.org/)
- **Vitest** (`^2.1.8`) — MIT License (https://vitest.dev/)
- **esbuild** (`^0.24.0`) — MIT License (https://esbuild.github.io/)
- **Node.js** — MIT License (https://nodejs.org/)

## AI Tools Used
- **Antigravity (Gemini)** — Assisted with requirements specification, architecture & ADR authoring, TypeScript/Three.js implementation, test & scenario authoring, GPU instancing optimization, and independent read-only subagent code audits across Phases 1–4 under human direction and verification.
