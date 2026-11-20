import * as THREE from 'three';
import { PALETTE } from '../core/config';
import { NIGHT3_BELL_TOWER_RADIUS } from '../core/maps';
import type { GameSimulation } from '../core/simulation';
import type { LanternEntity, Vec3 } from '../core/types';

interface LanternVisual {
  group: THREE.Group;
  core: THREE.Mesh;
  coreMat: THREE.MeshLambertMaterial;
  cap: THREE.Mesh;
  tearGroup: THREE.Group;
  light: THREE.PointLight;
  safeRing: THREE.Mesh;
  fuelBarGroup: THREE.Group;
  fuelBarFill: THREE.Mesh;
  fuelBarFillMat: THREE.MeshBasicMaterial;
  orbMeshes: THREE.Mesh[];
}

export interface ScreenEdgeArrow {
  visible: boolean;
  x: number;
  y: number;
  angleDeg: number;
}

interface CloudInstanceData {
  angle: number;
  dist: number;
  speed: number;
  baseY: number;
  offX: number;
  offY: number;
  offZ: number;
  sx: number;
  sy: number;
  sz: number;
}

const MAX_SHADE_INSTANCES = 256;
const MAX_MOTE_INSTANCES = 160;

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

  // GPU-Instanced pools: Shades (5 draw calls), Motes (2 draw calls), Clouds (1 draw call)
  private readonly shadeBodyMat: THREE.MeshLambertMaterial;
  private readonly shadeRimMat: THREE.MeshBasicMaterial;
  private readonly shadeBodyInst: THREE.InstancedMesh;
  private readonly shadeHoodInst: THREE.InstancedMesh;
  private readonly shadeRimInst: THREE.InstancedMesh;
  private readonly shadeEyesInst: THREE.InstancedMesh;
  private readonly shadeStunInst: THREE.InstancedMesh;
  private readonly moteCoreInst: THREE.InstancedMesh;
  private readonly moteHaloInst: THREE.InstancedMesh;
  private readonly cloudInst: THREE.InstancedMesh;
  private readonly cloudData: CloudInstanceData[] = [];

  private readonly lanternVisuals = new Map<string, LanternVisual>();
  private readonly drifterMeshes = new Map<string, THREE.Group>();
  private readonly charmMeshes = new Map<string, THREE.Group>();
  private readonly windLeaves: THREE.Points;

  private readonly tempColor = new THREE.Color();
  private readonly tempVec = new THREE.Vector3();

  private builtNight: 1 | 2 | 3 | null = null;
  private colorblindMode = false;
  private reduceMotion = false;
  private shakeTimeLeft = 0;
  private elapsed = 0;

  constructor(canvas: HTMLCanvasElement, benchMode = false) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(benchMode ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;

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

    this.ambientLight = new THREE.AmbientLight(0xdce6ff, 0.15);
    this.scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0x6d7ec4, PALETTE.cloudSea, 0.45);
    this.scene.add(this.hemiLight);

    this.moonLight = new THREE.DirectionalLight(0xcddaff, 0.72);
    this.moonLight.position.set(28, 45, -24);
    this.moonLight.castShadow = true;
    this.moonLight.shadow.mapSize.set(512, 512);
    this.moonLight.shadow.camera.near = 5;
    this.moonLight.shadow.camera.far = 140;
    const d = 48;
    this.moonLight.shadow.camera.left = -d;
    this.moonLight.shadow.camera.right = d;
    this.moonLight.shadow.camera.top = d;
    this.moonLight.shadow.camera.bottom = -d;
    this.scene.add(this.moonLight);

    this.scene.add(this.worldGroup);

    // GPU-Instanced Cloud Sea (72 cloud puffs -> 1 draw call, zero transparent overdraw)
    this.cloudInst = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 7, 6),
      new THREE.MeshLambertMaterial({
        color: PALETTE.cloudSea,
        emissive: 0x0d2635,
      }),
      24 * 3
    );
    this.cloudInst.frustumCulled = false;
    this.scene.add(this.cloudInst);
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

    // GPU-Instanced Shades (200 shades = 5 draw calls total, Lambert shading for 60+ FPS on iGPU)
    this.shadeBodyMat = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      emissive: PALETTE.shadeRim,
      emissiveIntensity: 0.45,
    });
    this.shadeRimMat = new THREE.MeshBasicMaterial({ color: PALETTE.shadeRim });

    this.shadeBodyInst = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.62, 1.7, 7),
      this.shadeBodyMat,
      MAX_SHADE_INSTANCES
    );
    this.shadeBodyInst.count = 0;
    this.shadeBodyInst.frustumCulled = false;
    this.scene.add(this.shadeBodyInst);

    this.shadeHoodInst = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.48, 7, 6),
      this.shadeBodyMat,
      MAX_SHADE_INSTANCES
    );
    this.shadeHoodInst.count = 0;
    this.shadeHoodInst.frustumCulled = false;
    this.scene.add(this.shadeHoodInst);

    const rimGeo = new THREE.TorusGeometry(0.56, 0.045, 4, 12);
    rimGeo.rotateX(Math.PI / 2);
    this.shadeRimInst = new THREE.InstancedMesh(rimGeo, this.shadeRimMat, MAX_SHADE_INSTANCES);
    this.shadeRimInst.count = 0;
    this.shadeRimInst.frustumCulled = false;
    this.scene.add(this.shadeRimInst);

    this.shadeEyesInst = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.08, 5, 5),
      this.shadeRimMat,
      MAX_SHADE_INSTANCES * 2
    );
    this.shadeEyesInst.count = 0;
    this.shadeEyesInst.frustumCulled = false;
    this.scene.add(this.shadeEyesInst);

    const stunGeo = new THREE.TorusGeometry(0.65, 0.05, 5, 14);
    stunGeo.rotateX(Math.PI / 2);
    this.shadeStunInst = new THREE.InstancedMesh(
      stunGeo,
      new THREE.MeshBasicMaterial({ color: PALETTE.goldScore }),
      MAX_SHADE_INSTANCES
    );
    this.shadeStunInst.count = 0;
    this.shadeStunInst.frustumCulled = false;
    this.scene.add(this.shadeStunInst);

    // GPU-Instanced Motes (100 motes = 2 draw calls total)
    this.moteCoreInst = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.22, 6, 6),
      new THREE.MeshBasicMaterial({ color: PALETTE.moteCore }),
      MAX_MOTE_INSTANCES
    );
    this.moteCoreInst.count = 0;
    this.moteCoreInst.frustumCulled = false;
    this.scene.add(this.moteCoreInst);

    this.moteHaloInst = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.42, 6, 6),
      new THREE.MeshBasicMaterial({
        color: PALETTE.moteHalo,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      }),
      MAX_MOTE_INSTANCES
    );
    this.moteHaloInst.count = 0;
    this.moteHaloInst.frustumCulled = false;
    this.scene.add(this.moteHaloInst);

    // Expanding golden pulse ring
    const ringGeo = new THREE.RingGeometry(0.86, 1.0, 36);
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

    // Wind leaf particles
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

  /** Writes a Y-rotated, scaled, translated 4x4 matrix directly into an InstancedMesh buffer (zero allocations). */
  private static writeYawMatrix(
    arr: Float32Array,
    index: number,
    x: number,
    y: number,
    z: number,
    cosY: number,
    sinY: number,
    sx: number,
    sy: number,
    sz: number
  ): void {
    const o = index * 16;
    arr[o] = cosY * sx;
    arr[o + 1] = 0;
    arr[o + 2] = -sinY * sx;
    arr[o + 3] = 0;

    arr[o + 4] = 0;
    arr[o + 5] = sy;
    arr[o + 6] = 0;
    arr[o + 7] = 0;

    arr[o + 8] = sinY * sz;
    arr[o + 9] = 0;
    arr[o + 10] = cosY * sz;
    arr[o + 11] = 0;

    arr[o + 12] = x;
    arr[o + 13] = y;
    arr[o + 14] = z;
    arr[o + 15] = 1;
  }

  getRendererDescription(): string {
    const gl = this.renderer.getContext();
    let gpu = 'WebGL';
    try {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = dbg
        ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
        : String(gl.getParameter(gl.RENDERER));
    } catch {
      // Fallback
    }
    return `Three.js r${THREE.REVISION} (WebGL2 — ${gpu})`;
  }

  setColorblindMode(enabled: boolean): void {
    this.colorblindMode = enabled;
    const rimHex = enabled ? PALETTE.shadeRimColorblind : PALETTE.shadeRim;
    this.shadeBodyMat.emissive.setHex(rimHex);
    this.shadeRimMat.color.setHex(rimHex);
  }

  setReduceMotion(enabled: boolean): void {
    this.reduceMotion = enabled;
    if (enabled) this.shakeTimeLeft = 0;
  }

  triggerCameraShake(durationS = 0.25): void {
    if (!this.reduceMotion) {
      this.shakeTimeLeft = Math.max(this.shakeTimeLeft, durationS);
    }
  }

  private buildSkyAndClouds(): void {
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(5.2, 16, 16),
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
      new THREE.PointsMaterial({
        color: PALETTE.moteCore,
        size: 0.75,
        transparent: true,
        opacity: 0.85,
      })
    );
    this.scene.add(stars);

    const seaPlane = new THREE.Mesh(
      new THREE.CylinderGeometry(200, 200, 1, 24),
      new THREE.MeshLambertMaterial({
        color: PALETTE.cloudSea,
        emissive: 0x091c26,
      })
    );
    seaPlane.position.set(25, -13.5, 0);
    this.scene.add(seaPlane);

    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const dist = 62 + (i % 3) * 18;
      const speed = 0.009 + (i % 3) * 0.003;
      const baseY = -6.5 - (i % 3) * 1.4;
      for (let p = 0; p < 3; p++) {
        const r = 5 + (p % 2) * 2;
        this.cloudData.push({
          angle,
          dist,
          speed,
          baseY,
          offX: (p - 1) * 4.5,
          offY: (p % 2) * 0.9,
          offZ: p * 1.4,
          sx: r * 1.3,
          sy: r * 0.5,
          sz: r,
        });
      }
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
    const shore = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius - 1.2, 2.2, 36),
      sandMat
    );
    shore.position.set(cx, topY - 1.1, cz);
    shore.receiveShadow = true;
    this.worldGroup.add(shore);

    const grass = new THREE.Mesh(
      new THREE.CylinderGeometry(Math.max(1, radius - 2.2), Math.max(1, radius - 2.0), 0.06, 36),
      grassMat
    );
    grass.position.set(cx, topY - 0.01, cz);
    grass.receiveShadow = true;
    this.worldGroup.add(grass);

    const underside = new THREE.Mesh(new THREE.ConeGeometry(radius - 1.5, 11, 16), rockMat);
    underside.rotation.x = Math.PI;
    underside.position.set(cx, topY - 7.7, cz);
    this.worldGroup.add(underside);
  }

  private buildJumpPadMesh(x: number, y: number, z: number): void {
    const padGroup = new THREE.Group();
    padGroup.position.set(x, y, z);

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 1.15, 0.22, 16),
      new THREE.MeshLambertMaterial({
        color: PALETTE.goldScore,
        emissive: PALETTE.lanternLit,
        emissiveIntensity: 0.75,
      })
    );
    disc.position.y = 0.11;
    padGroup.add(disc);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.95, 0.07, 6, 20),
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

    const grassMat = new THREE.MeshLambertMaterial({ color: PALETTE.grass });
    const sandMat = new THREE.MeshLambertMaterial({ color: PALETTE.sand });
    const woodMat = new THREE.MeshLambertMaterial({ color: PALETTE.wood });
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x1b2438 });

    if (sim.night === 1) {
      this.buildIslandMesh(0, 0, 40, 0, grassMat, sandMat, rockMat);
      const postInst = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.22, 0.28, 1.1, 6),
        woodMat,
        12
      );
      const arr = postInst.instanceMatrix.array as Float32Array;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        Renderer3D.writeYawMatrix(
          arr,
          i,
          Math.cos(a) * 38.2,
          0.55,
          Math.sin(a) * 38.2,
          1,
          0,
          1,
          1,
          1
        );
      }
      postInst.instanceMatrix.needsUpdate = true;
      this.worldGroup.add(postInst);
    } else if (sim.night === 2) {
      this.buildIslandMesh(0, 0, 28, 0, grassMat, sandMat, rockMat);
      this.buildIslandMesh(70, 0, 28, 0, grassMat, sandMat, rockMat);

      const bridge = new THREE.Mesh(new THREE.BoxGeometry(18, 0.35, 4), woodMat);
      bridge.position.set(35, -0.175, 0);
      bridge.receiveShadow = true;
      this.worldGroup.add(bridge);

      const slatInst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.06, 4.1), sandMat, 9);
      const arr = slatInst.instanceMatrix.array as Float32Array;
      for (let i = 0; i < 9; i++) {
        Renderer3D.writeYawMatrix(arr, i, 27 + i * 2, 0.02, 0, 1, 0, 1, 1, 1);
      }
      slatInst.instanceMatrix.needsUpdate = true;
      this.worldGroup.add(slatInst);
    } else {
      this.buildIslandMesh(0, 0, 45, 0, grassMat, sandMat, rockMat);

      const tier1Shape = new THREE.Shape();
      tier1Shape.absarc(0, 0, 24, 0, Math.PI, false);
      tier1Shape.lineTo(-12, 0);
      tier1Shape.absarc(0, 0, 12, Math.PI, 0, true);
      tier1Shape.closePath();
      const tier1Geo = new THREE.ExtrudeGeometry(tier1Shape, { depth: 3.0, bevelEnabled: false });
      tier1Geo.rotateX(Math.PI / 2);
      const tier1Mesh = new THREE.Mesh(tier1Geo, grassMat);
      tier1Mesh.position.y = 3.0;
      tier1Mesh.receiveShadow = true;
      this.worldGroup.add(tier1Mesh);

      const tier2 = new THREE.Mesh(new THREE.CylinderGeometry(8, 8.2, 6, 28), sandMat);
      tier2.position.set(0, 3.0, 0);
      tier2.receiveShadow = true;
      this.worldGroup.add(tier2);

      const tier2Grass = new THREE.Mesh(new THREE.CylinderGeometry(7.3, 7.3, 0.06, 28), grassMat);
      tier2Grass.position.set(0, 6.0, 0);
      tier2Grass.receiveShadow = true;
      this.worldGroup.add(tier2Grass);

      for (const ramp of sim.map.ramps) {
        const rad = (ramp.angleDeg * Math.PI) / 180;
        const midR = (ramp.footRadius + ramp.topRadius) / 2;
        const slopeLen = Math.hypot(ramp.footRadius - ramp.topRadius, ramp.topY);
        const slopeAngle = Math.atan2(ramp.topY, ramp.footRadius - ramp.topRadius);

        const rampGroup = new THREE.Group();
        rampGroup.position.set(Math.cos(rad) * midR, ramp.topY / 2, Math.sin(rad) * midR);
        rampGroup.rotation.y = -rad;

        const deck = new THREE.Mesh(
          new THREE.BoxGeometry(slopeLen + 0.3, 0.3, ramp.halfWidth * 2),
          woodMat
        );
        deck.rotation.z = -slopeAngle;
        deck.receiveShadow = true;
        rampGroup.add(deck);
        this.worldGroup.add(rampGroup);
      }

      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(NIGHT3_BELL_TOWER_RADIUS, NIGHT3_BELL_TOWER_RADIUS, 8, 12),
        woodMat
      );
      tower.position.set(0, 10, 0);
      tower.castShadow = true;
      tower.receiveShadow = true;
      this.worldGroup.add(tower);

      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(2.9, 2.2, 10),
        new THREE.MeshLambertMaterial({ color: PALETTE.mayScarfCharm })
      );
      roof.position.set(0, 15.1, 0);
      this.worldGroup.add(roof);

      const bell = new THREE.Mesh(
        new THREE.ConeGeometry(0.75, 1.1, 10),
        new THREE.MeshLambertMaterial({
          color: PALETTE.goldScore,
          emissive: PALETTE.lanternLit,
          emissiveIntensity: 0.35,
        })
      );
      bell.position.set(0, 12.6, 0);
      this.worldGroup.add(bell);
    }

    for (const pad of sim.map.jumpPads) {
      this.buildJumpPadMesh(pad.x, pad.y, pad.z);
    }
  }

  private buildMayCharacter() {
    const group = new THREE.Group();

    const legMat = new THREE.MeshLambertMaterial({ color: PALETTE.wood });
    const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.25, 4, 6), legMat);
    leftLeg.position.set(-0.14, 0.24, 0);
    leftLeg.castShadow = true;
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.25, 4, 6), legMat);
    rightLeg.position.set(0.14, 0.24, 0);
    rightLeg.castShadow = true;
    group.add(rightLeg);

    const cloak = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 0.88, 10),
      new THREE.MeshLambertMaterial({ color: PALETTE.mayCloak })
    );
    cloak.position.y = 0.78;
    cloak.castShadow = true;
    group.add(cloak);

    const scarf = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.07, 6, 12),
      new THREE.MeshLambertMaterial({ color: PALETTE.mayScarfCharm })
    );
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 1.18;
    group.add(scarf);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 10, 10),
      new THREE.MeshLambertMaterial({ color: 0xfde0c4 })
    );
    head.position.y = 1.38;
    head.castShadow = true;
    group.add(head);

    const hat = new THREE.Mesh(
      new THREE.ConeGeometry(0.66, 0.42, 16, 1, true),
      new THREE.MeshLambertMaterial({
        color: PALETTE.sand,
        side: THREE.DoubleSide,
      })
    );
    hat.position.y = 1.66;
    hat.castShadow = true;
    group.add(hat);

    const hatLanternGroup = new THREE.Group();
    hatLanternGroup.position.set(0, 1.48, 0.56);

    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.24, 5),
      new THREE.MeshBasicMaterial({ color: PALETTE.wood })
    );
    cord.position.y = -0.12;
    hatLanternGroup.add(cord);

    const miniLantern = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 8, 8),
      new THREE.MeshBasicMaterial({ color: PALETTE.lanternCore })
    );
    miniLantern.scale.set(0.9, 1.25, 0.9);
    miniLantern.position.y = -0.28;
    hatLanternGroup.add(miniLantern);

    const playerLight = new THREE.PointLight(PALETTE.lanternLit, 2.2, 12);
    playerLight.position.set(0, -0.28, 0);
    hatLanternGroup.add(playerLight);
    group.add(hatLanternGroup);

    const carriedOrbs: THREE.Mesh[] = [];
    const orbGeo = new THREE.SphereGeometry(0.075, 6, 6);
    const orbMat = new THREE.MeshBasicMaterial({ color: PALETTE.moteCore });
    for (let i = 0; i < 20; i++) {
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
      new THREE.MeshLambertMaterial({ color: PALETTE.lanternOff })
    );
    base.position.y = 0.25;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.34, 2.4, 8),
      new THREE.MeshLambertMaterial({ color: PALETTE.wood })
    );
    pillar.position.y = 1.6;
    pillar.castShadow = true;
    group.add(pillar);

    const coreMat = new THREE.MeshLambertMaterial({
      color: PALETTE.lanternOff,
      emissive: PALETTE.lanternLit,
      emissiveIntensity: 0.08,
    });
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.68, 1), coreMat);
    core.position.y = 3.15;
    group.add(core);

    const tearGroup = new THREE.Group();
    tearGroup.position.y = 3.15;
    const tearMat = new THREE.MeshBasicMaterial({ color: 0x161822, side: THREE.DoubleSide });
    for (let t = 0; t < 4; t++) {
      const ang = (t / 4) * Math.PI * 2 + 0.4;
      const slash = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.72), tearMat);
      slash.position.set(Math.cos(ang) * 0.67, t % 2 === 0 ? 0.06 : -0.06, Math.sin(ang) * 0.67);
      slash.lookAt(Math.cos(ang) * 2, slash.position.y, Math.sin(ang) * 2);
      slash.rotateZ(t % 2 === 0 ? 0.35 : -0.4);
      tearGroup.add(slash);
    }
    group.add(tearGroup);

    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(1.15, 0.65, 8),
      new THREE.MeshLambertMaterial({ color: PALETTE.mayScarfCharm })
    );
    cap.position.y = 3.95;
    cap.castShadow = true;
    group.add(cap);

    const fuelBarGroup = new THREE.Group();
    fuelBarGroup.position.y = 4.75;
    const fuelBg = new THREE.Mesh(
      new THREE.PlaneGeometry(1.56, 0.24),
      new THREE.MeshBasicMaterial({ color: 0x0e1430, side: THREE.DoubleSide })
    );
    fuelBarGroup.add(fuelBg);

    const fuelBarFillMat = new THREE.MeshBasicMaterial({
      color: PALETTE.lanternLit,
      side: THREE.DoubleSide,
    });
    const fuelBarFill = new THREE.Mesh(new THREE.PlaneGeometry(1.44, 0.14), fuelBarFillMat);
    fuelBarFill.position.z = 0.01;
    fuelBarGroup.add(fuelBarFill);
    fuelBarGroup.visible = false;
    group.add(fuelBarGroup);

    const light = new THREE.PointLight(PALETTE.lanternLit, 0, 18);
    light.position.y = 3.2;
    group.add(light);

    const safeGeo = new THREE.RingGeometry(
      sim.tuning.safe_radius - 0.14,
      sim.tuning.safe_radius,
      36
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
        new THREE.SphereGeometry(0.1, 6, 6),
        new THREE.MeshBasicMaterial({ color: PALETTE.moteHalo })
      );
      orb.position.set(Math.cos(a) * 1.2, 0.72, Math.sin(a) * 1.2);
      orb.visible = false;
      group.add(orb);
      orbMeshes.push(orb);
    }

    this.scene.add(group);
    const vis: LanternVisual = {
      group,
      core,
      coreMat,
      cap,
      tearGroup,
      light,
      safeRing,
      fuelBarGroup,
      fuelBarFill,
      fuelBarFillMat,
      orbMeshes,
    };
    this.lanternVisuals.set(lantern.id, vis);
    return vis;
  }

  private createDrifterMesh(): THREE.Group {
    const group = new THREE.Group();
    const silkMat = new THREE.MeshLambertMaterial({
      color: PALETTE.drifter,
      emissive: 0x3b4d63,
      emissiveIntensity: 0.5,
      side: THREE.DoubleSide,
    });
    group.add(new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 1.8), silkMat));

    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.1, 6), silkMat);
    tail.rotation.x = Math.PI / 2;
    tail.position.z = -1.2;
    group.add(tail);

    this.scene.add(group);
    return group;
  }

  private createCharmMesh(): THREE.Group {
    const group = new THREE.Group();
    group.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.85, 0.08),
        new THREE.MeshLambertMaterial({
          color: PALETTE.mayScarfCharm,
          emissive: PALETTE.mayScarfCharm,
          emissiveIntensity: 0.6,
        })
      )
    );
    group.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(0.58, 0.93, 0.05),
        new THREE.MeshBasicMaterial({ color: PALETTE.goldScore })
      )
    );
    this.scene.add(group);
    return group;
  }

  resetDynamicVisuals(): void {
    this.builtNight = null;
    for (const v of this.lanternVisuals.values()) this.scene.remove(v.group);
    this.lanternVisuals.clear();
    for (const d of this.drifterMeshes.values()) this.scene.remove(d);
    this.drifterMeshes.clear();
    for (const c of this.charmMeshes.values()) this.scene.remove(c);
    this.charmMeshes.clear();
    this.shadeBodyInst.count = 0;
    this.shadeHoodInst.count = 0;
    this.shadeRimInst.count = 0;
    this.shadeEyesInst.count = 0;
    this.shadeStunInst.count = 0;
    this.moteCoreInst.count = 0;
    this.moteHaloInst.count = 0;
  }

  computeOffscreenPointArrow(wx: number, wy: number, wz: number): ScreenEdgeArrow {
    this.tempVec.set(wx, wy, wz).project(this.camera);
    const inFront = this.tempVec.z < 1;
    const onScreen =
      inFront &&
      this.tempVec.x >= -0.92 &&
      this.tempVec.x <= 0.92 &&
      this.tempVec.y >= -0.88 &&
      this.tempVec.y <= 0.88;
    if (onScreen) return { visible: false, x: 0, y: 0, angleDeg: 0 };

    let nx = this.tempVec.x;
    let ny = this.tempVec.y;
    if (!inFront) {
      nx = -nx;
      ny = -ny;
    }

    const angleRad = Math.atan2(-ny, nx);
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pad = 46;
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

  computeOffscreenLanternArrow(sim: GameSimulation): ScreenEdgeArrow {
    let nearest: LanternEntity | null = null;
    let bestD = Infinity;
    for (const l of sim.lanterns) {
      if (!sim.isLowFuel(l)) continue;
      const d = Math.hypot(l.x - sim.player.x, l.z - sim.player.z);
      if (d < bestD) {
        bestD = d;
        nearest = l;
      }
    }
    if (!nearest) {
      for (const l of sim.lanterns) {
        if (l.lit) continue;
        const d = Math.hypot(l.x - sim.player.x, l.z - sim.player.z);
        if (d < bestD) {
          bestD = d;
          nearest = l;
        }
      }
    }
    if (!nearest) return { visible: false, x: 0, y: 0, angleDeg: 0 };
    return this.computeOffscreenPointArrow(nearest.x, nearest.y + 3.0, nearest.z);
  }

  private syncInstancedMotesAndShades(sim: GameSimulation): void {
    // 1. GPU-Instanced Motes (zero Object3D allocations)
    const moteCount = Math.min(sim.motes.length, MAX_MOTE_INSTANCES);
    this.moteCoreInst.count = moteCount;
    this.moteHaloInst.count = moteCount;
    const coreArr = this.moteCoreInst.instanceMatrix.array as Float32Array;
    const haloArr = this.moteHaloInst.instanceMatrix.array as Float32Array;
    for (let i = 0; i < moteCount; i++) {
      const m = sim.motes[i];
      const bobY = m.y + 0.9 + Math.sin(this.elapsed * 3.1 + i * 1.2) * 0.22;
      Renderer3D.writeYawMatrix(coreArr, i, m.x, bobY, m.z, 1, 0, 1, 1, 1);
      Renderer3D.writeYawMatrix(haloArr, i, m.x, bobY, m.z, 1, 0, 1, 1, 1);
    }
    this.moteCoreInst.instanceMatrix.needsUpdate = true;
    this.moteHaloInst.instanceMatrix.needsUpdate = true;

    // 2. GPU-Instanced Shades (direct flat matrix writes)
    const shadeCount = Math.min(sim.shades.length, MAX_SHADE_INSTANCES);
    this.shadeBodyInst.count = shadeCount;
    this.shadeHoodInst.count = shadeCount;
    this.shadeRimInst.count = shadeCount;
    this.shadeEyesInst.count = shadeCount * 2;

    const bodyArr = this.shadeBodyInst.instanceMatrix.array as Float32Array;
    const hoodArr = this.shadeHoodInst.instanceMatrix.array as Float32Array;
    const rimArr = this.shadeRimInst.instanceMatrix.array as Float32Array;
    const eyeArr = this.shadeEyesInst.instanceMatrix.array as Float32Array;
    const stunArr = this.shadeStunInst.instanceMatrix.array as Float32Array;
    let stunIdx = 0;

    for (let i = 0; i < shadeCount; i++) {
      const shade = sim.shades[i];
      const hover = Math.sin(this.elapsed * 4.2 + i) * 0.14;
      const baseY = shade.y + hover;

      let yaw: number;
      let sx = 1;
      let sy = 1;
      if (shade.state === 'stunned') {
        yaw = this.elapsed * 7 + i;
        this.tempColor.setHex(PALETTE.shadeStunned);
      } else if (shade.state === 'drain') {
        const pulseScale = 1 + Math.sin(this.elapsed * 8) * 0.08;
        sx = pulseScale;
        sy = 0.92;
        const targetL = sim.lanterns.find((l) => l.id === shade.targetLanternId);
        yaw = targetL
          ? Math.atan2(targetL.x - shade.x, targetL.z - shade.z)
          : Math.atan2(sim.player.x - shade.x, sim.player.z - shade.z);
        this.tempColor.setHex(PALETTE.shadeBody);
      } else if (shade.state === 'wander') {
        yaw = Math.atan2(Math.cos(shade.wanderAngle), Math.sin(shade.wanderAngle));
        this.tempColor.setHex(PALETTE.shadeBody);
      } else {
        const faceYaw = Math.atan2(sim.player.x - shade.x, sim.player.z - shade.z);
        yaw = shade.state === 'recoil' ? faceYaw + Math.PI : faceYaw;
        this.tempColor.setHex(PALETTE.shadeBody);
      }

      const sinY = Math.sin(yaw);
      const cosY = Math.cos(yaw);

      Renderer3D.writeYawMatrix(bodyArr, i, shade.x, baseY + 0.1, shade.z, cosY, sinY, sx, sy, sx);
      Renderer3D.writeYawMatrix(
        hoodArr,
        i,
        shade.x,
        baseY + 0.72 * sy,
        shade.z,
        cosY,
        sinY,
        sx,
        sy,
        sx
      );
      Renderer3D.writeYawMatrix(rimArr, i, shade.x, baseY - 0.3, shade.z, cosY, sinY, sx, 1, sx);

      this.shadeBodyInst.setColorAt(i, this.tempColor);
      this.shadeHoodInst.setColorAt(i, this.tempColor);

      const eyeY = baseY + 0.76 * sy;
      const lx = -0.16 * cosY + 0.4 * sinY;
      const lz = 0.16 * sinY + 0.4 * cosY;
      Renderer3D.writeYawMatrix(eyeArr, i * 2, shade.x + lx, eyeY, shade.z + lz, 1, 0, 1, 1, 1);

      const rx = 0.16 * cosY + 0.4 * sinY;
      const rz = -0.16 * sinY + 0.4 * cosY;
      Renderer3D.writeYawMatrix(
        eyeArr,
        i * 2 + 1,
        shade.x + rx,
        eyeY,
        shade.z + rz,
        1,
        0,
        1,
        1,
        1
      );

      if (shade.state === 'stunned') {
        Renderer3D.writeYawMatrix(
          stunArr,
          stunIdx++,
          shade.x,
          baseY + 1.35,
          shade.z,
          cosY,
          sinY,
          1,
          1,
          1
        );
      }
    }

    this.shadeStunInst.count = stunIdx;
    this.shadeBodyInst.instanceMatrix.needsUpdate = true;
    this.shadeHoodInst.instanceMatrix.needsUpdate = true;
    this.shadeRimInst.instanceMatrix.needsUpdate = true;
    this.shadeEyesInst.instanceMatrix.needsUpdate = true;
    this.shadeStunInst.instanceMatrix.needsUpdate = true;
    if (this.shadeBodyInst.instanceColor) this.shadeBodyInst.instanceColor.needsUpdate = true;
    if (this.shadeHoodInst.instanceColor) this.shadeHoodInst.instanceColor.needsUpdate = true;
  }

  private syncSharedScene(sim: GameSimulation, dt: number): void {
    this.elapsed += dt;
    this.rebuildWorldForNight(sim);

    const litCount = sim.lanterns.filter((l) => l.lit).length;
    const progress = sim.lanterns.length > 0 ? litCount / sim.lanterns.length : 0;
    this.ambientLight.intensity = 0.15 + 0.55 * progress;
    this.hemiLight.intensity = 0.35 + 0.45 * progress;
    this.fog.density = 0.012 - progress * 0.005;

    // Update GPU-instanced cloud puffs (1 draw call total)
    const cloudArr = this.cloudInst.instanceMatrix.array as Float32Array;
    for (let i = 0; i < this.cloudData.length; i++) {
      const c = this.cloudData[i];
      c.angle += c.speed * dt;
      Renderer3D.writeYawMatrix(
        cloudArr,
        i,
        20 + Math.cos(c.angle) * c.dist + c.offX,
        c.baseY + c.offY,
        Math.sin(c.angle) * c.dist + c.offZ,
        1,
        0,
        c.sx,
        c.sy,
        c.sz
      );
    }
    this.cloudInst.instanceMatrix.needsUpdate = true;

    // Wind leaves
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
      !this.reduceMotion && sim.player.invulnTimer > 0 && Math.floor(this.elapsed * 16) % 2 === 0;
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
    const lowFuelBlink1Hz = this.reduceMotion ? true : Math.sin(this.elapsed * Math.PI * 2) >= 0;
    for (const lantern of sim.lanterns) {
      const vis = this.ensureLanternVisual(lantern, sim);
      vis.group.position.set(lantern.x, lantern.y, lantern.z);
      const requiredCost = sim.getLanternLightCost(lantern);
      const fillRatio = requiredCost > 0 ? lantern.deposited / requiredCost : 0;

      if (lantern.lit) {
        const fuel = sim.getLanternFuel(lantern);
        const fuelRatio = Math.max(0, Math.min(1, fuel / sim.tuning.fuel_max));
        const lowFuel = sim.isLowFuel(lantern);

        vis.core.scale.set(1.0, 1.0, 1.0);
        vis.cap.position.y = 3.95;
        vis.tearGroup.visible = false;
        vis.safeRing.visible = sim.hasSafeZone(lantern);

        if (lowFuel) {
          vis.coreMat.color.setHex(lowFuelBlink1Hz ? PALETTE.lanternCore : PALETTE.lanternLit);
          vis.coreMat.emissive.setHex(PALETTE.lanternLit);
          vis.coreMat.emissiveIntensity = lowFuelBlink1Hz ? 2.1 : 0.45;
          vis.light.intensity = lowFuelBlink1Hz ? 4.4 : 1.1;
          vis.fuelBarGroup.visible = lowFuelBlink1Hz;
          vis.fuelBarFillMat.color.setHex(
            this.colorblindMode ? PALETTE.uiDangerColorblind : PALETTE.uiDanger
          );
        } else {
          vis.coreMat.color.setHex(PALETTE.lanternCore);
          vis.coreMat.emissive.setHex(PALETTE.lanternLit);
          vis.coreMat.emissiveIntensity = 2.3 + Math.sin(this.elapsed * 3.2) * 0.2;
          vis.light.intensity = 5.5;
          vis.fuelBarGroup.visible = true;
          vis.fuelBarFillMat.color.setHex(PALETTE.lanternLit);
        }

        const clampedBar = Math.max(0.02, fuelRatio);
        vis.fuelBarFill.scale.x = clampedBar;
        vis.fuelBarFill.position.x = -(1 - clampedBar) * 0.72;
        vis.fuelBarGroup.lookAt(this.camera.position);
      } else {
        vis.core.scale.set(1.0, 0.8, 1.0);
        vis.cap.position.y = 3.81;
        vis.tearGroup.visible = true;
        vis.fuelBarGroup.visible = false;
        vis.coreMat.color
          .setHex(PALETTE.lanternOff)
          .lerp(this.tempColor.setHex(PALETTE.lanternLit), fillRatio * 0.65);
        vis.coreMat.emissiveIntensity = 0.1 + fillRatio * 0.9;
        vis.light.intensity = fillRatio * 1.3;
        vis.safeRing.visible = false;
      }
      for (let i = 0; i < vis.orbMeshes.length; i++) {
        vis.orbMeshes[i].visible = !lantern.lit && i < lantern.deposited;
      }
    }

    this.syncInstancedMotesAndShades(sim);

    // Drifters
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

    // Wind Charms
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
  }

  render(sim: GameSimulation, camYawDeg: number, dt: number): void {
    const theta = (camYawDeg * Math.PI) / 180;
    const camDist = 12.0;
    const camHeight = 7.2;
    this.tempVec.set(
      sim.player.x - Math.sin(theta) * camDist,
      Math.max(2.0, sim.player.y + camHeight),
      sim.player.z - Math.cos(theta) * camDist
    );
    this.camera.position.lerp(this.tempVec, Math.min(1, dt * 8));

    if (this.shakeTimeLeft > 0 && !this.reduceMotion) {
      this.shakeTimeLeft = Math.max(0, this.shakeTimeLeft - dt);
      const amp = this.shakeTimeLeft * 1.6;
      this.camera.position.x += Math.sin(this.elapsed * 65) * amp;
      this.camera.position.y += Math.cos(this.elapsed * 55) * amp * 0.6;
    }

    this.camera.lookAt(sim.player.x, sim.player.y + 1.2, sim.player.z);
    this.syncSharedScene(sim, dt);
    this.renderer.render(this.scene, this.camera);
  }

  renderBench(sim: GameSimulation, camPos: Vec3, dt: number): void {
    this.camera.position.set(camPos[0], camPos[1], camPos[2]);
    this.camera.lookAt(0, 0, 0);
    this.syncSharedScene(sim, dt);
    this.renderer.render(this.scene, this.camera);
  }
}
