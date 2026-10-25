/* ================= 装机霸 · 主应用逻辑 ================= */
import { RigScene } from './scene3d.js';

const $  = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const fmt = n => '¥' + Math.round(n).toLocaleString('zh-CN');
const DB = window.CUBEDB, R = window.Recommend;

/* 价格区间：配件价按市场波动 ±5~8% 取整展示 */
const snap10 = v => Math.max(1, Math.round(v/10)*10);
const pRange = p => p.pr ? p.pr : [snap10(p.price*0.94), Math.max(snap10(p.price*1.08), snap10(p.price*0.94)+20)];
const fmtR = (lo,hi) => (hi>lo ? '¥'+Math.round(lo).toLocaleString('zh-CN')+'-'+Math.round(hi).toLocaleString('zh-CN')
                              : '¥'+Math.round(lo).toLocaleString('zh-CN'));
const pR = p => pRng2(p);
const pRng2 = p => fmtR(pRange(p)[0], pRange(p)[1]);
const pTrend = p => {
  if (!p.trend) return null;
  const m = /^([a-z]+)(\d+)$/.exec(p.trend);
  return m ? { dir:m[1], pct:+m[2] } : { dir:'flat', pct:0 };
};
const trendHTML = p => {
  const t = pTrend(p);
  if (!t) return '';
  if (t.dir === 'flat') return '<span class="trend t-flat">→ 平稳</span>';
  return t.dir === 'up' ? `<span class="trend t-up">↑${t.pct}%</span>` : `<span class="trend t-down">↓${t.pct}%</span>`;
};
const msrpHTML = p => p.msrp && p.msrp !== p.price ? `<span class="msrp">指导价 ¥${p.msrp.toLocaleString('zh-CN')}</span>` : '';
const partsMSRP = P => { let t=0; SLOTS.forEach(sk=>{ t += (P[sk.key].msrp || P[sk.key].price); }); return t; };
const partsRange = P => { let lo=0, hi=0; SLOTS.forEach(s=>{ const r=pRange(P[s.key]); lo+=r[0]; hi+=r[1]; }); return [lo,hi]; };

const SLOTS = [
  { key:'cpu',    label:'处理器', ico:'⚙️' },
  { key:'mobo',   label:'主板',   ico:'🔲' },
  { key:'gpu',    label:'显卡',   ico:'🎮' },
  { key:'ram',    label:'内存',   ico:'💠' },
  { key:'ssd',    label:'存储',   ico:'💾' },
  { key:'psu',    label:'电源',   ico:'🔌' },
  { key:'cooler', label:'散热器', ico:'❄️' },
  { key:'case',   label:'机箱',   ico:'📦' },
  { key:'fan',    label:'机箱风扇', ico:'🌀' },
];

const SPEC = {
  cpu: p => `${p.cores}核${p.threads}线程 · ${p.tdp}W · 游戏${p.gaming}`,
  mobo: p => `${p.socket} · ${p.form} · ${p.ddr} · M.2×${p.m2}${p.wifi?' · WiFi':''}`,
  gpu: p => p.id==='igpu' ? '核显输出 · 满足办公影音网课' : `${p.brand} · 游戏${p.gaming} · AI${p.ai} · ${p.vram}G显存 · ${p.len}mm${p.note?' · '+p.note:''}`,
  ram: p => `${p.cap}G ${p.ddr} ${p.speed}${p.rgb?' · RGB':''}`,
  ssd: p => `${p.cap>=1000 ? p.cap/1000+'T' : p.cap+'G'}${p.hdd?' 机械盘':(p.pcie>=5?' PCIe5.0':' PCIe4.0')}`,
  psu: p => `${p.watt}W ${p.rating}${p.form==='SFX'?' · SFX小电源':''}`,
  cooler: p => p.type==='aio' ? `${p.rad}mm 一体水冷 · 压制${p.maxTdp}W${p.rgb?' · RGB':''}` : `${p.low?'下压式':'塔式风冷'} · 压制${p.maxTdp}W`,
  case: p => `${p.form} · 显卡≤${p.gpuMax}mm · 散热≤${p.coolerMax}mm${p.aquarium?' · 海景房':''}`,
  fan: p => p.count ? `${p.count} 把${p.rgb?' ARGB 灯扇':'静音扇'}` : '使用机箱自带风扇',
};


/* 显卡名称自动带品牌（名称本身已含品牌的不重复加） */
const gpuName = p => p.id==='igpu' ? p.name : (p.vendor && !p.name.includes(p.vendor)) ? p.vendor+' '+p.name : p.name;

const state = {
  filters: {
    budget:'5-6千', scenes:['全能均衡'], priority:'性价比优先',
    caseType:null, special:[], brandCpu:'不限', brandGpu:'不限', focus:[],
  },
  parts: null, recs: null, scene: null, view:'home',
  rgb:true, rotate:true, theme:'black', drawerSlot:null,
};

/* ================= 筛选面板 ================= */
function renderFilters(){
  const root = $('#filterPanel');
  root.innerHTML = '';
  window.FILTER_GROUPS.forEach(g=>{
    const grp = document.createElement('div');
    grp.className = 'grp';
    if (g.mode === 'brand'){
      grp.innerHTML = `<h4>${g.name}</h4>`;
      g.subgroups.forEach(sg=>{
        const sub = document.createElement('div');
        sub.className = 'sub-name';
        sub.textContent = sg.name;
        const chips = document.createElement('div');
        chips.className = 'chips';
        sg.tags.forEach(t=>{
          const c = document.createElement('span');
          c.className = 'chip' + (state.filters[sg.key]===t ? ' on':'');
          c.textContent = t;
          c.onclick = ()=>{
            state.filters[sg.key] = t;
            $$('.chip', chips).forEach(x=>x.classList.remove('on'));
            c.classList.add('on');
          };
          chips.appendChild(c);
        });
        grp.appendChild(sub); grp.appendChild(chips);
      });
    } else {
      grp.innerHTML = `<h4>${g.name}</h4>`;
      const chips = document.createElement('div');
      chips.className = 'chips';
      g.tags.forEach(t=>{
        const c = document.createElement('span');
        c.className = 'chip';
        const cur = state.filters[g.key];
        if (g.mode==='single' ? cur===t : (cur||[]).includes(t)) c.classList.add('on');
        c.textContent = t;
        c.onclick = ()=>{
          if (g.mode==='single'){
            if (state.filters[g.key]===t && g.key!=='budget'){ state.filters[g.key]=null; c.classList.remove('on'); }
            else { state.filters[g.key]=t; $$('.chip',chips).forEach(x=>x.classList.remove('on')); c.classList.add('on'); }
          } else {
            const arr = state.filters[g.key] = state.filters[g.key]||[];
            const i = arr.indexOf(t);
            if (i>=0) arr.splice(i,1); else arr.push(t);
            c.classList.toggle('on');
          }
        };
        chips.appendChild(c);
      });
      grp.appendChild(chips);
    }
    root.appendChild(grp);
  });
  const act = document.createElement('div');
  act.className = 'filter-actions';
  act.innerHTML = `<button class="btn primary block" id="btnGen">⚡ 生成推荐</button>
                   <button class="btn ghost" id="btnResetF" style="flex:1">重置</button>`;
  root.appendChild(act);
  $('#btnGen').onclick = generateRecs;
  $('#btnResetF').onclick = ()=>{
    state.filters = { budget:'5-6千', scenes:['全能均衡'], priority:'性价比优先',
      caseType:null, special:[], brandCpu:'不限', brandGpu:'不限', focus:[] };
    renderFilters(); generateRecs();
  };
}

/* ================= 推荐结果 ================= */
function generateRecs(){
  if (!state.filters.scenes.length) state.filters.scenes = ['全能均衡'];
  if (!state.filters.budget){ toast('请先选择预算档位'); return; }
  state.recs = R.builds(state.filters);
  if (!state.parts) state.parts = { ...state.recs.balanced.parts };
  renderResults();
  updateNavPrice();
}

function barHTML(label, val, cls=''){
  return `<div class="bar-row"><b>${label}</b><div class="bar"><i class="${cls}" style="width:${val}%"></i></div><s>${val}</s></div>`;
}

function cardHTML(variant, b){
  const P = R.resolve(b.parts);
  const warnBad = (b.check.warnings||[]).filter(w=>w.lvl==='bad');
  const badges = [
    ...b.match.reasons.slice(0,3).map(t=>`<span class="badge">${t}</span>`),
    ...warnBad.map(w=>`<span class="badge w">${w.msg}</span>`),
  ].join('');
  return `
  <div class="bcard glass" data-variant="${variant}">
    <span class="match">匹配度 ${b.match.pct}%</span>
    <h3>${b.name}</h3>
    <div class="price">${fmtR(...partsRange(P))}<small>实际成交</small></div>
    <div class="price-sub">${(()=>{ const m=partsMSRP(P); const [lo,hi]=partsRange(P); const mid=(lo+hi)/2;
      return mid>m+50 ? `指导价 ${fmt(m)} · 溢价约 ${fmt(mid-m)}` : `指导价 ${fmt(m)}`; })()}</div>
    <div class="specs">
      <div class="row"><b>CPU</b><span>${P.cpu.name}</span></div>
      <div class="row"><b>显卡</b><span>${gpuName(P.gpu)}</span></div>
      <div class="row"><b>内存</b><span>${P.ram.name}</span></div>
      <div class="row"><b>存储</b><span>${P.ssd.name}</span></div>
      <div class="row"><b>机箱</b><span>${P.case.name}</span></div>
    </div>
    ${barHTML('游戏', b.scores.game)}
    ${barHTML('生产力', b.scores.prod)}
    ${barHTML('静音', b.scores.silence, 'o')}
    <div class="estimate-line">🎮 ${b.estimates.fps}</div>
    <div class="badges">${badges}</div>
    <div class="btns">
      <button class="btn primary sm" data-act="rig">载入 3D 装机 →</button>
      <button class="btn ghost sm" data-act="sheet">配置单</button>
    </div>
  </div>`;
}

function renderResults(){
  const root = $('#recResults');
  const tabs = `
    <div class="rtabs">
      <span class="rtab on" data-tab="builds">整机方案</span>
      <span class="rtab" data-tab="picks">单品精选</span>
      <span class="rtab" data-tab="why">决策分析</span>
    </div>
    <div class="price-note">价格为近期实际成交区间（含市场溢价）；<span class="trend t-up">↑</span>涨价 <span class="trend t-down">↓</span>降价 <span class="trend t-flat">→</span>平稳</div>
    <div id="tab-builds" class="rtab-view"><div class="cards">
      ${Object.entries(state.recs).map(([k,b])=>cardHTML(k,b)).join('')}
    </div></div>
    <div id="tab-picks" class="rtab-view" style="display:none"></div>
    <div id="tab-why" class="rtab-view" style="display:none"></div>`;
  root.innerHTML = tabs;
  $$('.rtab', root).forEach(t=>{
    t.onclick = ()=>{
      $$('.rtab', root).forEach(x=>x.classList.remove('on'));
      t.classList.add('on');
      $$('.rtab-view', root).forEach(x=>x.style.display='none');
      $('#tab-'+t.dataset.tab, root).style.display='block';
    };
  });
  $$('.bcard .btn', root).forEach(btn=>{
    btn.onclick = e=>{
      const variant = e.target.closest('.bcard').dataset.variant;
      state.parts = { ...state.recs[variant].parts };
      applyAll(true);
      switchView(btn.dataset.act==='sheet' ? 'sheet' : 'rig');
      if (btn.dataset.act==='rig') toast(`已载入「${state.recs[variant].name}」，可继续逐件调整`);
    };
  });
  renderPicks(); renderWhy();
}

function mergedWeights(){
  const defs = (state.filters.scenes.length?state.filters.scenes:['全能均衡'])
    .map(s=>window.SCEN_DEF[s]).filter(Boolean);
  const w = {cpu:0,gpu:0,ram:0,ssd:0,mobo:0,psu:0,case:0,cooler:0,fan:0};
  defs.forEach(d=>{ for(const k in w) w[k]+=d.w[k]/defs.length; });
  return w;
}

function renderPicks(){
  const pr = R.profile(state.filters);
  const sp = state.filters.special||[];
  const pickCPU = [...DB.CPUS].sort((a,b)=>R.cpuScore(b,pr)/Math.max(b.price,300)-R.cpuScore(a,pr)/Math.max(a.price,300))[0];
  const pickGPU = sp.includes('黑苹果')
    ? DB.GPUS.filter(g=>g.brand==='AMD'&&g.id!=='igpu')[0]
    : [...DB.GPUS].filter(g=>g.id!=='igpu').sort((a,b)=>R.gpuScore(b,pr)/Math.max(b.price,300)-R.gpuScore(a,pr)/Math.max(a.price,300))[0];
  const sceneTop = state.filters.scenes[0]||'全能均衡';
  $('#tab-picks').innerHTML = `
    <div class="picks-grid">
      <div class="pick glass"><h4>🏅 本场景最值 CPU</h4>
        <div class="nm">${pickCPU.name}</div>
        <div class="p-price">${pR(pickCPU)} ${trendHTML(pickCPU)}</div>
        <div class="why">${SPEC.cpu(pickCPU)}<br>按「${sceneTop}」的用途权重综合表现最佳，性能/价格比最高。</div></div>
      <div class="pick glass"><h4>🎮 本场景最值显卡</h4>
        <div class="nm">${gpuName(pickGPU)}</div>
        <div class="p-price">${pR(pickGPU)} ${trendHTML(pickGPU)}</div>
        <div class="why">${SPEC.gpu(pickGPU)}<br>${sp.includes('黑苹果')?'黑苹果需求下仅推荐 A 卡（驱动兼容）':'在你选择的用途下每元性能最高。'}</div></div>
      <div class="pick glass"><h4>💡 为什么推荐三套？</h4>
        <div class="why" style="line-height:2">
          <b style="color:#cfe0ff">性价比之选</b>：每分钱花在刀刃上，主板机箱够用即可<br>
          <b style="color:#cfe0ff">均衡主流</b>：预留升级与静音余量，最推荐<br>
          <b style="color:#cfe0ff">性能拉满</b>：预算顶格释放，CPU/显卡规格优先
        </div></div>
    </div>`;
}

function renderWhy(){
  const b = state.recs.balanced;
  const w = mergedWeights();
  const rows = [
    ['显卡', w.gpu], ['处理器', w.cpu], ['内存', w.ram], ['存储', w.ssd],
    ['主板', w.mobo], ['电源', w.psu], ['机箱', w.case], ['散热', w.cooler],
  ].sort((a,b)=>b[1]-a[1]);
  const P = R.resolve(b.parts);
  const scenes = state.filters.scenes.join(' + ')||'全能均衡';
  $('#tab-why').innerHTML = `
    <div class="analysis glass">
      <h4>📌 你的需求画像</h4>
      <div class="line"><b>用途</b>${scenes}</div>
      <div class="line"><b>预算</b>${state.filters.budget}（推荐顶格 ${fmt(window.BUDGET_MAP[state.filters.budget][1])}）</div>
      <div class="line"><b>优先</b>${state.filters.priority||'未指定'}${state.filters.special.length?' · '+state.filters.special.join(' / '):''}</div>
      <h4 style="margin-top:16px">💰 预算怎么分（均衡版 ${fmt(b.total)}）</h4>
      ${rows.map(([n,v])=>barHTML(n, Math.round(v*100))).join('')}
      <h4 style="margin-top:16px">🧠 搭配结论</h4>
      <div class="line"><b>CPU / GPU</b>${P.cpu.name} + ${gpuName(P.gpu)}</div>
      <div class="line"><b>瓶颈判断</b>${b.check.bottleneck.note}（CPU指数 ${b.check.bottleneck.cpu} / 显卡指数 ${b.check.bottleneck.gpu}）</div>
      <div class="line"><b>功耗预估</b>整机约 ${b.check.wattNeed}W · ${P.psu.watt}W 电源，余量 ${Math.round(b.check.headroom*100)}%</div>
      <div class="line"><b>帧率预期</b>${b.estimates.fps}</div>
    </div>`;
}

/* ================= 3D 装机视图 ================= */
function initScene(){
  if (state.scene) return;
  state.scene = new RigScene($('#canvas3d'), {
    onPick: slot => openDrawer(slot),
    onHover: (slot, label, x, y) => {
      const tip = $('#partTip');
      if (!label){ tip.style.display='none'; return; }
      tip.style.display='block';
      tip.textContent = label;
      tip.style.left = Math.min(x+14, innerWidth-280)+'px';
      tip.style.top  = Math.min(y+14, innerHeight-60)+'px';
    },
  });
  state.scene.setRGB(state.rgb);
  state.scene.setAutoRotate(state.rotate);
  state.scene.setParts(R.resolve(state.parts));
  $('#btnRgb').classList.toggle('on', state.rgb);
  $('#btnRotate').classList.toggle('on', state.rotate);
}

function renderSlots(){
  const P = R.resolve(state.parts);
  $('#slotList').innerHTML = SLOTS.map(s=>`
    <div class="slot" data-slot="${s.key}">
      <div class="ico">${s.ico}</div>
      <div class="mid"><div class="cat">${s.label}</div><div class="nm">${s.key==='gpu'?gpuName(P.gpu):P[s.key].name}</div></div>
      <div class="price">${P[s.key].price?pR(P[s.key]):'—'}</div><div style="position:absolute;right:18px;bottom:6px">${trendHTML(P[s.key])}</div>
    </div>`).join('');
  $$('#slotList .slot').forEach(el=>{
    el.onclick = ()=>openDrawer(el.dataset.slot);
  });
}

function openDrawer(key){
  state.drawerSlot = key;
  const label = SLOTS.find(s=>s.key===key).label;
  const opts = R.optionsFor(key, state.parts, state.filters);
  const d = $('#drawer');
  const brandBar = key==='gpu' ? `
    <div class="brand-filter">
      ${['全部','NVIDIA','AMD','Intel','国产'].map(b=>`<span class="bchip${(state.gpuFilter||'全部')===b?' on':''}" data-b="${b}">${b}</span>`).join('')}
    </div>` : '';
  d.innerHTML = `
    <div class="drawer-head"><h3>选择${label}</h3><button class="x" id="drawerX">✕ 关闭</button></div>
    ${brandBar}
    <div class="dlist">
      ${opts.map(o=>`
        <div class="opt ${o.ok?'':'dis'}" data-id="${o.p.id}">
          <div class="r1"><span class="nm">${key==='gpu'?gpuName(o.p):o.p.name}</span><span class="pr">${o.p.price?pR(o.p.price):'免费/自带'}</span></div>
          <div class="r2">${SPEC[key](o.p)}</div>
          <div class="r2">${msrpHTML(o.p)} ${trendHTML(o.p)}</div>
          <div class="tags">${o.tags.map(t=>`<span class="tg ${t==='当前'?'cur':(o.ok?'':'bad')}">${t}</span>`).join('')}</div>
        </div>`).join('')}
    </div>`;
  d.classList.add('open');
  $('#drawerX').onclick = closeDrawer;
  $$('.bchip', d).forEach(ch=>{
    ch.onclick = ()=>{
      state.gpuFilter = ch.dataset.b;
      $$('.bchip', d).forEach(x=>x.classList.toggle('on', x===ch));
      $$('.opt', d).forEach(o=>{
        const g = DB.GPUS.find(x=>x.id===o.dataset.id);
        const show = state.gpuFilter==='全部' || (state.gpuFilter==='国产' ? g.brand==='摩尔线程' : g.brand===state.gpuFilter);
        o.style.display = show ? '' : 'none';
      });
    };
  });
  $$('.opt', d).forEach(el=>{
    el.onclick = ()=>{
      if (el.classList.contains('dis')) return;
      setPart(key, el.dataset.id);
    };
  });
}
function closeDrawer(){ $('#drawer').classList.remove('open'); state.drawerSlot=null; }

function setPart(key, id){
  state.parts[key] = id;
  // 显卡功耗变化后自动校准电源
  if (key==='gpu' || key==='cpu'){
    const P0 = R.resolve(state.parts);
    const need = Math.ceil(R.watt(P0)*1.32);
    const cands = DB.PSUS.filter(x=>x.watt>=need&&(P0.case.form!=='ITX'||x.form==='SFX')).sort((a,b)=>a.price-b.price);
    if (cands[0] && cands[0].id!==state.parts.psu && P0.psu.watt<need) state.parts.psu=cands[0].id;
  }
  applyAll();
  const p = R.byId(key,id);
  toast(`${SLOTS.find(s=>s.key===key).label} 已换为 ${p.name}`);
  if (state.drawerSlot) openDrawer(state.drawerSlot);
}

function applyAll(resetView=false){
  renderSlots(); renderRigBar(); renderSheet(); updateNavPrice();
  if (state.scene){
    state.scene.setParts(R.resolve(state.parts));
    if (resetView) state.scene.resetView();
  }
}

function renderRigBar(){
  const P = R.resolve(state.parts);
  const chk = R.check(P, state.filters);
  const pct = Math.min(100, Math.round(chk.wattNeed/chk.psuWatt*100));
  const warnHTML = chk.warnings.slice(0,2).map(w=>
    `<div class="w-${w.lvl}">${w.lvl==='ok'?'✓':w.lvl==='warn'?'⚠':'✕'} ${w.msg}</div>`).join('');
  $('#rigBar').innerHTML = `
    <div class="rb-total">
      <div class="t">${fmtR(...partsRange(P))}</div>
      <div class="s">预估功耗 ${chk.wattNeed}W · ${P.psu.watt}W 电源</div>
    </div>
    <div class="rb-mid">
      <div class="meter">
        <div class="lab"><span>电源负载</span><span>${pct}%</span></div>
        <div class="bar"><i class="${pct>90?'':pct>75?'o':''}" style="width:${pct}%"></i></div>
      </div>
      <div class="btl">
        <div class="bl"><b>CPU</b><div class="bar"><i style="width:${chk.bottleneck.cpu}%"></i></div><s>${chk.bottleneck.cpu}</s></div>
        <div class="bl"><b>显卡</b><div class="bar"><i style="width:${chk.bottleneck.gpu}%"></i></div><s>${chk.bottleneck.gpu}</s></div>
      </div>
      <div class="rb-warns">${warnHTML}</div>
    </div>
    <div class="rb-btns">
      <button class="btn primary sm" id="rbOpt">✨ 智能优化</button>
      <button class="btn ghost sm" id="rbSheet">配置单</button>
    </div>`;
  $('#rbOpt').onclick = ()=>{
    const r = R.optimize(state.parts, state.filters);
    if (r.applied.length){
      state.parts = r.parts; applyAll();
      if (state.drawerSlot) openDrawer(state.drawerSlot);
      toast('已优化：'+r.applied.join('；'));
    } else toast('当前配置已较优，暂无可升级项');
  };
  $('#rbSheet').onclick = ()=>switchView('sheet');
}

/* ================= 配置单 ================= */
function renderSheet(){
  const P = R.resolve(state.parts);
  const chk = R.check(P, state.filters);
  const sc = R.scores(P);
  $('#sheetContent').innerHTML = `
    <div class="sheet-head"><h2>📋 我的配置单</h2><span>由「zhuangjiba.com」生成 · ${new Date().toLocaleDateString('zh-CN')}</span></div>
    <div class="sheet-wrap">
      <div class="glass">
        <table class="stable">
          <thead><tr><th>配件</th><th>型号</th><th style="text-align:right">价格</th></tr></thead>
          <tbody>
            ${SLOTS.map(s=>`<tr><td style="color:var(--dim)">${s.ico} ${s.label}</td><td class="nm">${s.key==='gpu'?gpuName(P.gpu):P[s.key].name}<div style="font-size:11px;color:var(--dim);margin-top:3px">${SPEC[s.key](P[s.key])}</div><div style="font-size:10.5px;margin-top:2px">${msrpHTML(P[s.key])} ${trendHTML(P[s.key])}</div></td><td class="pr">${P[s.key].price?pR(P[s.key]):'—'}</td></tr>`).join('')}
            <tr class="total"><td colspan="2">实际成交区间</td><td class="pr">${fmtR(...partsRange(P))}</td></tr>
            <tr><td colspan="2" style="color:var(--faint);font-size:12px">指导价合计（对比）</td><td class="pr" style="font-size:13px;color:var(--dim)">${fmt(partsMSRP(P))}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="sheet-side">
        <div class="scorebox glass">
          <h4>📊 六维评分</h4>
          ${barHTML('游戏', sc.game)}${barHTML('生产力', sc.prod)}${barHTML('创作', sc.create)}
          ${barHTML('静音', sc.silence,'o')}${barHTML('颜值', sc.looks)}${barHTML('升级空间', sc.upgrade)}
        </div>
        <div class="expbox glass">
          <h4>🧪 使用预估</h4>
          🎮 ${R.estimates(P).fps}<br>
          🏭 ${R.estimates(P).work}<br>
          ⚡ 整机功耗约 ${chk.wattNeed}W，电源余量 ${Math.round(chk.headroom*100)}%<br>
          ⚖️ ${chk.bottleneck.note}
        </div>
        <div class="compatbox glass">
          <h4>🔌 兼容性检查</h4>
          ${chk.warnings.map(w=>`<div class="c-${w.lvl}">${w.lvl==='ok'?'✓':w.lvl==='warn'?'⚠':'✕'} ${w.msg}</div>`).join('')}
          <div class="c-${chk.ok?'ok':'bad'} c-final">${chk.ok?'✓ 全部兼容，可放心下单':'✕ 存在不兼容项，请按提示调整'}</div>
        </div>
        <div class="sheet-actions glass">
          <button class="btn primary sm" id="shCopy">📋 复制配置单</button>
          <button class="btn ghost sm" id="shPng">📷 下载 3D 截图</button>
          <button class="btn ghost sm" id="shRig">去 3D 查看</button>
        </div>
      </div>
    </div>`;
  $('#shCopy').onclick = ()=>{
    const lines = SLOTS.map(s=>`${s.label}：${s.key==='gpu'?gpuName(P.gpu):P[s.key].name}（${P[s.key].price?pR(P[s.key]):'—'}）`);
    const [tlo,thi]=partsRange(P); const txt = `【zhuangjiba.com】配置单\n${lines.join('\n')}\n合计：${fmtR(tlo,thi)}\n游戏预估：${R.estimates(P).fps}\n功耗预估：${chk.wattNeed}W / ${P.psu.watt}W`;
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject())
      .then(()=>toast('配置单已复制到剪贴板'))
      .catch(()=>{ const ta=document.createElement('textarea'); ta.value=txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('配置单已复制'); });
  };
  $('#shPng').onclick = ()=>{
    if (!state.scene) switchView('rig');
    setTimeout(()=>{
      const url = state.scene.snapshot();
      const a = document.createElement('a');
      a.href = url; a.download = 'zhuangjiba.png'; a.click();
      toast('已导出 3D 截图');
    }, state.scene?0:600);
  };
  $('#shRig').onclick = ()=>switchView('rig');
}

function updateNavPrice(){
  if (!state.parts) return;
  $('#navPrice').textContent = fmtR(...partsRange(R.resolve(state.parts)));
}

/* ================= 视图切换 / 工具栏 ================= */
function switchView(v){
  state.view = v;
  $$('.nav-tab').forEach(t=>t.classList.toggle('active', t.dataset.view===v));
  $$('.view').forEach(s=>s.classList.toggle('active', s.id==='view-'+v));
  if (v==='rig'){
    if (!state.scene){ initScene(); applyAll(); }
    else state.scene._resize();
  }
}

function toast(msg){
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tm);
  t._tm = setTimeout(()=>t.classList.remove('show'), 2600);
}

function bindToolbar(){
  $('#btnRgb').onclick = e=>{ state.rgb=!state.rgb; state.scene.setRGB(state.rgb); e.currentTarget.classList.toggle('on', state.rgb); };
  $('#btnRotate').onclick = e=>{ state.rotate=!state.rotate; state.scene.setAutoRotate(state.rotate); e.currentTarget.classList.toggle('on', state.rotate); };
  $('#btnTheme').onclick = e=>{
    state.theme = state.theme==='black'?'white':'black';
    state.scene.setCaseColor(state.theme);
    e.currentTarget.classList.toggle('on', state.theme==='white');
    toast(state.theme==='white'?'已切换白色主题机箱':'已切换黑色主题机箱');
  };
  $('#btnReset').onclick = ()=>state.scene.resetView();
  $('#btnShot').onclick = ()=>{
    const a = document.createElement('a');
    a.href = state.scene.snapshot(); a.download = 'zhuangjiba.png'; a.click();
  };
  $('#explodeRange').oninput = e=>state.scene.setExplode(e.target.value/100);
  document.addEventListener('keydown', e=>{ if (e.key==='Escape') closeDrawer(); });
}

/* ================= 启动 ================= */
$$('.nav-tab').forEach(t=>t.onclick=()=>switchView(t.dataset.view));
renderFilters();
bindToolbar();
generateRecs();
renderSlots();
renderRigBar();
renderSheet();
