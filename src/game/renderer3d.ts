import * as THREE from 'three';
import { ISLAND_RADIUS } from '../core/config';
import type { GameSimulation } from '../core/simulation';
import type { LanternEntity } from '../core/types';

interface LanternVisual {
  group: THREE.Group;
  coreMat: THREE.MeshStandardMaterial;
  light: THREE.PointLight;
  safeRing: THREE.Mesh;
  orbMeshes: THREE.Mesh[];
}

interface ShadeVisual {
  group: THREE.Group;
  bodyMat: THREE.MeshStandardMaterial;
  stunRing: THREE.Mesh;
}

export class Renderer3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;

  private readonly ambientLight: THREE.AmbientLight;
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly moonLight: THREE.DirectionalLight;
  private readonly fog: THREE.FogExp2;

  private readonly playerGroup: THREE.Group;
  private readonly hatLanternGroup: THREE.Group;
  private readonly playerLight: THREE.PointLight;
  private readonly carriedOrbs: THREE.Mesh[] = [];
  private readonly leftLeg: THREE.Mesh;
  private readonly rightLeg: THREE.Mesh;

  private readonly pulseRing: THREE.Mesh;
  private readonly pulseRingMat: THREE.MeshBasicMaterial;
  private readonly pulseLight: THREE.PointLight;

  private readonly lanternVisuals = new Map<string, LanternVisual>();
  private readonly moteMeshes = new Map<string, THREE.Group>();
  private readonly shadeVisuals = new Map<string, ShadeVisual>();
  private readonly clouds: THREE.Group[] = [];

  private elapsed = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x090d1e);
    this.fog = new THREE.FogExp2(0x0b1024, 0.017);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      260
    );

    // Warm storybook night lighting (brightens smoothly as lanterns light up)
    this.ambientLight = new THREE.AmbientLight(0x2d3561, 0.65);
    this.scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0x5264a8, 0x1e2236, 0.55);
    this.scene.add(this.hemiLight);

    this.moonLight = new THREE.DirectionalLight(0xb8c7ff, 0.7);
    this.moonLight.position.set(22, 36, -18);
    this.moonLight.castShadow = true;
    this.moonLight.shadow.mapSize.set(1024, 1024);
    this.moonLight.shadow.camera.near = 5;
    this.moonLight.shadow.camera.far = 120;
    const d = 42;
    this.moonLight.shadow.camera.left = -d;
    this.moonLight.shadow.camera.right = d;
    this.moonLight.shadow.camera.top = d;
    this.moonLight.shadow.camera.bottom = -d;
    this.scene.add(this.moonLight);

    this.buildIslandEnvironment();

    // Build Mây (player with conical hat / nón lá & hanging mini-lantern)
    const { group, hatLanternGroup, playerLight, leftLeg, rightLeg, carriedOrbs } =
      this.buildMayCharacter();
    this.playerGroup = group;
    this.hatLanternGroup = hatLanternGroup;
    this.playerLight = playerLight;
    this.leftLeg = leftLeg;
    this.rightLeg = rightLeg;
    this.carriedOrbs = carriedOrbs;
    this.scene.add(this.playerGroup);

    // Expanding golden pulse wave ring
    const ringGeo = new THREE.RingGeometry(0.85, 1.0, 48);
    ringGeo.rotateX(-Math.PI / 2);
    this.pulseRingMat = new THREE.MeshBasicMaterial({
      color: 0xffc857,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    this.pulseRing = new THREE.Mesh(ringGeo, this.pulseRingMat);
    this.pulseRing.position.y = 0.12;
    this.pulseRing.visible = false;
    this.scene.add(this.pulseRing);

    this.pulseLight = new THREE.PointLight(0xffb703, 0, 14);
    this.scene.add(this.pulseLight);

    window.addEventListener('resize', this.handleResize);
  }

  private handleResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private buildIslandEnvironment(): void {
    // Circular island Đảo Bến (top surface strictly at Y = 0)
    const topGeo = new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS - 1.5, 2.4, 48);
    const topMat = new THREE.MeshStandardMaterial({
      color: 0x26344a,
      roughness: 0.92,
      metalness: 0.05,
    });
    const islandTop = new THREE.Mesh(topGeo, topMat);
    islandTop.position.y = -1.2;
    islandTop.receiveShadow = true;
    this.scene.add(islandTop);

    // Tapered floating rock underside
    const baseGeo = new THREE.ConeGeometry(ISLAND_RADIUS - 1.5, 14, 24);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x192033,
      roughness: 0.95,
    });
    const islandBase = new THREE.Mesh(baseGeo, baseMat);
    islandBase.rotation.x = Math.PI;
    islandBase.position.y = -9.4;
    this.scene.add(islandBase);

    // Central warm stone plaza at (0,0,0)
    const plazaGeo = new THREE.CylinderGeometry(3.8, 4.1, 0.08, 24);
    const plazaMat = new THREE.MeshStandardMaterial({
      color: 0x3b4259,
      roughness: 0.85,
    });
    const plaza = new THREE.Mesh(plazaGeo, plazaMat);
    plaza.position.y = 0.02;
    plaza.receiveShadow = true;
    this.scene.add(plaza);

    // Wooden dock pier accents ("Đảo Bến") & outer stones/trees
    const postMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x1f3a44, roughness: 0.85 });
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const r = ISLAND_RADIUS - 2.6;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;

      if (i % 2 === 0) {
        // Stylized lantern-island pine tree
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 1.8, 6), postMat);
        trunk.position.y = 0.9;
        trunk.castShadow = true;
        tree.add(trunk);

        const crown1 = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.4, 7), leafMat);
        crown1.position.y = 2.4;
        crown1.castShadow = true;
        tree.add(crown1);

        const crown2 = new THREE.Mesh(new THREE.ConeGeometry(1.0, 2.0, 7), leafMat);
        crown2.position.y = 3.7;
        crown2.castShadow = true;
        tree.add(crown2);

        tree.position.set(x, 0, z);
        this.scene.add(tree);
      } else {
        // Low harbor stone bollard along the rim
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.9, 8), postMat);
        post.position.set(x, 0.45, z);
        post.castShadow = true;
        this.scene.add(post);
      }
    }

    // Sea of clouds encircling the floating island
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0x2a3356,
      emissive: 0x10152b,
      roughness: 1.0,
      transparent: true,
      opacity: 0.88,
    });
    for (let i = 0; i < 28; i++) {
      const cloud = new THREE.Group();
      const angle = (i / 28) * Math.PI * 2;
      const dist = ISLAND_RADIUS + 8 + (i % 3) * 11;
      for (let p = 0; p < 3; p++) {
        const puff = new THREE.Mesh(
          new THREE.SphereGeometry(4.5 + ((i + p) % 3) * 1.4, 10, 8),
          cloudMat
        );
        puff.position.set((p - 1) * 4.2, ((p % 2) - 0.5) * 1.2, (p % 2) * 2.0);
        puff.scale.set(1.2, 0.55, 1.0);
        cloud.add(puff);
      }
      cloud.position.set(Math.cos(angle) * dist, -4.5 - (i % 4) * 1.2, Math.sin(angle) * dist);
      cloud.userData = { angle, dist, speed: 0.012 + (i % 3) * 0.004 };
      this.clouds.push(cloud);
      this.scene.add(cloud);
    }

    // Warm storybook moon & twinkling starfield
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(4.8, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xffe8a3 })
    );
    moon.position.set(55, 62, -78);
    this.scene.add(moon);

    const starCount = 260;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      // Deterministic golden-angle sky distribution
      const t = i / starCount;
      const theta = i * 2.3999632;
      const phi = Math.acos(0.15 + t * 0.82);
      const r = 135;
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.cos(phi) + 8;
      starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xfef08a, size: 0.75, transparent: true, opacity: 0.85 })
    );
    this.scene.add(stars);
  }

  private buildMayCharacter() {
    const group = new THREE.Group();

    // Boots/legs
    const legMat = new THREE.MeshStandardMaterial({ color: 0x3b2f2f, roughness: 0.8 });
    const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.25, 4, 8), legMat);
    leftLeg.position.set(-0.14, 0.24, 0);
    leftLeg.castShadow = true;
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.25, 4, 8), legMat);
    rightLeg.position.set(0.14, 0.24, 0);
    rightLeg.castShadow = true;
    group.add(rightLeg);

    // Warm cream/ochre storybook cloak
    const cloakMat = new THREE.MeshStandardMaterial({
      color: 0xe6a85c,
      roughness: 0.75,
    });
    const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.88, 12), cloakMat);
    cloak.position.y = 0.78;
    cloak.castShadow = true;
    group.add(cloak);

    // Scarf
    const scarf = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.07, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0xd94e34, roughness: 0.7 })
    );
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 1.18;
    group.add(scarf);

    // Head
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 14, 14),
      new THREE.MeshStandardMaterial({ color: 0xfde0c4, roughness: 0.65 })
    );
    head.position.y = 1.38;
    head.castShadow = true;
    group.add(head);

    // Conical hat (Nón lá)
    const hatMat = new THREE.MeshStandardMaterial({
      color: 0xe8c574,
      roughness: 0.8,
      side: THREE.DoubleSide,
    });
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.66, 0.42, 20, 1, true), hatMat);
    hat.position.y = 1.66;
    hat.castShadow = true;
    group.add(hat);

    // Small hanging lantern suspended from the brim of Mây's nón lá
    const hatLanternGroup = new THREE.Group();
    hatLanternGroup.position.set(0, 1.48, 0.56);

    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.24, 6),
      new THREE.MeshBasicMaterial({ color: 0x854d0e })
    );
    cord.position.y = -0.12;
    hatLanternGroup.add(cord);

    const miniLantern = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 10, 10),
      new THREE.MeshStandardMaterial({
        color: 0xffd166,
        emissive: 0xff9f1c,
        emissiveIntensity: 1.8,
      })
    );
    miniLantern.scale.set(0.9, 1.25, 0.9);
    miniLantern.position.y = -0.28;
    hatLanternGroup.add(miniLantern);

    const playerLight = new THREE.PointLight(0xffb703, 2.2, 11);
    playerLight.position.set(0, -0.28, 0);
    hatLanternGroup.add(playerLight);

    group.add(hatLanternGroup);

    // Orbiting carried firefly indicators (up to 5)
    const carriedOrbs: THREE.Mesh[] = [];
    const orbGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const orbMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });
    for (let i = 0; i < 5; i++) {
      const orb = new THREE.Mesh(orbGeo, orbMat);
      orb.visible = false;
      group.add(orb);
      carriedOrbs.push(orb);
    }

    return { group, hatLanternGroup, playerLight, leftLeg, rightLeg, carriedOrbs };
  }

  private ensureLanternVisual(lantern: LanternEntity, sim: GameSimulation): LanternVisual {
    const existing = this.lanternVisuals.get(lantern.id);
    if (existing) return existing;

    const group = new THREE.Group();
    group.position.set(lantern.x, lantern.y, lantern.z);

    // Stone pedestal
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.9 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.15, 0.5, 8), stoneMat);
    base.position.y = 0.25;
    base.receiveShadow = true;
    base.castShadow = true;
    group.add(base);

    // Pillar
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.34, 2.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x3b2d26, roughness: 0.85 })
    );
    pillar.position.y = 1.6;
    pillar.castShadow = true;
    group.add(pillar);

    // Glowing lantern core
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x374151,
      emissive: 0xff9f1c,
      emissiveIntensity: 0.1,
      roughness: 0.4,
    });
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.68, 1), coreMat);
    core.position.y = 3.15;
    group.add(core);

    // Traditional curved roof cap
    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(1.15, 0.65, 8),
      new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.75 })
    );
    cap.position.y = 3.95;
    cap.castShadow = true;
    group.add(cap);

    // Warm golden light when lit
    const light = new THREE.PointLight(0xffae34, 0, 18);
    light.position.y = 3.2;
    group.add(light);

    // Subtle ground ring showing safe_radius when lit
    const safeGeo = new THREE.RingGeometry(
      sim.tuning.safe_radius - 0.14,
      sim.tuning.safe_radius,
      48
    );
    safeGeo.rotateX(-Math.PI / 2);
    const safeRing = new THREE.Mesh(
      safeGeo,
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
      })
    );
    safeRing.position.y = 0.05;
    safeRing.visible = false;
    group.add(safeRing);

    // Progress orbs around base showing deposited / lantern_cost
    const orbMeshes: THREE.Mesh[] = [];
    for (let i = 0; i < sim.tuning.lantern_cost; i++) {
      const a = (i / sim.tuning.lantern_cost) * Math.PI * 2;
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffd166 })
      );
      orb.position.set(Math.cos(a) * 1.15, 0.75, Math.sin(a) * 1.15);
      orb.visible = false;
      group.add(orb);
      orbMeshes.push(orb);
    }

    this.scene.add(group);
    const vis: LanternVisual = { group, coreMat, light, safeRing, orbMeshes };
    this.lanternVisuals.set(lantern.id, vis);
    return vis;
  }

  private createMoteMesh(): THREE.Group {
    const g = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xffe57f })
    );
    g.add(core);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 10, 10),
      new THREE.MeshBasicMaterial({
        color: 0xffa62b,
        transparent: true,
        opacity: 0.32,
      })
    );
    g.add(halo);
    return g;
  }

  private createShadeVisual(): ShadeVisual {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x160826,
      emissive: 0x4c1d95,
      emissiveIntensity: 0.7,
      roughness: 0.5,
    });
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.7, 10), bodyMat);
    body.position.y = 0.1;
    body.castShadow = true;
    group.add(body);

    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.48, 12, 12), bodyMat);
    hood.position.y = 0.72;
    group.add(hood);

    // Eerie violet eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xd8b4fe });
    const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), eyeMat);
    leftEye.position.set(-0.16, 0.76, 0.4);
    group.add(leftEye);

    const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), eyeMat);
    rightEye.position.set(0.16, 0.76, 0.4);
    group.add(rightEye);

    // Stun halo ring
    const stunRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.65, 0.05, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xfde047 })
    );
    stunRing.rotation.x = Math.PI / 2;
    stunRing.position.y = 1.35;
    stunRing.visible = false;
    group.add(stunRing);

    this.scene.add(group);
    return { group, bodyMat, stunRing };
  }

  resetDynamicVisuals(): void {
    for (const v of this.lanternVisuals.values()) this.scene.remove(v.group);
    this.lanternVisuals.clear();
    for (const m of this.moteMeshes.values()) this.scene.remove(m);
    this.moteMeshes.clear();
    for (const s of this.shadeVisuals.values()) this.scene.remove(s.group);
    this.shadeVisuals.clear();
  }

  render(sim: GameSimulation, camYawDeg: number, dt: number): void {
    this.elapsed += dt;

    // 1. Progressive island brightening as lanterns light up (0..5)
    const litCount = sim.lanterns.filter((l) => l.lit).length;
    const progress = sim.lanterns.length > 0 ? litCount / sim.lanterns.length : 0;

    const bgColor = new THREE.Color(0x080c1c).lerp(new THREE.Color(0x1f2a4c), progress);
    this.scene.background = bgColor;
    this.fog.color.copy(bgColor);
    this.fog.density = 0.019 - progress * 0.009;
    this.ambientLight.intensity = 0.55 + progress * 0.85;
    this.hemiLight.intensity = 0.45 + progress * 0.65;
    this.moonLight.intensity = 0.65 + progress * 0.75;
    this.moonLight.color.setHex(0xb8c7ff).lerp(new THREE.Color(0xffdfa0), progress * 0.75);

    // Drift sea of clouds softly
    for (const cloud of this.clouds) {
      cloud.userData.angle += cloud.userData.speed * dt;
      cloud.position.x = Math.cos(cloud.userData.angle) * cloud.userData.dist;
      cloud.position.z = Math.sin(cloud.userData.angle) * cloud.userData.dist;
    }

    // 2. Sync Mây character
    this.playerGroup.position.set(sim.player.x, sim.player.y, sim.player.z);
    this.playerGroup.rotation.y = sim.player.facingYaw;
    const invulnBlink =
      sim.player.invulnTimer > 0 && Math.floor(this.elapsed * 16) % 2 === 0;
    this.playerGroup.visible = !invulnBlink;

    // Gentle hanging lantern sway & intensity scaling with carried motes
    this.hatLanternGroup.rotation.z = Math.sin(this.elapsed * 4.5) * 0.14;
    this.playerLight.intensity = 1.8 + sim.player.carried * 0.55;

    // Leg walk bob (only when moving)
    const swing = sim.playerMoving ? Math.sin(this.elapsed * 10) * 0.32 : 0;
    this.leftLeg.rotation.x = swing;
    this.rightLeg.rotation.x = -swing;

    // Orbiting carried firefly orbs
    for (let i = 0; i < this.carriedOrbs.length; i++) {
      const orb = this.carriedOrbs[i];
      if (i < sim.player.carried) {
        orb.visible = true;
        const a = this.elapsed * 2.6 + (i / Math.max(1, sim.player.carried)) * Math.PI * 2;
        orb.position.set(Math.cos(a) * 0.75, 1.05 + Math.sin(a * 2) * 0.15, Math.sin(a) * 0.75);
      } else {
        orb.visible = false;
      }
    }

    // 3. Sync pulse wave visual
    const ticksSincePulse = sim.simTick - sim.lastPulseTick;
    if (ticksSincePulse >= 0 && ticksSincePulse < 24) {
      const t = ticksSincePulse / 24;
      const radius = 0.5 + t * sim.tuning.pulse_radius;
      this.pulseRing.visible = true;
      this.pulseRing.position.set(sim.lastPulsePos[0], 0.14, sim.lastPulsePos[2]);
      this.pulseRing.scale.set(radius, 1, radius);
      this.pulseRingMat.opacity = (1 - t) * 0.85;
      this.pulseLight.position.set(sim.lastPulsePos[0], 1.5, sim.lastPulsePos[2]);
      this.pulseLight.intensity = (1 - t) * 7.0;
    } else {
      this.pulseRing.visible = false;
      this.pulseLight.intensity = 0;
    }

    // 4. Sync 5 Great Lanterns
    for (const lantern of sim.lanterns) {
      const vis = this.ensureLanternVisual(lantern, sim);
      vis.group.position.set(lantern.x, lantern.y, lantern.z);
      const fillRatio = lantern.deposited / sim.tuning.lantern_cost;
      if (lantern.lit) {
        vis.coreMat.color.setHex(0xffe082);
        vis.coreMat.emissiveIntensity = 2.4 + Math.sin(this.elapsed * 3.2) * 0.25;
        vis.light.intensity = 5.5;
        vis.safeRing.visible = true;
      } else {
        vis.coreMat.color.setHex(0x374151).lerp(new THREE.Color(0xf59e0b), fillRatio * 0.65);
        vis.coreMat.emissiveIntensity = 0.12 + fillRatio * 0.9;
        vis.light.intensity = fillRatio * 1.4;
        vis.safeRing.visible = false;
      }
      for (let i = 0; i < vis.orbMeshes.length; i++) {
        vis.orbMeshes[i].visible = !lantern.lit && i < lantern.deposited;
      }
    }

    // 5. Sync Firefly Motes (floating bob is purely visual; logical position is ground Y=0)
    const activeMoteIds = new Set<string>();
    for (let i = 0; i < sim.motes.length; i++) {
      const mote = sim.motes[i];
      activeMoteIds.add(mote.id);
      let mesh = this.moteMeshes.get(mote.id);
      if (!mesh) {
        mesh = this.createMoteMesh();
        this.moteMeshes.set(mote.id, mesh);
        this.scene.add(mesh);
      }
      const bobY = 0.95 + Math.sin(this.elapsed * 3.0 + i * 1.3) * 0.24;
      mesh.position.set(mote.x, bobY, mote.z);
    }
    for (const [id, mesh] of this.moteMeshes.entries()) {
      if (!activeMoteIds.has(id)) {
        this.scene.remove(mesh);
        this.moteMeshes.delete(id);
      }
    }

    // 6. Sync Ink Shades
    const activeShadeIds = new Set<string>();
    for (let i = 0; i < sim.shades.length; i++) {
      const shade = sim.shades[i];
      activeShadeIds.add(shade.id);
      let vis = this.shadeVisuals.get(shade.id);
      if (!vis) {
        vis = this.createShadeVisual();
        this.shadeVisuals.set(shade.id, vis);
      }
      const hover = Math.sin(this.elapsed * 4.2 + i) * 0.15;
      vis.group.position.set(shade.x, shade.y + hover, shade.z);

      if (shade.state === 'stunned') {
        vis.stunRing.visible = true;
        vis.group.rotation.y += dt * 7;
        vis.bodyMat.emissive.setHex(0x9333ea);
        vis.bodyMat.emissiveIntensity = 1.2;
      } else {
        vis.stunRing.visible = false;
        const faceYaw = Math.atan2(sim.player.x - shade.x, sim.player.z - shade.z);
        vis.group.rotation.y = shade.state === 'flee' ? faceYaw + Math.PI : faceYaw;
        vis.bodyMat.emissive.setHex(0x4c1d95);
        vis.bodyMat.emissiveIntensity = 0.7;
      }
    }
    for (const [id, vis] of this.shadeVisuals.entries()) {
      if (!activeShadeIds.has(id)) {
        this.scene.remove(vis.group);
        this.shadeVisuals.delete(id);
      }
    }

    // 7. Third-person camera following Mây aligned with camYawDeg
    // Forward direction for camYawDeg is (+sin(theta), +cos(theta)); place camera behind it
    const theta = (camYawDeg * Math.PI) / 180;
    const camDist = 11.5;
    const camHeight = 6.8;
    const targetCamPos = new THREE.Vector3(
      sim.player.x - Math.sin(theta) * camDist,
      sim.player.y + camHeight,
      sim.player.z - Math.cos(theta) * camDist
    );
    this.camera.position.lerp(targetCamPos, Math.min(1, dt * 8));
    this.camera.lookAt(sim.player.x, sim.player.y + 1.25, sim.player.z);

    this.renderer.render(this.scene, this.camera);
  }
}
