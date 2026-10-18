/**
 * The Adventures of a Dreamy Lass ("Her") — 3D Game for start.ng
 * Follows https://start.ng/docs.md:
 * - Connects to https://start.ng/connect via postMessage (startng:whoami, startng:score, startng:leaderboard)
 * - Supports HTTP API game sessions (startng_session)
 * - Renders the signed-in player's 3D start.ng character style (body, primaryColor, secondaryColor, skinColor, hairColor, hair, hat, accessory)
 */

(() => {
  // =========================================================
  // 1. Talk to start.ng (Connect Page + HTTP Session Support)
  // =========================================================
  const START_NG = 'https://start.ng';
  const API_START_NG = 'https://api.start.ng';
  let frame;

  function connectFrame() {
    frame ??= new Promise((resolve, reject) => {
      const el = document.createElement('iframe');
      el.src = `${START_NG}/connect`;
      el.hidden = true;
      el.onload = () => resolve(el);
      el.onerror = reject;
      document.body.append(el);
    });
    return frame;
  }

  async function askStartNg(message, replyType, timeoutMs = 5000) {
    try {
      const el = await connectFrame();
      return await new Promise((resolve) => {
        const requestId = Math.random().toString(36).slice(2);
        const done = (reply) => {
          clearTimeout(timer);
          removeEventListener('message', onMessage);
          resolve(reply);
        };
        const timer = setTimeout(() => done(null), timeoutMs);
        function onMessage(e) {
          if (e.origin !== START_NG || e.source !== el.contentWindow) return;
          if (e.data?.type === replyType && e.data.requestId === requestId) done(e.data);
        }
        addEventListener('message', onMessage);
        el.contentWindow.postMessage({ ...message, requestId }, START_NG);
      });
    } catch {
      return null;
    }
  }

  // Pick up HTTP API game session if returned in URL hash
  const hashParams = new URLSearchParams(location.hash.slice(1));
  if (hashParams.get('startng_session')) {
    sessionStorage.setItem('startng_session', hashParams.get('startng_session'));
    history.replaceState(null, '', location.pathname + location.search);
  }

  function redirectToStartNgSignIn() {
    location.href = `${START_NG}/?return_to=${encodeURIComponent(location.origin + location.pathname)}`;
  }

  // Default Persona ("Her" - The Dreamy Lass)
  const DEFAULT_HER_STYLE = {
    body: 'female',
    primaryColor: '#383838',
    secondaryColor: '#3a3f5d',
    skinColor: '#9c5a33',
    hairColor: '#17120f',
    hair: 'bun',
    hat: 'beanie',
    accessory: 'none'
  };

  let currentStartNgUser = null; // signed-in user object if any
  let activeCharacterProfile = {
    id: null,
    name: 'Her',
    account: null,
    style: { ...DEFAULT_HER_STYLE },
    face: './assets/persona.png'
  };

  // --- Audio Synthesizer (Web Audio API) ---
  class SoundFX {
    constructor() {
      this.ctx = null;
      this.enabled = true;
    }
    init() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }
    playTone(freq, type = 'sine', duration = 0.16, vol = 0.12, slideTo = null) {
      if (!this.enabled || !this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      if (slideTo) {
        osc.frequency.exponentialRampToValueAtTime(slideTo, this.ctx.currentTime + duration);
      }
      gain.gain.setValueAtTime(vol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    }
    jump() {
      this.playTone(280, 'triangle', 0.22, 0.14, 580);
    }
    ally() {
      this.playTone(440, 'sine', 0.12, 0.14);
      setTimeout(() => this.playTone(587.33, 'sine', 0.14, 0.14), 70);
      setTimeout(() => this.playTone(880, 'triangle', 0.26, 0.16), 140);
    }
    gear() {
      this.playTone(523.25, 'triangle', 0.1, 0.15);
      setTimeout(() => this.playTone(659.25, 'triangle', 0.1, 0.15), 60);
      setTimeout(() => this.playTone(783.99, 'triangle', 0.12, 0.15), 120);
      setTimeout(() => this.playTone(1046.5, 'sine', 0.3, 0.18), 180);
    }
    hit() {
      this.playTone(170, 'sawtooth', 0.3, 0.16, 75);
    }
  }

  const sfx = new SoundFX();

  // --- Game Constants & Realms ---
  const LANES = [-2.6, 0, 2.6];
  const REALMS = [
    { name: 'Zone 1: Lime Meadow', sky: 0xd9f86c, fog: 0xc5ea52, road: 0x2c2f48, side: 0xa4d925, dist: 0 },
    { name: 'Zone 2: Sunset Citadel', sky: 0xffb36b, fog: 0xf5886e, road: 0x38284c, side: 0xe66c5c, dist: 350 },
    { name: 'Zone 3: Starlight Nebula', sky: 0x1c2147, fog: 0x281e54, road: 0x181b30, side: 0x56398f, dist: 800 },
    { name: 'Zone 4: Cyber Horizon', sky: 0x0f3847, fog: 0x114f5c, road: 0x16222f, side: 0x00b894, dist: 1400 }
  ];

  const ALLY_TYPES = [
    { title: 'Creative Mentor', shirt: 0x00e5a3, aura: 0x55efc4, pop: 60 },
    { title: 'Tech Alchemist', shirt: 0xffc83b, aura: 0xffeaa7, pop: 75 },
    { title: 'Kind Storyteller', shirt: 0xff5e97, aura: 0xfd79a8, pop: 65 },
    { title: 'Guild Navigator', shirt: 0x54a0ff, aura: 0x74b9ff, pop: 80 }
  ];

  const EQUIPMENT_ITEMS = [
    { id: 'boots', name: 'Swift Boots', desc: 'Higher Jump & Speed Boost!', color: 0x00e5a3 },
    { id: 'pack', name: 'Explorer Pack', desc: '+25% Stamina Resilience!', color: 0xff9f43 },
    { id: 'charm', name: 'Starlight Charm', desc: 'Attracts Nearby Vibes!', color: 0xffc83b },
    { id: 'compass', name: 'Dream Compass', desc: '1.5x Distance Progress!', color: 0x54a0ff },
    { id: 'mic', name: 'Charisma Mic', desc: '+50% Popularity Gains!', color: 0xff5e97 },
    { id: 'cape', name: 'Holo-Cape', desc: 'Shields 50% Doubt Damage!', color: 0xa29bfe }
  ];

  // --- DOM Elements ---
  const container = document.getElementById('canvas-container');
  const hud = document.getElementById('hud');
  const startScreen = document.getElementById('start-screen');
  const gameoverScreen = document.getElementById('gameover-screen');
  const startBtn = document.getElementById('start-btn');
  const openLbBtn = document.getElementById('open-lb-btn');
  const restartBtn = document.getElementById('restart-btn');
  const soundBtn = document.getElementById('sound-btn');
  const mobileControls = document.getElementById('mobile-controls');

  const playerFaceEl = document.getElementById('player-face');
  const playerNameEl = document.getElementById('player-name');
  const playerAccountEl = document.getElementById('player-account');
  const playerSignInBtn = document.getElementById('player-sign-in');
  const gameoverSignInBtn = document.getElementById('gameover-signin-btn');

  const showcaseAvatarEl = document.getElementById('showcase-avatar');
  const showcaseNameEl = document.getElementById('showcase-name');
  const traitHatEl = document.getElementById('trait-hat');
  const traitFitEl = document.getElementById('trait-fit');

  const popValEl = document.getElementById('pop-val');
  const multValEl = document.getElementById('mult-val');
  const distValEl = document.getElementById('dist-val');
  const vibePctEl = document.getElementById('vibe-pct');
  const staminaFillEl = document.getElementById('stamina-fill');
  const zoneBadgeEl = document.getElementById('zone-badge');
  const invCountEl = document.getElementById('inv-count');
  const toastEl = document.getElementById('interaction-toast');
  const toastIconEl = document.getElementById('toast-icon');
  const toastTitleEl = document.getElementById('toast-title');
  const toastSubEl = document.getElementById('toast-sub');

  playerSignInBtn.addEventListener('click', redirectToStartNgSignIn);
  gameoverSignInBtn.addEventListener('click', redirectToStartNgSignIn);

  // --- Three.js Scene Setup ---
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(REALMS[0].sky);
  scene.fog = new THREE.FogExp2(REALMS[0].fog, 0.015);

  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 140);
  camera.position.set(0, 4.3, 8.2);
  camera.lookAt(0, 1.8, -6);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444466, 0.85);
  hemiLight.position.set(0, 30, 0);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xfffbe6, 0.9);
  dirLight.position.set(12, 26, 16);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  dirLight.shadow.camera.near = 1;
  dirLight.shadow.camera.far = 70;
  const d = 18;
  dirLight.shadow.camera.left = -d;
  dirLight.shadow.camera.right = d;
  dirLight.shadow.camera.top = d;
  dirLight.shadow.camera.bottom = -d;
  scene.add(dirLight);

  // --- Environment ---
  const envGroup = new THREE.Group();
  scene.add(envGroup);

  const roadMat = new THREE.MeshStandardMaterial({ color: REALMS[0].road, roughness: 0.7 });
  const roadMesh = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 160), roadMat);
  roadMesh.rotation.x = -Math.PI / 2;
  roadMesh.position.z = -60;
  roadMesh.receiveShadow = true;
  envGroup.add(roadMesh);

  const lineMat = new THREE.MeshBasicMaterial({ color: 0xd9f86c, transparent: true, opacity: 0.55 });
  [-1.3, 1.3].forEach((xPos) => {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 160), lineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(xPos, 0.02, -60);
    envGroup.add(line);
  });

  const groundMat = new THREE.MeshStandardMaterial({ color: REALMS[0].side, roughness: 0.9 });
  const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.set(0, -0.05, -60);
  groundMesh.receiveShadow = true;
  envGroup.add(groundMesh);

  const sceneryProps = [];
  const treeCrownMat = new THREE.MeshStandardMaterial({ color: 0x3b3f63, roughness: 0.5 });
  const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x6e472b, roughness: 0.8 });

  for (let i = 0; i < 24; i++) {
    const prop = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.4, 8), treeTrunkMat);
    trunk.position.y = 0.7;
    trunk.castShadow = true;
    prop.add(trunk);

    const crown = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 1), treeCrownMat);
    crown.position.y = 2.1;
    crown.castShadow = true;
    prop.add(crown);

    const side = i % 2 === 0 ? -1 : 1;
    prop.position.set(side * (6.2 + Math.random() * 6), 0, -i * 6.5);
    envGroup.add(prop);
    sceneryProps.push(prop);
  }

  // =========================================================
  // 2. Build 3D Player Character (Supports Her + all start.ng styles)
  // =========================================================
  function createPlayerCharacter() {
    const root = new THREE.Group();

    const skinMat = new THREE.MeshStandardMaterial({ color: 0x9c5a33, roughness: 0.45 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: 0x383838, roughness: 0.5 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x3a3f5d, roughness: 0.55 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x17120f, roughness: 0.65 });
    const hatMat = new THREE.MeshStandardMaterial({ color: 0x3a3c38, roughness: 0.5 });
    const brimMat = new THREE.MeshStandardMaterial({ color: 0x353957, roughness: 0.5 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xffc83b, metalness: 0.6, roughness: 0.25 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x32302d, roughness: 0.4 });
    const lipMat = new THREE.MeshStandardMaterial({ color: 0xe06a8b, roughness: 0.3 });

    // Torso
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.28, 1.05, 16), shirtMat);
    torso.position.y = 1.65;
    torso.castShadow = true;
    root.add(torso);

    // Hips
    const hips = new THREE.Mesh(new THREE.SphereGeometry(0.33, 16, 12), pantsMat);
    hips.scale.set(1, 0.75, 0.88);
    hips.position.y = 1.12;
    hips.castShadow = true;
    root.add(hips);

    // Neck & Head
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.28, 12), skinMat);
    neck.position.y = 2.26;
    root.add(neck);

    const headGroup = new THREE.Group();
    headGroup.position.y = 2.58;
    root.add(headGroup);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 20), skinMat);
    head.scale.set(0.92, 1.08, 0.95);
    head.castShadow = true;
    headGroup.add(head);

    // Eyes & Lips
    const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
    [-0.09, 0.09].forEach((x) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), eyeWhiteMat);
      eye.position.set(x, 0.04, 0.24);
      headGroup.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), pupilMat);
      pupil.position.set(x, 0.04, 0.265);
      headGroup.add(pupil);
    });

    const lips = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.04), lipMat);
    lips.position.set(0, -0.09, 0.25);
    headGroup.add(lips);

    // Hair Styles Container
    const hairGroup = new THREE.Group();
    headGroup.add(hairGroup);

    // Hat Styles Container
    const hatGroup = new THREE.Group();
    headGroup.add(hatGroup);

    // Accessory Container
    const accGroup = new THREE.Group();
    headGroup.add(accGroup);

    // Puff Sleeves & Arms
    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-0.42, 2.05, 0);
    root.add(leftArmPivot);

    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(0.42, 2.05, 0);
    root.add(rightArmPivot);

    [leftArmPivot, rightArmPivot].forEach((pivot) => {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 14), shirtMat);
      puff.scale.set(0.95, 1.2, 0.95);
      puff.position.y = -0.05;
      puff.castShadow = true;
      pivot.add(puff);

      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.72, 12), skinMat);
      arm.position.y = -0.46;
      arm.castShadow = true;
      pivot.add(arm);

      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), skinMat);
      hand.position.y = -0.84;
      pivot.add(hand);
    });

    // Legs & Shoes
    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.17, 1.05, 0);
    root.add(leftLegPivot);

    const rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.17, 1.05, 0);
    root.add(rightLegPivot);

    const bootMeshes = [];

    [leftLegPivot, rightLegPivot].forEach((pivot) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.11, 0.95, 14), pantsMat);
      leg.position.y = -0.48;
      leg.castShadow = true;
      pivot.add(leg);

      const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 12), shoeMat.clone());
      shoe.scale.set(0.95, 0.65, 1.45);
      shoe.position.set(0, -0.96, 0.06);
      shoe.castShadow = true;
      pivot.add(shoe);
      bootMeshes.push(shoe);
    });

    // Visual Equipment Upgrades
    const packMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.55, 0.24),
      new THREE.MeshStandardMaterial({ color: 0xff9f43, roughness: 0.4 })
    );
    packMesh.position.set(0, 1.68, -0.32);
    packMesh.visible = false;
    root.add(packMesh);

    const capeMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.75, 1.25),
      new THREE.MeshStandardMaterial({
        color: 0xa29bfe,
        emissive: 0x6c5ce7,
        emissiveIntensity: 0.35,
        side: THREE.DoubleSide
      })
    );
    capeMesh.position.set(0, 1.45, -0.36);
    capeMesh.rotation.x = 0.22;
    capeMesh.visible = false;
    root.add(capeMesh);

    const charmHalo = new THREE.Mesh(
      new THREE.TorusGeometry(0.65, 0.035, 10, 32),
      new THREE.MeshBasicMaterial({ color: 0xd9f86c })
    );
    charmHalo.rotation.x = Math.PI / 2;
    charmHalo.position.y = 0.1;
    charmHalo.visible = false;
    root.add(charmHalo);

    // Function to dynamically style the 3D character from start.ng style object
    function applyCharacterStyle(style = DEFAULT_HER_STYLE) {
      const s = { ...DEFAULT_HER_STYLE, ...(style || {}) };

      skinMat.color.set(s.skinColor || '#9c5a33');
      shirtMat.color.set(s.primaryColor || '#383838');
      pantsMat.color.set(s.secondaryColor || '#3a3f5d');
      hairMat.color.set(s.hairColor || '#17120f');

      // Body proportions
      if (s.body === 'male') {
        torso.scale.set(1.12, 1, 1.05);
        hips.scale.set(0.95, 0.72, 0.85);
      } else {
        torso.scale.set(1, 1, 1);
        hips.scale.set(1, 0.75, 0.88);
      }

      // Rebuild Hair
      while (hairGroup.children.length) hairGroup.remove(hairGroup.children[0]);
      if (s.hair !== 'bald') {
        const cap = new THREE.Mesh(
          new THREE.SphereGeometry(0.285, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
          hairMat
        );
        cap.position.y = 0.03;
        hairGroup.add(cap);

        if (s.hair === 'afro') {
          const afro = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 16), hairMat);
          afro.position.set(0, 0.12, -0.03);
          hairGroup.add(afro);
        } else if (s.hair === 'bun' || s.hair === 'ponytail') {
          const bun = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), hairMat);
          bun.position.set(0, 0.18, -0.26);
          hairGroup.add(bun);
        } else if (s.hair === 'braids' || s.hair === 'dreads') {
          [-0.22, 0.22].forEach((x) => {
            const lock = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.45, 8), hairMat);
            lock.position.set(x, -0.12, -0.05);
            hairGroup.add(lock);
          });
        }
      }

      // Rebuild Hat
      while (hatGroup.children.length) hatGroup.remove(hatGroup.children[0]);
      const hatType = s.hat || 'beanie';
      if (hatType === 'beanie') {
        const beanie = new THREE.Mesh(
          new THREE.SphereGeometry(0.295, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.58),
          hatMat
        );
        beanie.position.y = 0.05;
        hatGroup.add(beanie);

        const brim = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.05, 10, 24), brimMat);
        brim.rotation.x = Math.PI / 2;
        brim.position.y = 0.1;
        hatGroup.add(brim);

        const pom = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), hatMat);
        pom.position.y = 0.37;
        hatGroup.add(pom);
      } else if (hatType === 'crown') {
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.18, 8), goldMat);
        crown.position.y = 0.32;
        hatGroup.add(crown);
      } else if (hatType === 'tophat') {
        const topCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.36, 16), hatMat);
        topCyl.position.y = 0.36;
        hatGroup.add(topCyl);
        const topBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 16), hatMat);
        topBrim.position.y = 0.2;
        hatGroup.add(topBrim);
      } else if (hatType === 'cap') {
        const capDome = new THREE.Mesh(
          new THREE.SphereGeometry(0.29, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
          brimMat
        );
        capDome.position.y = 0.05;
        hatGroup.add(capDome);
        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.22), brimMat);
        visor.position.set(0, 0.1, 0.26);
        hatGroup.add(visor);
      }

      // Rebuild Accessories
      while (accGroup.children.length) accGroup.remove(accGroup.children[0]);
      if (s.accessory === 'earrings') {
        [-0.27, 0.27].forEach((x) => {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 8, 16), goldMat);
          ring.position.set(x, -0.05, 0);
          accGroup.add(ring);
        });
      } else if (s.accessory === 'glasses') {
        [-0.09, 0.09].forEach((x) => {
          const frameMesh = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.01, 8, 16), goldMat);
          frameMesh.position.set(x, 0.04, 0.26);
          accGroup.add(frameMesh);
        });
      } else if (s.accessory === 'scarf') {
        const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 10, 20), brimMat);
        scarf.rotation.x = Math.PI / 2;
        scarf.position.y = -0.28;
        accGroup.add(scarf);
      } else if (s.accessory === 'beard') {
        const beard = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), hairMat);
        beard.scale.set(1, 0.8, 0.8);
        beard.position.set(0, -0.16, 0.14);
        accGroup.add(beard);
      }
      if (s.accessory === 'backpack') {
        packMesh.visible = true;
      }
    }

    applyCharacterStyle(DEFAULT_HER_STYLE);

    return {
      root,
      headGroup,
      leftArmPivot,
      rightArmPivot,
      leftLegPivot,
      rightLegPivot,
      bootMeshes,
      packMesh,
      capeMesh,
      charmHalo,
      applyCharacterStyle
    };
  }

  const player = createPlayerCharacter();
  scene.add(player.root);

  // =========================================================
  // 3. Query start.ng for Who's Playing & Update UI + 3D Character
  // =========================================================
  async function syncStartNgPlayer() {
    const isGuestParam = new URLSearchParams(location.search).has('guest');
    const reply = await askStartNg({ type: 'startng:whoami' }, 'startng:user');

    if (reply && (reply.user || reply.guest)) {
      currentStartNgUser = reply.user || null;
      const p = reply.user ?? reply.guest;
      activeCharacterProfile = {
        id: p.id || null,
        name: p.name || 'Her',
        account: reply.user?.account || null,
        style: p.style || DEFAULT_HER_STYLE,
        face: p.face || './assets/persona.png'
      };

      playerFaceEl.src = activeCharacterProfile.face;
      playerNameEl.textContent = activeCharacterProfile.name;
      playerAccountEl.textContent = reply.user?.account ? `@${reply.user.account}` : 'Playing as Guest';
      playerSignInBtn.hidden = !!reply.user || isGuestParam;

      if (reply.user) {
        showcaseAvatarEl.src = activeCharacterProfile.face;
        showcaseNameEl.textContent = activeCharacterProfile.name;
        traitHatEl.textContent = activeCharacterProfile.style.hat || 'Custom';
        traitFitEl.textContent = `${activeCharacterProfile.style.primaryColor || ''} & ${activeCharacterProfile.style.secondaryColor || ''}`;
      }

      player.applyCharacterStyle(activeCharacterProfile.style);
      return;
    }

    // Fallback: check HTTP API game session if available
    const session = sessionStorage.getItem('startng_session');
    const gameSlug = location.hostname.split('.')[0];
    if (session && location.hostname.endsWith('.start.ng')) {
      try {
        const res = await fetch(`${API_START_NG}/games/${gameSlug}/player`, {
          headers: { Authorization: `Bearer ${session}` }
        });
        if (res.ok) {
          const p = await res.json();
          currentStartNgUser = p;
          activeCharacterProfile = {
            id: p.id,
            name: p.name || 'Her',
            account: p.name,
            style: p.style || DEFAULT_HER_STYLE,
            face: './assets/persona.png'
          };
          playerNameEl.textContent = activeCharacterProfile.name;
          playerAccountEl.textContent = 'Signed in on start.ng';
          playerSignInBtn.hidden = true;
          player.applyCharacterStyle(activeCharacterProfile.style);
          return;
        }
      } catch {
        // Offline or local preview fallback
      }
    }

    // Local / standalone preview fallback ("Her" Persona)
    playerFaceEl.src = './assets/persona.png';
    playerNameEl.textContent = 'Her (Dreamy Lass)';
    playerAccountEl.textContent = 'start.ng Persona';
    playerSignInBtn.hidden = isGuestParam;
    player.applyCharacterStyle(DEFAULT_HER_STYLE);
  }

  syncStartNgPlayer();
  window.addEventListener('focus', syncStartNgPlayer);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncStartNgPlayer();
  });

  // =========================================================
  // 4. Leaderboard Save & Fetch (Connect Page + HTTP API Fallback)
  // =========================================================
  async function saveAndRenderLeaderboard(statsObj) {
    const subEl = document.getElementById('go-subtitle');
    const listEl = document.getElementById('leaderboard-list');
    listEl.innerHTML = '<li class="lb-empty">Loading start.ng leaderboard...</li>';

    let savedReply = null;
    if (statsObj) {
      // Try connect page first
      savedReply = await askStartNg({ type: 'startng:score', stats: statsObj }, 'startng:scoreSaved');

      // Fallback to HTTP session if connect page didn't answer
      const session = sessionStorage.getItem('startng_session');
      const gameSlug = location.hostname.split('.')[0];
      if (!savedReply && session && location.hostname.endsWith('.start.ng')) {
        try {
          const r = await fetch(`${API_START_NG}/games/${gameSlug}/scores`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session}`
            },
            body: JSON.stringify({ stats: statsObj })
          });
          if (r.ok) {
            const data = await r.json();
            savedReply = { ok: true, result: data };
          }
        } catch {
          // ignore
        }
      }
    }

    if (savedReply?.ok && savedReply.result) {
      const r = savedReply.result;
      subEl.textContent = r.improved
        ? `🎉 New Personal Best on start.ng! You're Rank #${r.rank}!`
        : `Saved! Your start.ng Rank is #${r.rank} (Best Popularity: ${r.best})`;
      gameoverSignInBtn.hidden = true;
    } else if (!currentStartNgUser) {
      subEl.textContent = 'Sign in with start.ng to save your run on the shared leaderboard!';
      gameoverSignInBtn.hidden = false;
    } else {
      subEl.textContent = 'Her story continues to inspire across the realms!';
      gameoverSignInBtn.hidden = true;
    }

    // Read top 10 leaderboard
    let entries = null;
    const boardReply = await askStartNg({ type: 'startng:leaderboard', limit: 10 }, 'startng:leaderboardData');
    if (boardReply?.ok && Array.isArray(boardReply.entries)) {
      entries = boardReply.entries;
    } else if (location.hostname.endsWith('.start.ng')) {
      try {
        const gameSlug = location.hostname.split('.')[0];
        const r = await fetch(`${API_START_NG}/games/${gameSlug}/leaderboard?limit=10`);
        if (r.ok) entries = await r.json();
      } catch {
        // ignore
      }
    }

    if (Array.isArray(entries) && entries.length > 0) {
      listEl.replaceChildren(
        ...entries.map((e) => {
          const li = document.createElement('li');
          li.className = 'lb-row' + (currentStartNgUser && e.player_id === currentStartNgUser.id ? ' me' : '');
          const s = e.stats || {};
          const pop = s.popularity ?? e.score ?? 0;
          const dist = s.distance ?? 0;
          const friends = s.friends ?? 0;
          li.innerHTML = `
            <span class="lb-rank-name">
              <span class="lb-dot" style="background:${e.color || '#d9f86c'}"></span>
              #${e.rank} ${e.name}
            </span>
            <span class="lb-stats">💖 ${pop} • 🧭 ${dist}m • 🤝 ${friends}</span>
          `;
          return li;
        })
      );
    } else {
      const localBest = Number(localStorage.getItem('dreamyLassBestPop') || 0);
      listEl.innerHTML = `<li class="lb-empty">No global runs recorded yet — be #1! (Your local best: 💖 ${localBest})</li>`;
    }
  }

  // --- Particle Burst System ---
  const particles = [];
  function spawnParticles(pos, colorHex, count = 16) {
    const geo = new THREE.OctahedronGeometry(0.1, 0);
    const mat = new THREE.MeshBasicMaterial({ color: colorHex });
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(pos);
      m.position.y += 1.2;
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 6,
        Math.random() * 5 + 1.5,
        (Math.random() - 0.5) * 6
      );
      scene.add(m);
      particles.push({ mesh: m, vel, life: 0.65 });
    }
  }

  // --- Spawning Entities ---
  const entities = [];

  function createAllyEntity(laneIdx, zPos) {
    const allyType = ALLY_TYPES[Math.floor(Math.random() * ALLY_TYPES.length)];
    const group = new THREE.Group();
    group.position.set(LANES[laneIdx], 0, zPos);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.82, 24),
      new THREE.MeshBasicMaterial({ color: allyType.aura, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    group.add(ring);

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.32, 1.1, 14),
      new THREE.MeshStandardMaterial({ color: allyType.shirt, roughness: 0.4 })
    );
    body.position.y = 0.95;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xe5a073, roughness: 0.4 })
    );
    head.position.y = 1.72;
    head.castShadow = true;
    group.add(head);

    const star = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.2, 0),
      new THREE.MeshBasicMaterial({ color: 0xd9f86c })
    );
    star.position.y = 2.3;
    group.add(star);

    scene.add(group);
    entities.push({ type: 'ally', group, star, data: allyType, lane: laneIdx });
  }

  function createEquipmentEntity(laneIdx, zPos, itemData) {
    const group = new THREE.Group();
    group.position.set(LANES[laneIdx], 0, zPos);

    const crate = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.48, 1),
      new THREE.MeshStandardMaterial({
        color: itemData.color,
        emissive: itemData.color,
        emissiveIntensity: 0.4,
        roughness: 0.2,
        metalness: 0.3
      })
    );
    crate.position.y = 1.1;
    crate.castShadow = true;
    group.add(crate);

    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.68, 0.04, 10, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    halo.position.y = 1.1;
    group.add(halo);

    scene.add(group);
    entities.push({ type: 'equipment', group, crate, halo, data: itemData, lane: laneIdx });
  }

  function createObstacleEntity(laneIdx, zPos) {
    const group = new THREE.Group();
    group.position.set(LANES[laneIdx], 0, zPos);

    const spikeMat = new THREE.MeshStandardMaterial({
      color: 0xff4757,
      emissive: 0x6b0918,
      roughness: 0.35
    });

    const core = new THREE.Mesh(new THREE.ConeGeometry(0.58, 1.35, 6), spikeMat);
    core.position.y = 0.68;
    core.castShadow = true;
    group.add(core);

    const warnRing = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.7, 18),
      new THREE.MeshBasicMaterial({ color: 0xff4757, side: THREE.DoubleSide })
    );
    warnRing.rotation.x = -Math.PI / 2;
    warnRing.position.y = 0.03;
    group.add(warnRing);

    scene.add(group);
    entities.push({ type: 'obstacle', group, lane: laneIdx });
  }

  // --- Game State ---
  let gameState = {
    running: false,
    lane: 1,
    targetX: 0,
    y: 0,
    vy: 0,
    isJumping: false,
    speed: 15,
    distance: 0,
    popularity: 100,
    multiplier: 1.0,
    stamina: 100,
    friendsMet: 0,
    unlockedGear: new Set(),
    spawnTimer: 0,
    currentRealmIdx: 0,
    bestScore: Number(localStorage.getItem('dreamyLassBestPop') || 0)
  };

  let toastTimeout = null;
  function showToast(icon, title, sub, borderColor = '#d9f86c') {
    toastIconEl.textContent = icon;
    toastTitleEl.textContent = title;
    toastSubEl.textContent = sub;
    toastEl.style.borderColor = borderColor;
    toastEl.classList.remove('hidden');
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toastEl.classList.add('hidden');
    }, 2100);
  }

  function updateHUD() {
    popValEl.textContent = Math.floor(gameState.popularity);
    multValEl.textContent = `x${gameState.multiplier.toFixed(1)}`;
    distValEl.textContent = Math.floor(gameState.distance);
    const pct = Math.max(0, Math.min(100, Math.round(gameState.stamina)));
    vibePctEl.textContent = `${pct}%`;
    staminaFillEl.style.width = `${pct}%`;
    invCountEl.textContent = gameState.unlockedGear.size;
  }

  function unlockEquipment(item) {
    if (!gameState.unlockedGear.has(item.id)) {
      gameState.unlockedGear.add(item.id);
      const slot = document.querySelector(`.inv-slot[data-item="${item.id}"]`);
      if (slot) slot.classList.add('unlocked');

      if (item.id === 'boots') {
        player.bootMeshes.forEach((b) => b.material.color.setHex(0x00e5a3));
      } else if (item.id === 'pack') {
        player.packMesh.visible = true;
      } else if (item.id === 'cape') {
        player.capeMesh.visible = true;
      } else if (item.id === 'charm') {
        player.charmHalo.visible = true;
      }
    }
  }

  function clearEntities() {
    while (entities.length > 0) {
      const e = entities.pop();
      scene.remove(e.group);
    }
  }

  function startGame() {
    sfx.init();
    clearEntities();

    gameState.running = true;
    gameState.lane = 1;
    gameState.targetX = LANES[1];
    gameState.y = 0;
    gameState.vy = 0;
    gameState.isJumping = false;
    gameState.speed = 15;
    gameState.distance = 0;
    gameState.popularity = 100;
    gameState.multiplier = 1.0;
    gameState.stamina = 100;
    gameState.friendsMet = 0;
    gameState.unlockedGear.clear();
    gameState.spawnTimer = 0;
    gameState.currentRealmIdx = 0;

    document.querySelectorAll('.inv-slot').forEach((s) => s.classList.remove('unlocked'));
    player.bootMeshes.forEach((b) => b.material.color.setHex(0x32302d));
    player.packMesh.visible = activeCharacterProfile.style?.accessory === 'backpack';
    player.capeMesh.visible = false;
    player.charmHalo.visible = false;
    player.root.position.set(0, 0, 0);

    applyRealmTheme(0);
    updateHUD();

    startScreen.classList.add('hidden');
    gameoverScreen.classList.add('hidden');
    hud.classList.remove('hidden');

    if ('ontouchstart' in window || window.innerWidth < 800) {
      mobileControls.classList.remove('hidden');
    }

    showToast('✨', `${activeCharacterProfile.name}'s Adventure Begins!`, 'Meet allies & collect gear to explore further!');
  }

  function applyRealmTheme(idx) {
    const realm = REALMS[idx];
    scene.background.setHex(realm.sky);
    scene.fog.color.setHex(realm.fog);
    roadMat.color.setHex(realm.road);
    groundMat.color.setHex(realm.side);
    zoneBadgeEl.textContent = realm.name;
  }

  function endGame() {
    gameState.running = false;
    hud.classList.add('hidden');
    mobileControls.classList.add('hidden');
    gameoverScreen.classList.remove('hidden');

    const finalPop = Math.max(0, Math.floor(gameState.popularity));
    const finalDist = Math.max(0, Math.floor(gameState.distance));
    const finalFriends = Math.max(0, Math.floor(gameState.friendsMet));

    if (finalPop > gameState.bestScore) {
      gameState.bestScore = finalPop;
      localStorage.setItem('dreamyLassBestPop', String(finalPop));
    }

    document.getElementById('final-dist').textContent = `${finalDist}m`;
    document.getElementById('final-pop').textContent = finalPop.toLocaleString();
    document.getElementById('final-friends').textContent = String(finalFriends);
    document.getElementById('final-gear').textContent = `${gameState.unlockedGear.size} / 6`;

    // Save run to start.ng matching startng.json columns
    saveAndRenderLeaderboard({
      popularity: finalPop,
      distance: finalDist,
      friends: finalFriends
    });
  }

  openLbBtn.addEventListener('click', () => {
    startScreen.classList.add('hidden');
    gameoverScreen.classList.remove('hidden');
    document.getElementById('go-title').textContent = '🏆 start.ng Leaderboard';
    saveAndRenderLeaderboard(null);
  });

  // --- Controls ---
  function moveLeft() {
    if (!gameState.running) return;
    if (gameState.lane > 0) {
      gameState.lane--;
      gameState.targetX = LANES[gameState.lane];
    }
  }

  function moveRight() {
    if (!gameState.running) return;
    if (gameState.lane < 2) {
      gameState.lane++;
      gameState.targetX = LANES[gameState.lane];
    }
  }

  function jump() {
    if (!gameState.running) return;
    if (!gameState.isJumping) {
      gameState.isJumping = true;
      const hasBoots = gameState.unlockedGear.has('boots');
      gameState.vy = hasBoots ? 11.8 : 10.2;
      sfx.jump();
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') moveLeft();
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') moveRight();
    else if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      jump();
    }
  });

  let touchStartX = 0;
  let touchStartY = 0;
  window.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });

  window.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].screenX - touchStartX;
    const dy = e.changedTouches[0].screenY - touchStartY;
    if (Math.abs(dx) > 36 || Math.abs(dy) > 36) {
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0) moveRight();
        else moveLeft();
      } else if (dy < -30) {
        jump();
      }
    }
  }, { passive: true });

  document.getElementById('btn-left').addEventListener('click', moveLeft);
  document.getElementById('btn-right').addEventListener('click', moveRight);
  document.getElementById('btn-jump').addEventListener('click', jump);

  startBtn.addEventListener('click', startGame);
  restartBtn.addEventListener('click', startGame);

  soundBtn.addEventListener('click', () => {
    sfx.enabled = !sfx.enabled;
    soundBtn.textContent = sfx.enabled ? '🔊' : '🔇';
  });

  // --- Main Loop ---
  let lastTime = performance.now();

  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    const runCycle = now * 0.011;

    if (gameState.running) {
      const distMult = gameState.unlockedGear.has('compass') ? 1.5 : 1.0;
      const speedBonus = gameState.unlockedGear.has('boots') ? 2.2 : 0;
      const currentSpeed = gameState.speed + speedBonus + Math.min(10, gameState.distance * 0.006);

      gameState.distance += currentSpeed * dt * 0.75 * distMult;
      gameState.popularity += dt * 4 * gameState.multiplier;

      const drainRate = gameState.unlockedGear.has('pack') ? 2.1 : 2.8;
      gameState.stamina -= drainRate * dt;

      if (gameState.stamina <= 0) {
        gameState.stamina = 0;
        endGame();
        return;
      }

      for (let i = REALMS.length - 1; i >= 0; i--) {
        if (gameState.distance >= REALMS[i].dist) {
          if (gameState.currentRealmIdx !== i) {
            gameState.currentRealmIdx = i;
            applyRealmTheme(i);
            showToast('🌍', `Entered ${REALMS[i].name}!`, 'Your equipment & popularity unlocked a farther realm!', '#00e5a3');
            sfx.gear();
          }
          break;
        }
      }

      player.root.position.x = THREE.MathUtils.lerp(player.root.position.x, gameState.targetX, dt * 12);

      if (gameState.isJumping) {
        gameState.y += gameState.vy * dt;
        gameState.vy -= 26 * dt;
        if (gameState.y <= 0) {
          gameState.y = 0;
          gameState.vy = 0;
          gameState.isJumping = false;
        }
      }
      player.root.position.y = gameState.y;

      const swing = gameState.isJumping ? 0.55 : Math.sin(runCycle) * 0.65;
      player.leftLegPivot.rotation.x = swing;
      player.rightLegPivot.rotation.x = -swing;
      player.leftArmPivot.rotation.x = -swing * 0.85;
      player.rightArmPivot.rotation.x = swing * 0.85;
      player.charmHalo.rotation.z += dt * 2.5;

      sceneryProps.forEach((prop) => {
        prop.position.z += currentSpeed * dt;
        if (prop.position.z > 10) {
          prop.position.z -= 156;
        }
      });

      gameState.spawnTimer -= dt;
      if (gameState.spawnTimer <= 0) {
        gameState.spawnTimer = Math.max(0.55, 1.25 - gameState.distance * 0.0004);
        const spawnZ = -68;

        const usedLanes = new Set();
        const lane1 = Math.floor(Math.random() * 3);
        usedLanes.add(lane1);

        const roll = Math.random();
        if (roll < 0.46) {
          createAllyEntity(lane1, spawnZ);
        } else if (roll < 0.68) {
          const locked = EQUIPMENT_ITEMS.filter((it) => !gameState.unlockedGear.has(it.id));
          const itemPool = locked.length > 0 ? locked : EQUIPMENT_ITEMS;
          const item = itemPool[Math.floor(Math.random() * itemPool.length)];
          createEquipmentEntity(lane1, spawnZ, item);
        } else {
          createObstacleEntity(lane1, spawnZ);
        }

        if (Math.random() < 0.55) {
          const remaining = [0, 1, 2].filter((l) => !usedLanes.has(l));
          const lane2 = remaining[Math.floor(Math.random() * remaining.length)];
          if (Math.random() < 0.65) {
            createObstacleEntity(lane2, spawnZ);
          } else {
            createAllyEntity(lane2, spawnZ);
          }
        }
      }

      const hasMagnet = gameState.unlockedGear.has('charm');
      for (let i = entities.length - 1; i >= 0; i--) {
        const e = entities[i];
        e.group.position.z += currentSpeed * dt;

        if (e.type === 'ally') {
          e.star.rotation.y += dt * 3;
          if (hasMagnet && e.group.position.z > -18 && e.group.position.z < 1) {
            e.group.position.x = THREE.MathUtils.lerp(e.group.position.x, player.root.position.x, dt * 3.2);
          }
        } else if (e.type === 'equipment') {
          e.crate.rotation.y += dt * 2.5;
          e.crate.rotation.x += dt * 1.5;
          e.halo.rotation.z -= dt * 2;
        }

        const dz = Math.abs(e.group.position.z - player.root.position.z);
        const dx = Math.abs(e.group.position.x - player.root.position.x);

        if (dz < 0.95 && dx < 0.95) {
          if (e.type === 'ally') {
            sfx.ally();
            gameState.friendsMet++;
            gameState.multiplier = Math.min(5.0, +(gameState.multiplier + 0.2).toFixed(1));
            const micBonus = gameState.unlockedGear.has('mic') ? 1.5 : 1.0;
            const gainedPop = Math.round(e.data.pop * gameState.multiplier * micBonus);
            gameState.popularity += gainedPop;
            gameState.stamina = Math.min(100, gameState.stamina + 18);

            spawnParticles(player.root.position, 0xd9f86c, 18);
            showToast(
              '🤝',
              `Positive Vibe with ${e.data.title}!`,
              `+${gainedPop} Popularity • Multiplier x${gameState.multiplier.toFixed(1)} • +Stamina!`
            );

            scene.remove(e.group);
            entities.splice(i, 1);
            continue;
          } else if (e.type === 'equipment') {
            sfx.gear();
            unlockEquipment(e.data);
            gameState.popularity += 120;
            gameState.stamina = Math.min(100, gameState.stamina + 25);

            spawnParticles(player.root.position, e.data.color, 22);
            showToast('🎒', `Equipped: ${e.data.name}!`, e.data.desc, '#ffc83b');

            scene.remove(e.group);
            entities.splice(i, 1);
            continue;
          } else if (e.type === 'obstacle') {
            if (player.root.position.y < 0.85) {
              sfx.hit();
              const hasCape = gameState.unlockedGear.has('cape');
              const dmg = hasCape ? 12 : 24;
              gameState.stamina = Math.max(0, gameState.stamina - dmg);
              gameState.multiplier = Math.max(1.0, +(gameState.multiplier - 0.3).toFixed(1));

              spawnParticles(player.root.position, 0xff4757, 16);
              showToast('⛈️', 'Hit a Doubt Cloud!', `-${dmg}% Stamina • Keep meeting positive allies!`, '#ff4757');

              scene.remove(e.group);
              entities.splice(i, 1);
              continue;
            }
          }
        }

        if (e.group.position.z > 10) {
          scene.remove(e.group);
          entities.splice(i, 1);
        }
      }

      updateHUD();
    } else {
      player.root.rotation.y = Math.sin(now * 0.0015) * 0.35;
      player.headGroup.rotation.z = Math.sin(now * 0.002) * 0.06;
    }

    if (gameState.running) {
      player.root.rotation.y = (player.root.position.x - gameState.targetX) * 0.18;
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.scale.setScalar(Math.max(0.01, p.life * 1.5));
      if (p.life <= 0) {
        scene.remove(p.mesh);
        particles.splice(i, 1);
      }
    }

    renderer.render(scene, camera);
  }

  requestAnimationFrame(animate);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
})();
