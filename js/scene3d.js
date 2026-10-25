/* ================= 装机霸 · 参数化 3D 装机场景 ================= */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const SLOT_NAME = {cpu:'处理器',mobo:'主板',gpu:'显卡',ram:'内存',ssd:'存储',psu:'电源',cooler:'散热器',case:'机箱',fan:'风扇'};

/* 显卡厂商主题：按真实产品配色 */
function gpuTheme(p){
  const n = p.name || '';
  if (/金属大师|白金/.test(n)) return { shroud:0x8f97a3, top:0xa9b1bc, accent:0xd6dae0, logo:0xffffff };   // 全银金属
  if (/Ultra/.test(n))         return { shroud:0xe6e7ea, top:0xeff0f2, accent:0x2f6db5, logo:0x2f6db5 };   // 白色+蓝饰
  if (/战斧/.test(n))          return { shroud:0x191b1f, top:0x22252b, accent:0xd0342c, logo:0xe8e8e8 };   // 黑红
  if (/TUF/.test(n))           return { shroud:0x21231e, top:0x2a2d25, accent:0xe8c531, logo:0xe8e8e8 };   // 黑黄军工
  if (/魔龙/.test(n))          return { shroud:0x151820, top:0x1e2230, accent:0x9aa6bb, logo:0xdfe6ee };   // 曜黑
  if (/樱瞳/.test(n))          return { shroud:0x2b2531, top:0x342c3c, accent:0xe08bb4, logo:0xf5d7e6 };   // 樱粉
  if (/电竞之心/.test(n))      return { shroud:0x14161d, top:0x1b1e28, accent:0x4fb8ff, logo:0x7cc7ff };   // 蓝紫
  if (/大地之神/.test(n))      return { shroud:0x1f3038, top:0x27404c, accent:0x67b0c4, logo:0x9fd6e6 };   // 青蓝
  if (/挑战者|蓝刃|双子/.test(n)) return { shroud:0x1c2b4c, top:0x243966, accent:0x5a8dd6, logo:0xaecbee };// 华擎蓝
  if (/终结者/.test(n))        return { shroud:0x1b1e26, top:0x232838, accent:0xd9a13b, logo:0xf0d9a0 };   // 金饰
  return { shroud:0x2c333f, top:0x3b4451, accent:0x8a94a8, logo:0xdfe6ee };
}

const CASE_DIMS = { ITX:{w:1.9,h:3.4,d:3.5}, 'M-ATX':{w:2.35,h:4.1,d:4.1}, ATX:{w:2.4,h:4.9,d:4.4}, 'E-ATX':{w:2.6,h:5.5,d:5.0} };
const MOBO_DIMS = { ITX:{h:1.7,d:1.7}, 'M-ATX':{h:2.44,d:2.44}, ATX:{h:3.05,d:2.44}, 'E-ATX':{h:3.05,d:2.6} };

/* 真实配件模型（MIT 来源见 models/README.md），缺失时回退程序化建模 */
const MODEL_FILES = {
  cpu_am5:    'models/cpu_am5.glb',
  cpu_lga:    'models/cpu_lga1700.glb',
  gpu_mid:    'models/gpu_rtx4070s.glb',
  gpu_big:    'models/gpu_rtx3080_20g.glb',
  psu_atx:    'models/psu_atx.glb',
};

export class RigScene {
  constructor(container, cb = {}) {
    this.container = container;
    this.cb = cb;
    this.parts = null;
    this.groups = {};          // slot -> Group
    this.rgbMats = [];         // {mat, base(hex), baseI, phase}
    this.spins = [];           // 旋转的风扇叶
    this.explode = 0; this.explodeV = 0;
    this.rgbOn = true;
    this.hl = null; this._hlSaved = [];
    this.caseColorOverride = null;
    this._fresh = [];

    const w = container.clientWidth || 800, h = container.clientHeight || 600;
    this.renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, powerPreference:'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // 场景/光源静止时不再逐帧重绘阴影贴图 —— 相机环绕不触发阴影变化，省下最大的一笔每帧开销
    this.renderer.shadowMap.autoUpdate = false;
    this._shadowDirty = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, w/h, 0.1, 100);
    this.camera.position.set(11, 7.5, 13);
    this._camHome = new THREE.Vector3(5.4, 3.8, 6.6);
    this._introT = 0;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 2.1, 0);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 4; this.controls.maxDistance = 22;
    this.controls.maxPolarAngle = 1.52;
    this.controls.autoRotate = true; this.controls.autoRotateSpeed = 0.9;

    // 辉光后处理：让灯圈/灯条/霓虹线像真实灯光一样溢出发光
    this.scene.background = new THREE.Color(0x0b0c0f);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.42, 0.4, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    if ('environmentIntensity' in this.scene) this.scene.environmentIntensity = 0.6;

    this._lights();
    this._stage();
    this.rig = new THREE.Group();
    this.scene.add(this.rig);

    this.ray = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this._bindEvents();
    this.clock = new THREE.Clock();
    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(container);
    this._startLoop();

    // 异步加载真实模型，到位后自动重建
    this.models = {};
    const loader = new GLTFLoader();
    Object.entries(MODEL_FILES).forEach(([k, url]) => {
      loader.load(url,
        g => { this.models[k] = g.scene; if (this.parts) this.setParts(this.parts); },
        undefined,
        () => {} // 加载失败静默回退程序化建模
      );
    });
  }

  /* 将 GLB 模型归一化到目标尺寸并放入分组；alignZ=true 时把最长轴对齐到 Z */
  _useModel(name, sizeVec, parent, alignZ, envI, darken){
    const src = this.models[name];
    if (!src) return false;
    const m = src.clone(true);
    m.traverse(o => { if (o.isMesh){
      o.castShadow = true; o.receiveShadow = true;
      if (envI != null || darken != null){
        o.material = o.material.clone(); // 独立材质，避免污染缓存
        if (envI != null && 'envMapIntensity' in o.material) o.material.envMapIntensity = envI;
        if (darken != null && o.material.color) o.material.color.multiplyScalar(darken);
        if (o.material.emissive && o.material.emissiveIntensity) o.material.emissiveIntensity *= 0.12; // 掐灭模型自带发光
        if (darken != null){
          if ('metalness' in o.material) o.material.metalness = Math.min(o.material.metalness, 0.5);   // 金属度封顶，杀镜面反光
          if ('roughness' in o.material) o.material.roughness = Math.max(o.material.roughness, 0.5);  // 表面加糙，呈哑光质感
        }
      }
    } });
    const box = new THREE.Box3().setFromObject(m);
    const sz = new THREE.Vector3(); box.getSize(sz);
    if (sz.x <= 0 || sz.y <= 0 || sz.z <= 0) return false;
    if (alignZ){
      // 四个候选姿态试算，选包围盒最符合 长>宽>高（z>x>y）的那个
      const variants = [ [0,0], [Math.PI/2,0], [0,Math.PI/2], [Math.PI/2,Math.PI/2] ];
      let best = null;
      for (const [ry, rx] of variants){
        m.rotation.set(rx, ry, 0);
        const bb = new THREE.Box3().setFromObject(m);
        const bsz = new THREE.Vector3(); bb.getSize(bsz);
        const score = (bsz.z - bsz.x) + (bsz.x - bsz.y);
        if (!best || score > best.score) best = { rx, ry, score };
      }
      m.rotation.set(best.rx, best.ry, 0);
    }
    const b2 = new THREE.Box3().setFromObject(m);
    const sz2 = new THREE.Vector3(); b2.getSize(sz2);
    const s = Math.min(sizeVec.x/Math.max(sz2.x,1e-4), sizeVec.y/Math.max(sz2.y,1e-4), sizeVec.z/Math.max(sz2.z,1e-4));
    m.scale.setScalar(s);
    const b3 = new THREE.Box3().setFromObject(m);
    const c = new THREE.Vector3(); b3.getCenter(c);
    m.position.sub(c);
    parent.add(m);
    return true;
  }

  /* 双通道渲染循环：rAF 优先；环境不触发 rAF 时（部分 WebView/后台合成节流）自动降级为定时器驱动 */
  _startLoop(){
    this._lastFrame = 0;
    const frame = () => { this._lastFrame = performance.now(); this._loop(); };
    const raf = () => { requestAnimationFrame(() => { frame(); raf(); }); };
    requestAnimationFrame(raf);
    this._iv = setInterval(() => {
      if (performance.now() - this._lastFrame > 66) frame();
    }, 33);
  }

  /* ---------- 基础环境 ---------- */
  _lights(){
    // 三点布光 + 半球环境光：中性亮内部光保证配件可读，暖主光只做轻塑形
    const hemi = new THREE.HemisphereLight(0x8fa1bd, 0x171410, 0.45); this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff6e8, 1.0);
    key.position.set(6, 9, 7); key.castShadow = true;
    key.shadow.mapSize.set(1536, 1536);
    Object.assign(key.shadow.camera, { left:-7, right:7, top:8, bottom:-4, near:1, far:30 });
    key.shadow.camera.updateProjectionMatrix();
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x6d7f9a, 0.4); fill.position.set(-7, 4, -6); this.scene.add(fill);
    const rim = new THREE.PointLight(0xc8a96e, 10, 34); rim.position.set(-3, 6.5, -8.5); this.scene.add(rim);
    this.inner = new THREE.PointLight(0xe8eef5, 22, 10); this.inner.position.set(0, 2.6, 0); this.scene.add(this.inner);
    this.inner2 = new THREE.PointLight(0xdfe8f5, 8, 6); this.inner2.position.set(0, 1.3, -0.5); this.scene.add(this.inner2);
  }
  _stage(){
    const ground = new THREE.Mesh(new THREE.CircleGeometry(10, 48), new THREE.ShadowMaterial({ opacity:0.35 }));
    ground.rotation.x = -Math.PI/2; ground.position.y = -0.22; ground.receiveShadow = true;
    this.scene.add(ground);
    const grid = new THREE.GridHelper(22, 26, 0x1c2027, 0x111318);
    grid.position.y = -0.215;
    grid.material.transparent = true; grid.material.opacity = 0.5;
    this.scene.add(grid);
    const ped = new THREE.Mesh(
      new THREE.CylinderGeometry(4.1, 4.35, 0.16, 64),
      new THREE.MeshStandardMaterial({ color:0x10151f, metalness:0.6, roughness:0.4 })
    );
    ped.position.y = -0.14; ped.receiveShadow = true; this.scene.add(ped);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(4.22, 0.035, 12, 96),
      new THREE.MeshStandardMaterial({ color:0x0a0f18, emissive:0xc8a96e, emissiveIntensity:0.85, roughness:0.4 })
    );
    ring.rotation.x = Math.PI/2; ring.position.y = -0.06; this.scene.add(ring);
    this.ringMat = ring.material;
  }

  /* ---------- 材质工具 ---------- */
  _mat(o){ return new THREE.MeshStandardMaterial(o); }
  _rgbMat(o, phase = Math.random()){
    const m = this._mat(Object.assign({ emissive:0x4a5058, emissiveIntensity:0.55 }, o));
    this.rgbMats.push({ mat:m, base:0x4a5058, baseI:0.55, phase });
    return m;
  }
  _rbox(w, h, d, r, mat, x=0, y=0, z=0, parent){
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    (parent || this.rig).add(m); return m;
  }
  _tex(draw, w=256, h=256, rx=1, ry=1){
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  _box(w, h, d, mat, x=0, y=0, z=0, parent){
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    (parent || this.rig).add(m); return m;
  }

  /* ---------- 整机重建 ---------- */
  setParts(P){
    this.parts = P;
    this._clearRig();
    if (!P || !P.case) return;
    this._shadowDirty = true;
    const c = P.case, dim = CASE_DIMS[c.form] || CASE_DIMS.ATX;
    const { w:W, h:H, d:D } = dim;
    this.dim = dim;
    this.inner.position.set(0, H*0.55, 0);
    if (this.inner2) this.inner2.position.set(0, H*0.28, -0.5);
    const shellColor = this.caseColorOverride || (c.colors.includes('white') && this.caseColorOverride === null ? 'black' : (this.caseColorOverride || 'black'));
    const colHex = shellColor === 'white' ? 0xe9ecf2 : 0x252b35;
    const shellMat = this._mat({ color:colHex, metalness:0.55, roughness:0.42 });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color:0xdfe8f0, metalness:0, roughness:0.04, transparent:true, opacity:0.12,
      side:THREE.DoubleSide, depthWrite:false, clearcoat:1, clearcoatRoughness:0.08, envMapIntensity:1.3
    });
    const metal = this._mat({ color:0x9aa5b8, metalness:0.9, roughness:0.22 });

    const moboDim = MOBO_DIMS[P.mobo.form] || MOBO_DIMS.ATX;
    const mCY = H*0.56, mCZ = 0.28;
    const socketY = mCY + Math.min(0.55, moboDim.h*0.22), socketZ = mCZ - 0.12;

    const G = (key, slot, base, dir, dist) => {
      const g = new THREE.Group();
      g.position.copy(base);
      g.userData = { slot, base:base.clone(), dir:new THREE.Vector3(...dir).normalize(), dist, fresh:true };
      g.scale.setScalar(0.86);           // 新配件弹入动画起点
      this.rig.add(g); this.groups[key] = g; this._fresh.push(g);
      return g;
    };

    /* --- 机箱外壳 --- */
    const gCase = G('shell','case', new THREE.Vector3(), [1,0,0], 0.85);
    this._box(W+0.24, 0.09, D+0.24, shellMat, 0, 0.045, 0, gCase);              // 底板
    this._box(W, 0.07, D, shellMat, 0, H-0.035, 0, gCase);                      // 顶板(静态部分省略,顶板单独)
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx,sz])=>{                          // 四柱
      this._box(0.11, H, 0.11, metal, sx*(W/2-0.055), H/2, sz*(D/2-0.055), gCase);
    });
    this._box(0.07, H, D, shellMat, W/2-0.035, H/2, 0, gCase);                  // 右侧板
    this._box(W, H, 0.09, shellMat, 0, H/2, D/2-0.045, gCase);                  // 后板
    const frontMat = c.aquarium ? glassMat : shellMat;
    this._box(W, H, 0.1, frontMat, 0, H/2, -D/2+0.05, gCase);                   // 前面板
    if (!c.aquarium) this._box(0.02, 0.5, 0.02, this._mat({color:0x0a0f16, emissive:0xc8a96e, emissiveIntensity:0.9}), -W/2+0.06, H*0.5, -D/2+0.11, gCase);

    const gGlass = G('glassL','case', new THREE.Vector3(), [-1,0,0], 2.7);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.05, H-0.16, D-0.28), glassMat);
    glass.position.set(-W/2+0.05, H/2, 0); gGlass.add(glass);

    const gTop = G('top','case', new THREE.Vector3(0, H-0.035, 0), [0,1,0], 1.7);
    const hexTex = this._tex((ctx,w,h)=>{
      ctx.fillStyle = '#232830'; ctx.fillRect(0,0,w,h);
      ctx.strokeStyle = '#10131a'; ctx.lineWidth = 3;
      const r = 15;
      for(let y=-1;y<h/(r*1.73)+1;y++) for(let x=-1;x<w/(r*1.5)+1;x++){
        const cx = x*r*1.5+((y%2+2)%2?r*0.75:0), cy = y*r*1.73;
        ctx.beginPath();
        for(let k=0;k<6;k++){ const a = Math.PI/3*k+Math.PI/6; ctx.lineTo(cx+Math.cos(a)*r*0.82, cy+Math.sin(a)*r*0.82); }
        ctx.closePath(); ctx.stroke();
      }
    }, 128, 128, 3, 2);
    this._box(W, 0.07, D-0.2, this._mat({ map:hexTex, metalness:0.7, roughness:0.42 }), 0, 0, 0, gTop);
    for (let i=0;i<8;i++) this._box(0.22, 0.02, D*0.55, metal, -W/2+0.35+i*(W-0.7)/7, 0.037, 0, gTop);

    /* --- 主板（电路纹理 + 插槽装甲细节） --- */
    const gMobo = G('mobo','mobo', new THREE.Vector3(W/2-0.075, mCY, mCZ), [-1,0,0], 0.55);
    const pcbTex = this._tex((ctx,w,h)=>{
      ctx.fillStyle = '#15203a'; ctx.fillRect(0,0,w,h);
      ctx.strokeStyle = 'rgba(130,160,215,0.28)'; ctx.lineWidth = 2;
      for(let i=0;i<24;i++){ ctx.beginPath(); let x=Math.random()*w, y=Math.random()*h; ctx.moveTo(x,y);
        for(let k=0;k<3;k++){ x+=(Math.random()-0.5)*100; y+=(Math.random()<0.5?-1:1)*(20+Math.random()*60); ctx.lineTo(x,y); } ctx.stroke(); }
      ctx.fillStyle = 'rgba(210,185,120,0.55)';
      for(let i=0;i<36;i++) ctx.fillRect(Math.random()*w, Math.random()*h, 5, 3);
    }, 256, 256, 1, 2);
    const pcb = this._mat({ map:pcbTex, color:0xc8d2e2, metalness:0.35, roughness:0.6 });
    this._box(0.05, moboDim.h, moboDim.d, pcb, 0, 0, 0, gMobo);
    this._rbox(0.1, 0.5, 0.85, 0.035, metal, -0.06, moboDim.h/2-0.3, -moboDim.d/2+0.35, gMobo);
    for(let i=0;i<5;i++) this._box(0.09, 0.4, 0.06, metal, -0.06, moboDim.h/2-0.25, moboDim.d/2-0.28+i*0.09, gMobo);
    const slotMat = this._mat({ color:0x232833, roughness:0.55 });
    for(let i=0;i<4;i++) this._box(0.05, 1.24, 0.06, slotMat, -0.03, moboDim.h/2-0.62, -0.7-i*0.2, gMobo);
    const pcieMat = this._mat({ color:0x1a1e26, roughness:0.5 });
    const goldMat = this._mat({ color:0xc9a542, metalness:0.85, roughness:0.35 });
    for(let i=0;i<2;i++){
      this._box(0.05, 0.1, 1.05, pcieMat, -0.035, -moboDim.h/2+0.62+i*0.34, -0.15, gMobo);
      this._box(0.036, 0.03, 0.95, goldMat, -0.04, -moboDim.h/2+0.62+i*0.34, -0.15, gMobo);
    }
    this._rbox(0.08, 0.36, 0.36, 0.03, metal, -0.05, -moboDim.h/2+1.45, moboDim.d/2-0.55, gMobo);
    this._box(0.06, 0.28, 0.62, metal, -0.05, -moboDim.h/2+1.95, 0.1, gMobo);
    if (P.mobo.wifi) this._box(0.06, 0.16, 0.16, this._mat({color:0x101319}), -0.05, moboDim.h/2-0.62, -moboDim.d/2+0.2, gMobo);

    /* --- CPU --- */
    const gCpu = G('cpu','cpu', new THREE.Vector3(W/2-0.12, socketY, socketZ), [-1,0.55,0], 1.3);
    if (!this._useModel(P.cpu.socket==='AM5' ? 'cpu_am5' : 'cpu_lga', new THREE.Vector3(0.42,0.14,0.42), gCpu, false, 0.5, 0.75))
      this._box(0.34, 0.05, 0.34, this._mat({ color:0xb9c2d0, metalness:0.9, roughness:0.25 }), 0, 0, 0, gCpu);

    /* --- 散热 --- */
    const gCool = G('cooler','cooler', new THREE.Vector3(W/2-0.12, socketY, socketZ), [-1,0.3,0], 1.7);
    const co = P.cooler;
    if (co.type === 'aio') {
      const blockMat = this._mat({ color:0x14181f, metalness:0.5, roughness:0.4 });
      const block = this._box(0.36, 0.36, 0.2, blockMat, -0.1, 0, 0, gCool);
      const ring = this._box(0.3, 0.3, 0.02, this._rgbMat({ color:0x0a0f16 }), -0.22, 0, 0, gCool);
      ring.rotation.y = Math.PI/2;
      const radLen = co.rad === 360 ? 2.5 : 1.72;
      const radY = H-0.42, radZ = -0.3;
      const rad = this._box(0.95, 0.26, radLen, this._mat({ color:0x232833, metalness:0.8, roughness:0.35 }), 0, radY-socketY, radZ-socketZ, gCool);
      const nf = co.rad === 360 ? 3 : 2;
      for (let i=0;i<nf;i++) this._fan(gCool, 0, radY-0.26-socketY, radZ + radLen/2-0.45 - i*(radLen-0.35)/Math.max(nf-1,1), 0.42, co.rgb, -Math.PI/2);
      const mk = (dz)=>{
        const s = new THREE.Vector3(-0.24, 0.08, dz);
        const e = new THREE.Vector3(0, radY-0.24-socketY, radZ+radLen/2-0.15-socketZ);
        const mid = s.clone().lerp(e, 0.5).add(new THREE.Vector3(-0.5, 0.1, -0.2));
        const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([s, mid, e]), 24, 0.05, 8),
          this._mat({ color:0x2a303c, metalness:0.4, roughness:0.6 }));
        tube.castShadow = true; gCool.add(tube);
      };
      mk(0.1); mk(-0.12);
    } else if (co.low) {
      this._box(0.62, co.h*0.55, 0.62, this._mat({ color:0xb9c2d0, metalness:0.85, roughness:0.35 }), -0.36, co.h*0.27, 0, gCool);
      this._fan(gCool, -0.38, co.h*0.72, 0, 0.3, co.rgb, -Math.PI/2);
    } else {
      this._box(0.3, 0.14, 0.3, this._mat({ color:0x9aa4b5, metalness:0.9, roughness:0.3 }), -0.16, 0, 0, gCool);
      const finMat = this._mat({ color:0xc3ccdb, metalness:0.88, roughness:0.24 });
      for(let i=0;i<7;i++) this._box(0.72, co.h, 0.055, finMat, -0.55, 0, -0.3+i*0.1, gCool);
      const pipeMat = this._mat({ color:0xb87333, metalness:0.9, roughness:0.3 });
      for (let i=0;i<4;i++){
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.028,0.028,0.1,10), pipeMat);
        pipe.position.set(-0.55+0.55, co.h/2+0.04, -0.22+i*0.15);
        gCool.add(pipe);
      }
      this._fan(gCool, -0.98, 0, -0.42, 0.34, co.rgb, Math.PI);
    }

    /* --- 内存（金属马甲 + 导光条） --- */
    const gRam = G('ram','ram', new THREE.Vector3(W/2-0.2, mCY+0.32, mCZ-Math.min(0.95, moboDim.d/2-0.4)), [0,1,0], 1.5);
    P.ram.sticks = P.ram.sticks || 2;
    const silverRam = /银爵|神武/.test(P.ram.name);
    const ramShell = this._mat({ color:silverRam?0x9aa4b2:(/FURY/.test(P.ram.name)?0x24272e:0x39424f), metalness:0.8, roughness:0.3 });
    const ramRidge = this._mat({ color:silverRam?0xc7ced9:0x4a5563, metalness:0.85, roughness:0.26 });
    for (let i=0;i<P.ram.sticks;i++){
      const z = -i*0.2;
      this._rbox(0.34, 1.12, 0.09, 0.02, ramShell, 0, 0, z, gRam);
      this._box(0.37, 0.72, 0.022, ramRidge, -0.015, -0.03, z-0.048, gRam);
      const bar = this._box(0.38, 0.1, 0.12, P.ram.rgb ? this._rgbMat({ color:0x0a0f16 }) : this._mat({ color:0x2b313c, emissive:0xdfe8f0, emissiveIntensity:0.9 }), 0, 0.6, z, gRam);
      bar.castShadow = false;
    }

    /* --- 显卡（按厂商真实配色建模） --- */
    if (P.gpu.id !== 'igpu') {
      const len = Math.max(P.gpu.len/100, 2.2), thick = 0.3 + P.gpu.thick*0.11;
      const gx = W/2-0.35-0.58, gy = Math.max(mCY-0.85, 1.55), gz = D/2-0.38-len/2;
      const gGpu = G('gpu','gpu', new THREE.Vector3(gx, gy, gz), [-1,-0.15,0], 1.6);
      const gpuModelName = P.gpu.gaming >= 70 ? 'gpu_big' : 'gpu_mid';
      const gpuModelOK = this._useModel(gpuModelName, new THREE.Vector3(1.14, thick*0.96, len*0.94), gGpu, true, 0.2, 0.52);
      const th = gpuTheme(P.gpu);
      if (gpuModelOK) { this._box(0.05, thick+0.04, 0.34, this._mat({ color:0x9aa5b8, metalness:0.9, roughness:0.25 }), 0.58, 0, len/2+0.02, gGpu); }
      if (!gpuModelOK) {
      const shroudMat = this._mat({ color:th.shroud, metalness:0.5, roughness:0.38 });
      const topMat    = this._mat({ color:th.top, metalness:0.72, roughness:0.3 });
      const accMat    = this._mat({ color:th.accent, metalness:0.6, roughness:0.28 });
      // 外壳主体 + 顶面金属背板
      this._rbox(1.16, thick, len, 0.045, shroudMat, 0, 0, 0, gGpu);
      this._rbox(1.1, 0.028, len*0.92, 0.012, topMat, -0.01, thick/2+0.014, 0, gGpu);
      // 顶面前后撞色饰条（真卡标志性的端部斜切装饰）
      this._box(1.02, 0.018, 0.26, accMat, -0.01, thick/2+0.034, -len/2+0.2, gGpu);
      this._box(1.02, 0.018, 0.14, accMat, -0.01, thick/2+0.034,  len/2-0.14, gGpu);
      // 玻璃侧面板：金属侧板 + 厂商撞色条 + 发光 LOGO 条
      this._box(0.03, thick*0.92, len*0.96, topMat, -0.585, 0, 0, gGpu);
      this._box(0.026, 0.15, len*0.5, accMat, -0.603, thick*0.25, 0.1, gGpu);
      const logoMat = P.gpu.rgb ? this._rgbMat({ color:0x0a0f16 }) : this._mat({ color:0x0d1016, emissive:th.logo, emissiveIntensity:0.8 });
      this._box(0.024, 0.075, len*0.32, logoMat, -0.602, -thick*0.2, -0.16, gGpu);
      // 底面：风扇隧道（凹陷导流筒 + 银圈扇叶）
      const nf = P.gpu.fans || 2;
      for (let i=0;i<nf;i++){
        const fz = -len/2+0.55 + i*(len-1.0)/Math.max(nf-1,1);
        const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.06, 28), this._mat({ color:0x0b0d12, roughness:0.7 }));
        tunnel.rotation.x = Math.PI/2; tunnel.position.set(0.05, -thick/2+0.005, fz); gGpu.add(tunnel);
        this._fan(gGpu, 0.03, -thick/2-0.004, fz, 0.42, P.gpu.rgb, Math.PI/2, 0x99a2af);
      }
      // 顶部供电接口凸块
      this._box(0.24, 0.09, 0.36, this._mat({ color:0x14171d, roughness:0.55 }), 0.16, thick/2+0.05, len/2-0.36, gGpu);
      // 尾部镀镍 I/O 挡板
      this._box(0.05, thick+0.04, 0.34, this._mat({ color:0x9aa5b8, metalness:0.9, roughness:0.25 }), 0.58, 0, len/2+0.02, gGpu);
      }
    }

    /* --- 电源 + 理线罩 --- */
    const gPsu = G('psu','psu', new THREE.Vector3(0, 0.6, D/2-0.9), [0,0,1], 1.5);
    const psuMat = this._mat({ color:0x2e3541, metalness:0.65, roughness:0.4 });
    const psuSize = P.psu.form === 'SFX' ? [1.0,0.64,1.05] : [1.5,0.86,1.4];
    this._rbox(...psuSize, 0.05, psuMat, 0, 0, 0, gPsu);
    this._box(0.02, 0.34, 0.6, this._mat({ color:0x0a0f16, emissive:0xc8a96e, emissiveIntensity:0.6 }), -psuSize[0]/2-0.01, 0.1, 0, gPsu);
    const shroud = this._box(W-0.24, 0.06, D*0.5, shellMat, 0, 0.52, 0.9-0.27*D, gPsu);
    // 模组化插座（圆孔阵列）
    const sockMat = this._mat({ color:0x0e1116, roughness:0.6 });
    for (let i=0;i<4;i++){
      const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.055,0.03,12), sockMat);
      sock.rotation.z = Math.PI/2; sock.position.set(-psuSize[0]/2-0.005, 0.08, -0.45+i*0.3); gPsu.add(sock);
    }
    // 24pin 主板供电 + 显卡供电（编制管线）
    const cableMat = this._mat({ color:0x191d25, roughness:0.62, metalness:0.08 });
    const mkCable = (a, b, mid) => {
      const curve = new THREE.CatmullRomCurve3([a, mid, b]);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 22, 0.05, 8), cableMat);
      tube.castShadow = true; gPsu.add(tube);
    };
    mkCable(new THREE.Vector3(0.35, 0.4, -0.55), new THREE.Vector3(W/2-0.45, mCY-0.15, mCZ+0.35), new THREE.Vector3(0.15, 1.5, -0.35));
    mkCable(new THREE.Vector3(-0.1, 0.4, -0.6), new THREE.Vector3(W/2-0.95, mCY-0.75, mCZ+0.15), new THREE.Vector3(-0.45, 1.25, -0.5));

    /* --- 存储 --- */
    const gSsd = G('ssd','ssd', new THREE.Vector3(), [-1,-0.35,0], 1.15);
    if (P.ssd.hdd) {
      gSsd.position.set(0, 0.42, -D*0.08);
      this._box(1.02, 0.26, 1.45, this._mat({ color:0x3a4250, metalness:0.8, roughness:0.35 }), 0,0,0, gSsd);
    } else {
      gSsd.position.set(W/2-0.1, Math.max(mCY-1.45, 1.3), mCZ+0.35);
      this._box(0.09, 0.3, 0.55, this._mat({ color:0x39404e, metalness:0.7, roughness:0.4 }), 0,0,0, gSsd);
    }

    /* --- 机箱风扇 --- */
    const extra = P.fan.count >= 3 ? 1 : 0;
    const frontN = Math.min((c.fans >= 2 ? c.fans : (c.fans + extra)) || (P.fan.count>=3?2:0), 3);
    const fanRgb = P.fan.rgb === true;
    if (frontN > 0) {
      const gFanF = G('fanF','fan', new THREE.Vector3(0.15, 0, -D/2+0.2), [0,0,-1], 1.4);
      for (let i=0;i<frontN;i++)
        this._fan(gFanF, 0, (H*0.32) + i*(H*0.5/Math.max(frontN-1,1)), 0, 0.52, fanRgb, Math.PI);
    }
    if (c.fans >= 1 || P.fan.count >= 3) {
      const gFanR = G('fanR','fan', new THREE.Vector3(W/2-0.75, mCY+0.85, D/2-0.16), [0,0,1], 1.2);
      this._fan(gFanR, 0, 0, 0, 0.48, fanRgb, 0);
    }

    /* --- 霓虹灯线：机箱立柱灯 + 走线槽灯带 --- */
    const neonMat = () => this._rgbMat({ color:0x0a0f16 });
    if (c.aquarium){
      this._box(0.04, H*0.62, 0.04, neonMat(), -W/2+0.14, H*0.42, D/2-0.16, gCase);
      this._box(0.04, H*0.62, 0.04, neonMat(), -W/2+0.14, H*0.42, -D/2+0.16, gCase);
      this._box(0.04, H*0.5, 0.04, neonMat(), W/2-0.14, H*0.5, -D/2+0.16, gCase);
    }
    this._box(W-0.6, 0.035, 0.045, neonMat(), 0, 1.12, D/2-0.32, gCase);

    /* --- 底置风扇阵列（海景房 ATX+ 专属，参考级灯效） --- */
    if (c.aquarium && (c.form==='ATX' || c.form==='E-ATX')){
      const gFanB = G('fanB','fan', new THREE.Vector3(0, 0.16, 0.35), [0,-1,0], 1.15);
      for (let i=0;i<3;i++)
        this._fan(gFanB, -0.58+i*0.58, 0, 0, 0.46, true, -Math.PI/2);
    }

    // 建模完成后立即渲染一帧（不等循环），保证任何环境下首屏可见
    this.composer.render();
  }

  _fan(parent, x, y, z, r, rgb, orientX, ringCol){
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.x = orientX || 0;
    parent.add(g);
    const frame = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.09, 32), this._mat({ color:0x161a22, metalness:0.4, roughness:0.55 }));
    frame.rotation.x = Math.PI/2; frame.castShadow = true; g.add(frame);
    // 主光圈（RGB 时呼吸变色；装饰银圈时为金属环）
    const ringMat = rgb ? this._rgbMat({ color:0x0a0f16 }) : this._mat({ color:ringCol||0x1a202b, emissive:ringCol?0x000000:0xc8a96e, emissiveIntensity:ringCol?0.1:0.4, metalness:ringCol?0.8:0.2, roughness:ringCol?0.3:0.6 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r*0.9, r*0.12, 12, 48), ringMat);
    g.add(ring);
    if (rgb){
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(r*0.64, r*0.05, 10, 40), this._rgbMat({ color:0x0a0f16 }));
      g.add(ring2);
    }
    const spin = new THREE.Group(); g.add(spin); this.spins.push(spin);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r*0.3, r*0.3, 0.1, 20), this._mat({ color:0x39404d, metalness:0.5, roughness:0.45 }));
    hub.rotation.x = Math.PI/2; spin.add(hub);
    const bladeMat = this._mat({ color:0x3c4453, metalness:0.3, roughness:0.55 });
    for (let i=0;i<9;i++){
      const bg = new THREE.Group(); bg.rotation.z = i*Math.PI*2/9; spin.add(bg);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(r*0.78, r*0.34, 0.02), bladeMat);
      blade.position.x = r*0.55; blade.rotation.x = 0.6; bg.add(blade);
    }
    return g;
  }

  _clearRig(){
    this.groups = {}; this.rgbMats = []; this.spins = []; this._fresh = [];
    this.hl = null;
    const dispose = (root)=>{
      root.traverse(o=>{
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());
      });
    };
    [...this.rig.children].forEach(dispose);
    [...this.rig.children].forEach(ch=>this.rig.remove(ch));
  }

  /* ---------- 交互 ---------- */
  setExplode(v){ this.explode = v; }
  setRGB(on){
    this.rgbOn = on;
    if (!on){
      this.rgbMats.forEach(r=>{ r.mat.emissive.setHex(r.base); r.mat.emissiveIntensity = r.baseI; });
      if (this.ringMat){ this.ringMat.emissive.setHex(0xc8a96e); this.ringMat.emissiveIntensity = 0.85; }
    }
  }
  setAutoRotate(on){ this.controls.autoRotate = on; }
  setCaseColor(c){ this.caseColorOverride = c; if (this.parts) this.setParts(this.parts); }
  resetView(){
    this.camera.position.set(11, 7.5, 13);
    this._camHome = new THREE.Vector3(5.4, 3.8, 6.6);
    this._introT = 0;
    this.controls.target.set(0, (this.dim ? this.dim.h : 4.5)*0.45, 0);
    this.controls.update();
  }
  snapshot(){
    this.composer.render();
    return this.renderer.domElement.toDataURL('image/png');
  }
  focus(slot){
    const g = Object.values(this.groups).find(x=>x.userData.slot === slot);
    if (!g || !this.dim) return;
    this.controls.target.copy(g.userData.base).add(g.userData.dir.clone().multiplyScalar(g.userData.dist*this.explodeV)).add(new THREE.Vector3(0, this.dim.h*0.2, 0));
  }
  labelOf(slot){
    if (!this.parts) return '';
    const p = this.parts[slot];
    if (!p) return SLOT_NAME[slot];
    const nm = (slot==='gpu' && p.id!=='igpu' && p.vendor && !p.name.includes(p.vendor)) ? p.vendor+' '+p.name : p.name;
    return `${SLOT_NAME[slot]} · ${nm}`;
  }

  _bindEvents(){
    const el = this.renderer.domElement;
    let downX=0, downY=0, downT=0;
    el.addEventListener('pointerdown', e=>{ downX=e.clientX; downY=e.clientY; downT=Date.now(); });
    el.addEventListener('pointerup', e=>{
      if (Math.hypot(e.clientX-downX, e.clientY-downY) < 6 && Date.now()-downT < 450){
        const hit = this._pick(e);
        if (hit && this.cb.onPick) this.cb.onPick(hit);
      }
    });
    el.addEventListener('pointermove', e=>{
      // 高刷鼠标/触控板事件频率可达 120Hz+，射线检测节流到 30ms，避免拖拽掉帧
      const now = performance.now();
      if (now - (this._lastRay || 0) < 30) return;
      this._lastRay = now;
      const hit = this._pick(e);
      if (hit !== this._hoverSlot){
        this._hoverSlot = hit;
        this._highlight(hit);
        if (this.cb.onHover) this.cb.onHover(hit, hit ? this.labelOf(hit) : null, e.clientX, e.clientY);
      } else if (hit && this.cb.onHover) {
        this.cb.onHover(hit, this.labelOf(hit), e.clientX, e.clientY);
      }
      el.style.cursor = hit ? 'pointer' : 'grab';
    });
    el.addEventListener('pointerleave', ()=>{
      this._hoverSlot = null; this._highlight(null);
      if (this.cb.onHover) this.cb.onHover(null, null, 0, 0);
    });
  }
  _pick(e){
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX-rect.left)/rect.width)*2-1, -((e.clientY-rect.top)/rect.height)*2+1);
    this.ray.setFromCamera(this.pointer, this.camera);
    const hits = this.ray.intersectObjects(this.rig.children, true);
    for (const h of hits){
      let o = h.object;
      while (o && o !== this.rig){
        if (o.userData && o.userData.slot) return o.userData.slot;
        o = o.parent;
      }
    }
    return null;
  }
  _highlight(slot){
    // 还原
    this._hlSaved.forEach(([m, e, i])=>{ m.emissive.setHex(e); m.emissiveIntensity = i; });
    this._hlSaved = [];
    if (!slot) return;
    Object.values(this.groups).forEach(g=>{
      if (g.userData.slot !== slot) return;
      g.traverse(o=>{
        if (o.isMesh && o.material && o.material.emissive){
          this._hlSaved.push([o.material, o.material.emissive.getHex(), o.material.emissiveIntensity]);
          o.material.emissive.setHex(0xc8a96e);
          o.material.emissiveIntensity = 0.5;
        }
      });
    });
  }

  _resize(){
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    if (this.composer) this.composer.setSize(w, h);
    this.camera.aspect = w/h;
    this.camera.updateProjectionMatrix();
  }

  _loop(){
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    this.controls.update();
    // 仅在配件移动（爆炸/弹入/换件）时重绘一次阴影贴图，静止环绕时跳过
    this.renderer.shadowMap.needsUpdate = this._shadowDirty
      || Math.abs(this.explode - this.explodeV) > 0.0005
      || this._fresh.length > 0;
    this._shadowDirty = false;
    // 入场运镜：从远处平滑推进
    if (this._introT !== null && this._introT < 1){
      this._introT = Math.min(1, this._introT + dt*0.85);
      const e = 1 - Math.pow(1 - this._introT, 3);
      this.camera.position.lerpVectors(new THREE.Vector3(11, 7.5, 13), this._camHome, e);
      if (this._introT >= 1) this._introT = null;
    }
    // 爆炸插值
    this.explodeV += (this.explode - this.explodeV)*0.09;
    const e = this.explodeV*this.explodeV*(3-2*this.explodeV);
    Object.values(this.groups).forEach(g=>{
      g.position.copy(g.userData.base).addScaledVector(g.userData.dir, e*g.userData.dist);
    });
    // RGB 呼吸循环（底座光环保持香槟色常亮）
    if (this.rgbOn){
      this.rgbMats.forEach(r=>{
        r.mat.emissive.setHSL((t*0.055 + r.phase)%1, 0.85, 0.55);
        r.mat.emissiveIntensity = 1.5 + Math.sin(t*2 + r.phase*6.28)*0.3;
      });
    }
    // 风扇旋转
    this.spins.forEach(s=>{ s.rotation.z += dt*6; });
    // 新配件弹入
    this._fresh.forEach(g=>{ g.scale.setScalar(Math.min(1, g.scale.x + dt*3.2)); });
    this._fresh = this._fresh.filter(g=>g.scale.x < 0.999);
    this.composer.render();
  }

  dispose(){
    this._ro.disconnect();
    clearInterval(this._iv);
    this.renderer.dispose();
    this.container.innerHTML = '';
  }
}
