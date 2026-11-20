import * as THREE from 'three';
import { PALETTE } from '../core/config';
import { NIGHT3_BELL_TOWER_RADIUS } from '../core/maps';
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
  rimMat: THREE.MeshBasicMaterial;
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

  private readonly worldGroup = new THREE.Group();
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
  private readonly drifterMeshes = new Map<string, THREE.Group>();
  private readonly charmMeshes = new Map<string, THREE.Group>();
  private readonly windLeaves: THREE.Points;
  private readonly clouds: THREE.Group[] = [];

  private builtNight: 1 | 2 | 3 | null = null;
  private elapsed = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.sky);
    this.fog = new THREE.FogExp2(PALETTE.fog, 0.011);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      320
    );

    // Exact Ticket-02 ambient lighting formula: 0.15 + 0.55 * (lit / total)
    this.ambientLight = new THREE.AmbientLight(0xdce6ff, 0.15);
    this.scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0x6d7ec4, PALETTE.cloudSea, 0.45);
    this.scene.add(this.hemiLight);

    this.moonLight = new THREE.DirectionalLight(0xcddaff, 0.72);
    this.moonLight.position.set(28, 45, -24);
    this.moonLight.castShadow = true;
    this.moonLight.shadow.mapSize.set(1024, 1024);
    this.moonLight.shadow.camera.near = 5;
    this.moonLight.shadow.camera.far = 160;
    const d = 55;
    this.moonLight.shadow.camera.left = -d;
    this.moonLight.shadow.camera.right = d;
    this.moonLight.shadow.camera.top = d;
    this.moonLight.shadow.camera.bottom = -d;
    this.scene.add(this.moonLight);

    this.scene.add(this.worldGroup);
    this.buildSkyAndClouds();

    const { group, hatLanternGroup, playerLight, leftLeg, rightLeg, carriedOrbs } =
      this.buildMayCharacter();
    this.playerGroup = group;
    this.hatLanternGroup = hatLanternGroup;
    this.playerLight = playerLight;
    this.leftLeg = leftLeg;
    this.rightLeg = rightLeg;
    this.carriedOrbs = carriedOrbs;
    this.scene.add(this.playerGroup);

    // Expanding warm golden pulse ring
    const ringGeo = new THREE.RingGeometry(0.86, 1.0, 48);
    ringGeo.rotateX(-Math.PI / 2);
    this.pulseRingMat = new THREE.MeshBasicMaterial({
      color: PALETTE.lanternLit,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    this.pulseRing = new THREE.Mesh(ringGeo, this.pulseRingMat);
    this.pulseRing.visible = false;
    this.scene.add(this.pulseRing);

    this.pulseLight = new THREE.PointLight(PALETTE.lanternLit, 0, 14);
    this.scene.add(this.pulseLight);

    // Wind leaf particles (visible during Night 3 wind warning & gust)
    const leafCount = 120;
    const leafPos = new Float32Array(leafCount * 3);
    for (let i = 0; i < leafCount; i++) {
      leafPos[i * 3] = ((i * 37) % 80) - 40;
      leafPos[i * 3 + 1] = 0.8 + ((i * 19) % 10);
      leafPos[i * 3 + 2] = ((i * 53) % 80) - 40;
    }
    const leafGeo = new THREE.BufferGeometry();
    leafGeo.setAttribute('position', new THREE.BufferAttribute(leafPos, 3));
    this.windLeaves = new THREE.Points(
      leafGeo,
      new THREE.PointsMaterial({
        color: PALETTE.moteHalo,
        size: 0.45,
        transparent: true,
        opacity: 0.85,
      })
    );
    this.windLeaves.visible = false;
    this.scene.add(this.windLeaves);

    window.addEventListener('resize', this.handleResize);
  }

  private handleResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private buildSkyAndClouds(): void {
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(5.2, 20, 20),
      new THREE.MeshBasicMaterial({ color: PALETTE.lanternCore })
    );
    moon.position.set(70, 75, -95);
    this.scene.add(moon);

    const starCount = 260;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const t = i / starCount;
      const theta = i * 2.3999632;
      const phi = Math.acos(0.14 + t * 0.82);
      const r = 165;
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.cos(phi) + 12;
      starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: PALETTE.moteCore, size: 0.75, transparent: true, opacity: 0.85 })
    );
    this.scene.add(stars);

    // Sea of clouds below islands (#12384A)
    const seaPlane = new THREE.Mesh(
      new THREE.CylinderGeometry(200, 200, 1, 32),
      new THREE.MeshStandardMaterial({
        color: PALETTE.cloudSea,
        emissive: 0x091c26,
        roughness: 0.95,
      })
    );
    seaPlane.position.set(25, -13.5, 0);
    this.scene.add(seaPlane);

    const cloudMat = new THREE.MeshStandardMaterial({
      color: PALETTE.cloudSea,
      emissive: 0x0d2635,
      roughness: 1.0,
      transparent: true,
      opacity: 0.86,
    });
    for (let i = 0; i < 24; i++) {
      const cloud = new THREE.Group();
      const angle = (i / 24) * Math.PI * 2;
      const dist = 62 + (i % 3) * 18;
      for (let p = 0; p < 3; p++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(5 + (p % 2) * 2, 8, 7), cloudMat);
        puff.position.set((p - 1) * 4.5, (p % 2) * 0.9, p * 1.4);
        puff.scale.set(1.3, 0.5, 1.0);
        cloud.add(puff);
      }
      cloud.position.set(20 + Math.cos(angle) * dist, -6.5 - (i % 3) * 1.4, Math.sin(angle) * dist);
      cloud.userData = { angle, dist, speed: 0.009 + (i % 3) * 0.003 };
      this.clouds.push(cloud);
      this.scene.add(cloud);
    }
  }

  private buildIslandMesh(
    cx: number,
    cz: number,
    radius: number,
    topY: number,
    grassMat: THREE.Material,
    sandMat: THREE.Material,
    rockMat: THREE.Material
  ): void {
    // Sand shoreline ring + lush grass top strictly at topY
    const shore = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius - 1.2, 2.2, 48), sandMat);
    shore.position.set(cx, topY - 1.1, cz);
    shore.receiveShadow = true;
    this.worldGroup.add(shore);

    const grass = new THREE.Mesh(
      new THREE.CylinderGeometry(Math.max(1, radius - 2.2), Math.max(1, radius - 2.0), 0.06, 48),
      grassMat
    );
    grass.position.set(cx, topY - 0.01, cz);
    grass.receiveShadow = true;
    this.worldGroup.add(grass);

    const underside = new THREE.Mesh(new THREE.ConeGeometry(radius - 1.5, 11, 20), rockMat);
    underside.rotation.x = Math.PI;
    underside.position.set(cx, topY - 7.7, cz);
    this.worldGroup.add(underside);
  }

  private buildJumpPadMesh(x: number, y: number, z: number): void {
    const padGroup = new THREE.Group();
    padGroup.position.set(x, y, z);

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 1.15, 0.22, 20),
      new THREE.MeshStandardMaterial({
        color: PALETTE.goldScore,
        emissive: PALETTE.lanternLit,
        emissiveIntensity: 0.85,
        roughness: 0.35,
      })
    );
    disc.position.y = 0.11;
    padGroup.add(disc);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.95, 0.07, 8, 24),
      new THREE.MeshBasicMaterial({ color: PALETTE.lanternCore })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.25;
    padGroup.add(ring);
    this.worldGroup.add(padGroup);
  }

  private rebuildWorldForNight(sim: GameSimulation): void {
    if (this.builtNight === sim.night) return;
    this.builtNight = sim.night;

    while (this.worldGroup.children.length > 0) {
      this.worldGroup.remove(this.worldGroup.children[0]);
    }

    const grassMat = new THREE.MeshStandardMaterial({ color: PALETTE.grass, roughness: 0.9 });
    const sandMat = new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 0.92 });
    const woodMat = new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.85 });
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x1b2438, roughness: 0.95 });

    if (sim.night === 1) {
      // Đêm 1 — Đảo Bến (r = 40 m)
      this.buildIslandMesh(0, 0, 40, 0, grassMat, sandMat, rockMat);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 1.1, 8), woodMat);
        post.position.set(Math.cos(a) * 38.2, 0.55, Math.sin(a) * 38.2);
        post.castShadow = true;
        this.worldGroup.add(post);
      }
    } else if (sim.night === 2) {
      // Đêm 2 — Đảo Cau: 2 islands r=28m at (0,0) and (70,0) + bamboo bridge x∈[26,44], z∈[-2,2]
      this.buildIslandMesh(0, 0, 28, 0, grassMat, sandMat, rockMat);
      this.buildIslandMesh(70, 0, 28, 0, grassMat, sandMat, rockMat);

      const bridge = new THREE.Mesh(new THREE.BoxGeometry(18, 0.35, 4), woodMat);
      bridge.position.set(35, -0.175, 0);
      bridge.receiveShadow = true;
      bridge.castShadow = true;
      this.worldGroup.add(bridge);

      // Decorative bamboo slats across bridge
      for (let x = 27; x <= 43; x += 2) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 4.1), sandMat);
        slat.position.set(x, 0.02, 0);
        this.worldGroup.add(slat);
      }
    } else {
      // Đêm 3 — Đảo Chuông: 3 tiers (r=45 Y=0; Tier 1 annulus r=12..24 z>0 Y=3; Tier 2 disk r=8 Y=6; 2 ramps; Bell Tower)
      this.buildIslandMesh(0, 0, 45, 0, grassMat, sandMat, rockMat);

      // Tier 1 half-annulus (r = 12..24, z > 0, Y = 0..3)
      const tier1Shape = new THREE.Shape();
      tier1Shape.absarc(0, 0, 24, 0, Math.PI, false);
      tier1Shape.lineTo(-12, 0);
      tier1Shape.absarc(0, 0, 12, Math.PI, 0, true);
      tier1Shape.closePath();
      const tier1Geo = new THREE.ExtrudeGeometry(tier1Shape, { depth: 3.0, bevelEnabled: false });
      // Map shape (x, y>=0) -> world (x, z>=0) and extrude depth along +Y!
      tier1Geo.rotateX(Math.PI / 2);
      const tier1Mesh = new THREE.Mesh(tier1Geo, grassMat);
      tier1Mesh.position.y = 3.0;
      tier1Mesh.receiveShadow = true;
      tier1Mesh.castShadow = true;
      this.worldGroup.add(tier1Mesh);

      // Tier 2 disk (r = 8, Y = 0..6)
      const tier2 = new THREE.Mesh(new THREE.CylinderGeometry(8, 8.2, 6, 36), sandMat);
      tier2.position.set(0, 3.0, 0);
      tier2.receiveShadow = true;
      tier2.castShadow = true;
      this.worldGroup.add(tier2);

      const tier2Grass = new THREE.Mesh(new THREE.CylinderGeometry(7.3, 7.3, 0.06, 36), grassMat);
      tier2Grass.position.set(0, 6.0, 0);
      tier2Grass.receiveShadow = true;
      this.worldGroup.add(tier2Grass);

      // Two straight wooden ramps at 30° and 150° from r=30 (Y=0) to r=24 (Y=3), width 3m
      for (const ramp of sim.map.ramps) {
        const rad = (ramp.angleDeg * Math.PI) / 180;
        const midR = (ramp.footRadius + ramp.topRadius) / 2;
        const slopeLen = Math.hypot(ramp.footRadius - ramp.topRadius, ramp.topY);
        const slopeAngle = Math.atan2(ramp.topY, ramp.footRadius - ramp.topRadius);

        const rampGroup = new THREE.Group();
        rampGroup.position.set(Math.cos(rad) * midR, ramp.topY / 2, Math.sin(rad) * midR);
        // Local +X points outward along radial angle
        rampGroup.rotation.y = -rad;

        const deck = new THREE.Mesh(new THREE.BoxGeometry(slopeLen + 0.3, 0.3, ramp.halfWidth * 2), woodMat);
        // Slopes UP toward -X (center): positive Z rotation lifts -X? No, negative Z rotation lifts -X!
        deck.rotation.z = -slopeAngle;
        deck.receiveShadow = true;
        deck.castShadow = true;
        rampGroup.add(deck);
        this.worldGroup.add(rampGroup);
      }

      // Bell Tower at center of Tier 2 (cylinder r=2m, height 8m, Y=6..14)
      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(NIGHT3_BELL_TOWER_RADIUS, NIGHT3_BELL_TOWER_RADIUS, 8, 16),
        woodMat
      );
      tower.position.set(0, 10, 0);
      tower.castShadow = true;
      tower.receiveShadow = true;
      this.worldGroup.add(tower);

      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(2.9, 2.2, 12),
        new THREE.MeshStandardMaterial({ color: PALETTE.mayScarfCharm, roughness: 0.7 })
      );
      roof.position.set(0, 15.1, 0);
      this.worldGroup.add(roof);

      const bell = new THREE.Mesh(
        new THREE.ConeGeometry(0.75, 1.1, 12),
        new THREE.MeshStandardMaterial({
          color: PALETTE.goldScore,
          emissive: PALETTE.lanternLit,
          emissiveIntensity: 0.35,
          metalness: 0.6,
          roughness: 0.3,
        })
      );
      bell.position.set(0, 12.6, 0);
      this.worldGroup.add(bell);
    }

    // Jump pads for Night 2 & 3
    for (const pad of sim.map.jumpPads) {
      this.buildJumpPadMesh(pad.x, pad.y, pad.z);
    }
  }

  private buildMayCharacter() {
    const group = new THREE.Group();

    const legMat = new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.85 });
    const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.25, 4, 8), legMat);
    leftLeg.position.set(-0.14, 0.24, 0);
    leftLeg.castShadow = true;
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.25, 4, 8), legMat);
    rightLeg.position.set(0.14, 0.24, 0);
    rightLeg.castShadow = true;
    group.add(rightLeg);

    // Mây's cloak (#E8E2D0) & red scarf (#C8102E)
    const cloak = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 0.88, 12),
      new THREE.MeshStandardMaterial({ color: PALETTE.mayCloak, roughness: 0.75 })
    );
    cloak.position.y = 0.78;
    cloak.castShadow = true;
    group.add(cloak);

    const scarf = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.07, 8, 16),
      new THREE.MeshStandardMaterial({ color: PALETTE.mayScarfCharm, roughness: 0.7 })
    );
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 1.18;
    group.add(scarf);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 14, 14),
      new THREE.MeshStandardMaterial({ color: 0xfde0c4, roughness: 0.65 })
    );
    head.position.y = 1.38;
    head.castShadow = true;
    group.add(head);

    // Conical hat (Nón lá)
    const hat = new THREE.Mesh(
      new THREE.ConeGeometry(0.66, 0.42, 20, 1, true),
      new THREE.MeshStandardMaterial({
        color: PALETTE.sand,
        roughness: 0.8,
        side: THREE.DoubleSide,
      })
    );
    hat.position.y = 1.66;
    hat.castShadow = true;
    group.add(hat);

    // Hanging mini-lantern on brim
    const hatLanternGroup = new THREE.Group();
    hatLanternGroup.position.set(0, 1.48, 0.56);

    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.24, 6),
      new THREE.MeshBasicMaterial({ color: PALETTE.wood })
    );
    cord.position.y = -0.12;
    hatLanternGroup.add(cord);

    const miniLantern = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 10, 10),
      new THREE.MeshStandardMaterial({
        color: PALETTE.lanternCore,
        emissive: PALETTE.lanternLit,
        emissiveIntensity: 1.8,
      })
    );
    miniLantern.scale.set(0.9, 1.25, 0.9);
    miniLantern.position.y = -0.28;
    hatLanternGroup.add(miniLantern);

    const playerLight = new THREE.PointLight(PALETTE.lanternLit, 2.2, 12);
    playerLight.position.set(0, -0.28, 0);
    hatLanternGroup.add(playerLight);
    group.add(hatLanternGroup);

    // Orbiting carried firefly indicators (up to 10)
    const carriedOrbs: THREE.Mesh[] = [];
    const orbGeo = new THREE.SphereGeometry(0.075, 8, 8);
    const orbMat = new THREE.MeshBasicMaterial({ color: PALETTE.moteCore });
    for (let i = 0; i < 10; i++) {
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

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.15, 0.5, 8),
      new THREE.MeshStandardMaterial({ color: PALETTE.lanternOff, roughness: 0.9 })
    );
    base.position.y = 0.25;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.34, 2.4, 8),
      new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.85 })
    );
    pillar.position.y = 1.6;
    pillar.castShadow = true;
    group.add(pillar);

    const coreMat = new THREE.MeshStandardMaterial({
      color: PALETTE.lanternOff,
      emissive: PALETTE.lanternLit,
      emissiveIntensity: 0.08,
      roughness: 0.4,
    });
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.68, 1), coreMat);
    core.position.y = 3.15;
    group.add(core);

    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(1.15, 0.65, 8),
      new THREE.MeshStandardMaterial({ color: PALETTE.mayScarfCharm, roughness: 0.75 })
    );
    cap.position.y = 3.95;
    cap.castShadow = true;
    group.add(cap);

    const light = new THREE.PointLight(PALETTE.lanternLit, 0, 18);
    light.position.y = 3.2;
    group.add(light);

    const safeGeo = new THREE.RingGeometry(
      sim.tuning.safe_radius - 0.14,
      sim.tuning.safe_radius,
      48
    );
    safeGeo.rotateX(-Math.PI / 2);
    const safeRing = new THREE.Mesh(
      safeGeo,
      new THREE.MeshBasicMaterial({
        color: PALETTE.lanternLit,
        transparent: true,
        opacity: 0.36,
        side: THREE.DoubleSide,
      })
    );
    safeRing.position.y = 0.05;
    safeRing.visible = false;
    group.add(safeRing);

    const orbMeshes: THREE.Mesh[] = [];
    for (let i = 0; i < sim.tuning.lantern_cost; i++) {
      const a = (i / sim.tuning.lantern_cost) * Math.PI * 2;
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 8, 8),
        new THREE.MeshBasicMaterial({ color: PALETTE.moteHalo })
      );
      orb.position.set(Math.cos(a) * 1.2, 0.72, Math.sin(a) * 1.2);
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
    g.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 10, 10),
        new THREE.MeshBasicMaterial({ color: PALETTE.moteCore })
      )
    );
    g.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 10, 10),
        new THREE.MeshBasicMaterial({
          color: PALETTE.moteHalo,
          transparent: true,
          opacity: 0.35,
        })
      )
    );
    return g;
  }

  private createShadeVisual(): ShadeVisual {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: PALETTE.shadeBody,
      emissive: PALETTE.shadeRim,
      emissiveIntensity: 0.55,
      roughness: 0.5,
    });
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.7, 10), bodyMat);
    body.position.y = 0.1;
    body.castShadow = true;
    group.add(body);

    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.48, 12, 12), bodyMat);
    hood.position.y = 0.72;
    group.add(hood);

    const rimMat = new THREE.MeshBasicMaterial({ color: PALETTE.shadeRim });
    const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), rimMat);
    leftEye.position.set(-0.16, 0.76, 0.4);
    group.add(leftEye);

    const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), rimMat);
    rightEye.position.set(0.16, 0.76, 0.4);
    group.add(rightEye);

    const stunRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.65, 0.05, 8, 24),
      new THREE.MeshBasicMaterial({ color: PALETTE.goldScore })
    );
    stunRing.rotation.x = Math.PI / 2;
    stunRing.position.y = 1.35;
    stunRing.visible = false;
    group.add(stunRing);

    this.scene.add(group);
    return { group, bodyMat, rimMat, stunRing };
  }

  private createDrifterMesh(): THREE.Group {
    const group = new THREE.Group();
    const silkMat = new THREE.MeshStandardMaterial({
      color: PALETTE.drifter,
      emissive: 0x3b4d63,
      emissiveIntensity: 0.5,
      roughness: 0.4,
      side: THREE.DoubleSide,
    });
    const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 1.8), silkMat);
    group.add(ribbon);

    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.1, 6), silkMat);
    tail.rotation.x = Math.PI / 2;
    tail.position.z = -1.2;
    group.add(tail);

    this.scene.add(group);
    return group;
  }

  private createCharmMesh(): THREE.Group {
    const group = new THREE.Group();
    const talisman = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.85, 0.08),
      new THREE.MeshStandardMaterial({
        color: PALETTE.mayScarfCharm,
        emissive: PALETTE.mayScarfCharm,
        emissiveIntensity: 0.6,
      })
    );
    group.add(talisman);

    const border = new THREE.Mesh(
      new THREE.BoxGeometry(0.58, 0.93, 0.05),
      new THREE.MeshBasicMaterial({ color: PALETTE.goldScore })
    );
    group.add(border);

    this.scene.add(group);
    return group;
  }

  resetDynamicVisuals(): void {
    this.builtNight = null;
    for (const v of this.lanternVisuals.values()) this.scene.remove(v.group);
    this.lanternVisuals.clear();
    for (const m of this.moteMeshes.values()) this.scene.remove(m);
    this.moteMeshes.clear();
    for (const s of this.shadeVisuals.values()) this.scene.remove(s.group);
    this.shadeVisuals.clear();
    for (const d of this.drifterMeshes.values()) this.scene.remove(d);
    this.drifterMeshes.clear();
    for (const c of this.charmMeshes.values()) this.scene.remove(c);
    this.charmMeshes.clear();
  }

  computeOffscreenLanternArrow(sim: GameSimulation): {
    visible: boolean;
    x: number;
    y: number;
    angleDeg: number;
  } {
    let nearest: LanternEntity | null = null;
    let bestD = Infinity;
    for (const l of sim.lanterns) {
      if (l.lit) continue;
      const d = Math.hypot(l.x - sim.player.x, l.z - sim.player.z);
      if (d < bestD) {
        bestD = d;
        nearest = l;
      }
    }
    if (!nearest) return { visible: false, x: 0, y: 0, angleDeg: 0 };

    const worldPos = new THREE.Vector3(nearest.x, nearest.y + 3.0, nearest.z);
    const projected = worldPos.clone().project(this.camera);

    const inFront = projected.z < 1;
    const onScreen =
      inFront &&
      projected.x >= -0.92 &&
      projected.x <= 0.92 &&
      projected.y >= -0.88 &&
      projected.y <= 0.88;
    if (onScreen) return { visible: false, x: 0, y: 0, angleDeg: 0 };

    let nx = projected.x;
    let ny = projected.y;
    if (!inFront) {
      nx = -nx;
      ny = -ny;
    }

    const angleRad = Math.atan2(-ny, nx);
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pad = 44;
    const cx = w / 2;
    const cy = h / 2;
    const rx = cx - pad;
    const ry = cy - pad;

    const dirX = Math.cos(angleRad);
    const dirY = Math.sin(angleRad);
    const scale = Math.min(
      Math.abs(dirX) > 1e-4 ? rx / Math.abs(dirX) : Infinity,
      Math.abs(dirY) > 1e-4 ? ry / Math.abs(dirY) : Infinity
    );

    return {
      visible: true,
      x: cx + dirX * scale,
      y: cy + dirY * scale,
      angleDeg: (angleRad * 180) / Math.PI + 90,
    };
  }

  render(sim: GameSimulation, camYawDeg: number, dt: number): void {
    this.elapsed += dt;
    this.rebuildWorldForNight(sim);

    // Exact Ticket-02 ambient intensity formula: 0.15 + 0.55 * (lit / total)
    const litCount = sim.lanterns.filter((l) => l.lit).length;
    const progress = sim.lanterns.length > 0 ? litCount / sim.lanterns.length : 0;
    this.ambientLight.intensity = 0.15 + 0.55 * progress;
    this.hemiLight.intensity = 0.35 + 0.45 * progress;
    this.fog.density = 0.012 - progress * 0.005;

    for (const cloud of this.clouds) {
      cloud.userData.angle += cloud.userData.speed * dt;
      cloud.position.x = 20 + Math.cos(cloud.userData.angle) * cloud.userData.dist;
      cloud.position.z = Math.sin(cloud.userData.angle) * cloud.userData.dist;
    }

    // Wind leaves visual on Night 3
    if (sim.wind.active || sim.wind.warning) {
      this.windLeaves.visible = true;
      const rad = (sim.wind.dirDeg * Math.PI) / 180;
      const speed = sim.wind.active ? 18 : 6;
      const posAttr = this.windLeaves.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < posAttr.count; i++) {
        let lx = posAttr.getX(i) + Math.cos(rad) * speed * dt;
        let lz = posAttr.getZ(i) + Math.sin(rad) * speed * dt;
        if (lx > 45) lx -= 90;
        if (lx < -45) lx += 90;
        if (lz > 45) lz -= 90;
        if (lz < -45) lz += 90;
        posAttr.setXYZ(i, lx, posAttr.getY(i), lz);
      }
      posAttr.needsUpdate = true;
    } else {
      this.windLeaves.visible = false;
    }

    // Sync Mây
    this.playerGroup.position.set(sim.player.x, sim.player.y, sim.player.z);
    this.playerGroup.rotation.y = sim.player.facingYaw;
    const invulnBlink =
      sim.player.invulnTimer > 0 && Math.floor(this.elapsed * 16) % 2 === 0;
    this.playerGroup.visible = !sim.player.respawning && !invulnBlink;

    this.hatLanternGroup.rotation.z = Math.sin(this.elapsed * 4.5) * 0.14;
    this.playerLight.intensity = 1.6 + sim.player.carried * 0.35;

    const swing = sim.playerMoving && sim.player.grounded ? Math.sin(this.elapsed * 11) * 0.34 : 0;
    this.leftLeg.rotation.x = swing;
    this.rightLeg.rotation.x = -swing;

    for (let i = 0; i < this.carriedOrbs.length; i++) {
      const orb = this.carriedOrbs[i];
      if (i < sim.player.carried) {
        orb.visible = true;
        const a = this.elapsed * 2.5 + (i / Math.max(1, sim.player.carried)) * Math.PI * 2;
        orb.position.set(Math.cos(a) * 0.8, 1.0 + Math.sin(a * 2) * 0.15, Math.sin(a) * 0.8);
      } else {
        orb.visible = false;
      }
    }

    // Sync Pulse wave
    const ticksSincePulse = sim.simTick - sim.lastPulseTick;
    if (ticksSincePulse >= 0 && ticksSincePulse < 24) {
      const t = ticksSincePulse / 24;
      const radius = 0.5 + t * sim.tuning.pulse_radius;
      this.pulseRing.visible = true;
      this.pulseRing.position.set(sim.lastPulsePos[0], sim.lastPulsePos[1] - 0.6, sim.lastPulsePos[2]);
      this.pulseRing.scale.set(radius, 1, radius);
      this.pulseRingMat.opacity = (1 - t) * 0.85;
      this.pulseLight.position.set(sim.lastPulsePos[0], sim.lastPulsePos[1], sim.lastPulsePos[2]);
      this.pulseLight.intensity = (1 - t) * 6.5;
    } else {
      this.pulseRing.visible = false;
      this.pulseLight.intensity = 0;
    }

    // Sync Lanterns
    for (const lantern of sim.lanterns) {
      const vis = this.ensureLanternVisual(lantern, sim);
      vis.group.position.set(lantern.x, lantern.y, lantern.z);
      const fillRatio = lantern.deposited / sim.tuning.lantern_cost;
      if (lantern.lit) {
        vis.coreMat.color.setHex(PALETTE.lanternCore);
        vis.coreMat.emissive.setHex(PALETTE.lanternLit);
        vis.coreMat.emissiveIntensity = 2.3 + Math.sin(this.elapsed * 3.2) * 0.2;
        vis.light.intensity = 5.5;
        vis.safeRing.visible = true;
      } else {
        vis.coreMat.color
          .setHex(PALETTE.lanternOff)
          .lerp(new THREE.Color(PALETTE.lanternLit), fillRatio * 0.65);
        vis.coreMat.emissiveIntensity = 0.1 + fillRatio * 0.9;
        vis.light.intensity = fillRatio * 1.3;
        vis.safeRing.visible = false;
      }
      for (let i = 0; i < vis.orbMeshes.length; i++) {
        vis.orbMeshes[i].visible = !lantern.lit && i < lantern.deposited;
      }
    }

    // Sync Motes
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
      const bobY = mote.y + 0.9 + Math.sin(this.elapsed * 3.1 + i * 1.2) * 0.22;
      mesh.position.set(mote.x, bobY, mote.z);
    }
    for (const [id, mesh] of this.moteMeshes.entries()) {
      if (!activeMoteIds.has(id)) {
        this.scene.remove(mesh);
        this.moteMeshes.delete(id);
      }
    }

    // Sync Shades
    const activeShadeIds = new Set<string>();
    for (let i = 0; i < sim.shades.length; i++) {
      const shade = sim.shades[i];
      activeShadeIds.add(shade.id);
      let vis = this.shadeVisuals.get(shade.id);
      if (!vis) {
        vis = this.createShadeVisual();
        this.shadeVisuals.set(shade.id, vis);
      }
      const hover = Math.sin(this.elapsed * 4.2 + i) * 0.14;
      vis.group.position.set(shade.x, shade.y + hover, shade.z);

      if (shade.state === 'stunned') {
        vis.stunRing.visible = true;
        vis.group.rotation.y += dt * 7;
        vis.bodyMat.color.setHex(PALETTE.shadeStunned);
        vis.bodyMat.emissiveIntensity = 0.85;
      } else {
        vis.stunRing.visible = false;
        vis.bodyMat.color.setHex(PALETTE.shadeBody);
        vis.bodyMat.emissiveIntensity = shade.state === 'spawning' ? 0.25 : 0.65;
        const faceYaw = Math.atan2(sim.player.x - shade.x, sim.player.z - shade.z);
        vis.group.rotation.y = shade.state === 'recoil' ? faceYaw + Math.PI : faceYaw;
      }
    }
    for (const [id, vis] of this.shadeVisuals.entries()) {
      if (!activeShadeIds.has(id)) {
        this.scene.remove(vis.group);
        this.shadeVisuals.delete(id);
      }
    }

    // Sync Drifters (Gió Lạc)
    const activeDrifterIds = new Set<string>();
    for (let i = 0; i < sim.drifters.length; i++) {
      const d = sim.drifters[i];
      activeDrifterIds.add(d.id);
      let mesh = this.drifterMeshes.get(d.id);
      if (!mesh) {
        mesh = this.createDrifterMesh();
        this.drifterMeshes.set(d.id, mesh);
      }
      mesh.position.set(d.x, d.y + Math.sin(this.elapsed * 5 + i) * 0.2, d.z);
      mesh.rotation.y =
        d.state === 'flee'
          ? Math.atan2(d.x - sim.player.x, d.z - sim.player.z)
          : Math.atan2(sim.player.x - d.x, sim.player.z - d.z);
    }
    for (const [id, mesh] of this.drifterMeshes.entries()) {
      if (!activeDrifterIds.has(id)) {
        this.scene.remove(mesh);
        this.drifterMeshes.delete(id);
      }
    }

    // Sync Wind Charms (Bùa Gió)
    const activeCharmIds = new Set<string>();
    for (let i = 0; i < sim.charms.length; i++) {
      const c = sim.charms[i];
      if (!c.available) continue;
      activeCharmIds.add(c.id);
      let mesh = this.charmMeshes.get(c.id);
      if (!mesh) {
        mesh = this.createCharmMesh();
        this.charmMeshes.set(c.id, mesh);
      }
      mesh.position.set(c.x, c.y + 1.0 + Math.sin(this.elapsed * 3.5 + i) * 0.18, c.z);
      mesh.rotation.y = this.elapsed * 1.8;
    }
    for (const [id, mesh] of this.charmMeshes.entries()) {
      if (!activeCharmIds.has(id)) {
        this.scene.remove(mesh);
        this.charmMeshes.delete(id);
      }
    }

    // Third-person follow camera aligned with camYawDeg
    const theta = (camYawDeg * Math.PI) / 180;
    const camDist = 12.0;
    const camHeight = 7.2;
    const targetCamPos = new THREE.Vector3(
      sim.player.x - Math.sin(theta) * camDist,
      Math.max(2.0, sim.player.y + camHeight),
      sim.player.z - Math.cos(theta) * camDist
    );
    this.camera.position.lerp(targetCamPos, Math.min(1, dt * 8));
    this.camera.lookAt(sim.player.x, sim.player.y + 1.2, sim.player.z);

    this.renderer.render(this.scene, this.camera);
  }
}
