/* ================= 装机霸 · 个性化推荐引擎 ================= */
(function(){
'use strict';
const DB = window.CUBEDB;
const CAT = { cpu:'CPUS', mobo:'MOBOS', gpu:'GPUS', ram:'RAMS', ssd:'SSDS', psu:'PSUS', cooler:'COOLERS', case:'CASES', fan:'FANS' };
const SLOTS = Object.keys(CAT);
const R = window.Recommend = {};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const has=(arr,x)=>Array.isArray(arr)&&arr.includes(x);

R.byId   = (key,id)=> DB[CAT[key]].find(p=>p.id===id) || DB[CAT[key]][0];
R.resolve= ids => { const o={}; SLOTS.forEach(k=>o[k]=R.byId(k,ids[k])); return o; };
R.total  = P => SLOTS.reduce((s,k)=>s+(P[k]?P[k].price:0),0);
R.watt   = P => (P.cpu?P.cpu.tdp:0)+(P.gpu?P.gpu.tdp:0)+120;
R.allIds = () => { const o={}; SLOTS.forEach(k=>o[k]=DB[CAT[k]][0].id); return o; };

/* ---------- 筛选条件解析 ---------- */
function hardOf(fl){
  const sp = fl.special||[];
  return {
    hackintosh: has(sp,'黑苹果'),
    oc: has(sp,'超频玩家'), memOc: has(sp,'内存超频'),
    portable: has(sp,'便携出行'), stream: has(sp,'直播推流'),
    multiScreen: has(sp,'多屏输出'), hz4k: has(sp,'4K高刷'), vr: has(sp,'VR畅玩'),
    vm: has(sp,'虚拟机多开'), allday: has(sp,'7×24运行'),
    cpuBrand: (fl.brandCpu&&fl.brandCpu!=='不限')?fl.brandCpu:null,
    gpuBrand: (fl.brandGpu&&fl.brandGpu!=='不限')?fl.brandGpu:null,
    itx: fl.caseType==='迷你主机'||fl.caseType==='ITX小钢炮',
  };
}
function mergedScen(fl){
  const names = fl.scenes&&fl.scenes.length?fl.scenes:['全能均衡'];
  const defs = names.map(s=>window.SCEN_DEF[s]).filter(Boolean);
  const GAMEY = ['电竞网游','3A大作','全能均衡'];
  const m = { minRam:8, minSsd:250, minCores:0, gpuVram:0, preferIgpu:false, hdd:false, quiet:false, nv:false,
    gamey: names.some(n=>GAMEY.includes(n)) };
  defs.forEach(d=>{ m.minRam=Math.max(m.minRam,d.minRam||8); m.minSsd=Math.max(m.minSsd,d.minSsd||250);
    m.minCores=Math.max(m.minCores,d.minCores||0); m.gpuVram=Math.max(m.gpuVram,d.gpuVram||0);
    m.preferIgpu = m.preferIgpu||!!d.preferIgpu; m.hdd=m.hdd||!!d.hdd; m.quiet=m.quiet||!!d.quiet; m.nv=m.nv||!!d.nv; });
  if(hardOf(fl).vm) m.minRam=Math.max(m.minRam,64);
  if(has(fl.focus||[],'大内存')) m.minRam=Math.max(m.minRam,64);
  return m;
}
function weightsOf(fl){
  const defs = (fl.scenes&&fl.scenes.length?fl.scenes:['全能均衡']).map(s=>window.SCEN_DEF[s]).filter(Boolean);
  const w = {cpu:0,gpu:0,ram:0,ssd:0,mobo:0,psu:0,case:0,cooler:0,fan:0};
  defs.forEach(d=>{ for(const k in w) w[k]+=d.w[k]/defs.length; });
  const pr = fl.priority||'';
  if(pr==='性能优先'){ w.cpu*=1.18; w.gpu*=1.18; w.case*=.7; w.mobo*=.85; }
  if(pr==='性价比优先'){ w.mobo*=.8; w.case*=.75; w.psu*=.8; }
  if(pr==='颜值优先'){ w.case*=1.8; w.fan*=1.6; }
  if(pr==='静音优先'){ w.case*=1.4; w.cooler*=1.5; }
  if(pr==='稳定优先'){ w.psu*=1.5; w.cooler*=1.2; }
  const fo = fl.focus||[];
  if(fo.includes('CPU优先')) w.cpu*=1.35;
  if(fo.includes('显卡优先')) w.gpu*=1.35;
  if(fo.includes('大内存')) w.ram*=1.5;
  if(fo.includes('高速固态')||fo.includes('大容量硬盘')) w.ssd*=1.5;
  if(fo.includes('加强散热')) w.cooler*=1.6;
  if(fo.includes('电源留余')) w.psu*=1.4;
  let s=0; for(const k in w) s+=w[k];
  for(const k in w) w[k]/=s;
  return w;
}
function profileOf(w,m){ return { gf: w.gpu/(w.gpu+w.cpu+1e-6), gamey: !!(m&&m.gamey) }; }
const cpuScore=(c,pr)=> pr.gamey ? pr.gf*c.gaming+(1-pr.gf)*c.work : 0.25*c.gaming+0.75*c.work;
const gpuScore=(g,pr)=> g.id==='igpu' ? 8 : pr.gf*g.gaming + (1-pr.gf)*g.ai;
R.profile = fl => profileOf(weightsOf(fl), mergedScen(fl));
R.cpuScore = cpuScore; R.gpuScore = gpuScore;

/* ---------- 各品类候选过滤（价格升序） ---------- */
function caseCands(fl,hard,mode){
  let c = DB.CASES.slice();
  const t = (fl.caseType&&fl.caseType!=='不限')?window.CASE_TYPE_MAP[fl.caseType]:null;
  if(t){ if(t.form) c=c.filter(x=>x.form===t.form); if(t.aquarium) c=c.filter(x=>x.aquarium); if(t.small) c=c.filter(x=>x.gpuMax<=250); }
  if(hard.portable) c=c.filter(x=>x.form==='ITX');
  if(!c.length) c=DB.CASES.slice(); // 过滤过严时放宽
  if(fl.priority==='颜值优先') c.sort((a,b)=>b.looks-a.looks||a.price-b.price);
  else if(fl.priority==='静音优先') c.sort((a,b)=>b.silent-a.silent||a.price-b.price);
  if(mode==='value'||mode==='balanced') c=[...c].sort((a,b)=>a.price-b.price);
  else c.sort((a,b)=>(b.looks+b.silent)-(a.looks+a.silent)||b.gpuMax-a.gpuMax);
  return c;
}
function cpuCands(fl,hard,m,pr,preferIgpu){
  let c = DB.CPUS.slice();
  if(preferIgpu) c=c.filter(x=>x.igpu);
  if(hard.cpuBrand) c=c.filter(x=>x.brand===hard.cpuBrand);
  if(hard.hackintosh) c=c.filter(x=>x.brand==='Intel');
  if(hard.oc) c=c.filter(x=>x.oc);
  if(m.minCores) c=c.filter(x=>x.cores>=m.minCores);
  if(hard.stream) c=c.filter(x=>x.cores>=6);
  if(!c.length) c=DB.CPUS.filter(x=>(!hard.cpuBrand||x.brand===hard.cpuBrand)&&(!preferIgpu||x.igpu));
  return c.sort((a,b)=>a.price-b.price);
}
function moboCands(cpu,cs,fl,hard,m){
  const FIT = { ITX:['ITX'], 'M-ATX':['ITX','M-ATX'], ATX:['ITX','M-ATX','ATX'], 'E-ATX':['ITX','M-ATX','ATX','E-ATX'] };
  let c = DB.MOBOS.filter(x=> x.socket===cpu.socket && FIT[cs.form].includes(x.form));
  if(cpu.ddr==='DDR5') c=c.filter(x=>x.ddr==='DDR5');
  if(cpu.ddr==='DDR4') c=c.filter(x=>x.ddr==='DDR4');
  if(hard.oc||hard.memOc) c=c.filter(x=>x.oc);
  if(has(fl.focus||[],'无线WiFi')) c=c.filter(x=>x.wifi);
  // 供电规格跟 CPU 发热匹配：110W 至少中阶板，170W 至少高阶板
  const minQ = cpu.tdp>=170?3 : cpu.tdp>=110?2 : 1;
  const qf=c.filter(x=>x.q>=minQ); if(qf.length) c=qf;
  if(!c.length){ // 放宽：优先保接口
    c = DB.MOBOS.filter(x=>x.socket===cpu.socket);
    if(!c.length) c=DB.MOBOS.slice();
  }
  return c.sort((a,b)=>a.price-b.price);
}
function coolerCands(cpu,cs,fl,hard,m,mode){
  let c = DB.COOLERS.filter(x=>{
    if(x.maxTdp < cpu.tdp*1.02) return false;
    if(x.type==='air'&&!x.low && x.h*100 > cs.coolerMax-3) return false;
    if(x.type==='air'&&x.low && cs.coolerMax<62) return false;
    if(x.type==='aio' && cs.rad<x.rad) return false;
    return true;
  });
  if(!c.length) c=DB.COOLERS.filter(x=>x.maxTdp>=cpu.tdp).sort((a,b)=>b.maxTdp-a.maxTdp).slice(0,1);
  if(mode==='perf'){
    const paid=c.filter(x=>x.price>0);
    if(paid.length) c=paid; // 性能版不用原装散热
    c.sort((a,b)=>b.silence-a.silence||a.price-b.price);
  } else if((fl.priority==='静音优先'||hard.oc||m.quiet||cpu.tdp>=125)&&c.length>1){
    c.sort((a,b)=>b.silence-a.silence||a.price-b.price);
  } else c.sort((a,b)=>a.price-b.price);
  return c;
}
function ramCands(mobo,fl,hard,m){
  let c = DB.RAMS.filter(x=> x.ddr===mobo.ddr && x.cap>=m.minRam);
  if(hard.memOc) c=c.filter(x=>x.speed>=6000);
  if(!c.length) c=DB.RAMS.filter(x=>x.ddr===mobo.ddr);
  if(fl.priority==='颜值优先'){
    c=[...c].sort((a,b)=> (b.rgb?1:0)-(a.rgb?1:0) || a.price-b.price);
  } else c.sort((a,b)=>a.price-b.price);
  return c;
}
function gpuCands(cs,fl,hard,m,preferIgpu){
  if(preferIgpu) return [DB.GPUS.find(g=>g.id==='igpu')];
  let c = DB.GPUS.filter(g=>g.id!=='igpu');
  if(hard.gpuBrand) c=c.filter(g=> hard.gpuBrand==='国产' ? g.brand==='摩尔线程' : g.brand===hard.gpuBrand);
  if(hard.hackintosh) c=c.filter(g=>g.brand==='AMD');
  if(hard.hz4k) c=c.filter(g=>g.gaming>=70);
  if(hard.vr)   c=c.filter(g=>g.gaming>=62);
  if(m.gpuVram) c=c.filter(g=>g.vram>=m.gpuVram);
  c=c.filter(g=>g.len<=cs.gpuMax);
  if(!c.length){ // 放宽品牌外的限制仍不够则放宽品牌
    c=DB.GPUS.filter(g=>g.id!=='igpu'&&g.len<=cs.gpuMax);
    if(!c.length) c=DB.GPUS.filter(g=>g.id!=='igpu');
  }
  return c.sort((a,b)=>a.price-b.price);
}
function ssdCands(fl,m){
  let c = DB.SSDS.filter(x=>!x.hdd && x.cap>=m.minSsd);
  if(has(fl.focus||[],'高速固态')){ const p5=c.filter(x=>x.pcie>=5); if(p5.length) c=p5; }
  if(has(fl.focus||[],'大容量硬盘')){ const big=c.filter(x=>x.cap>=2000); if(big.length) c=big; }
  if(!c.length) c=DB.SSDS.filter(x=>!x.hdd);
  return c.sort((a,b)=>a.price-b.price);
}
function psuCands(cs,fl,hard,need){
  let c = DB.PSUS.filter(x=>x.watt>=need);
  if(cs.form==='ITX'){ const sfx=c.filter(x=>x.form==='SFX'); if(sfx.length) c=sfx; }
  if(fl.priority==='稳定优先'||hard.allday){ const g=c.filter(x=>x.rating==='金牌'); if(g.length) c=g; }
  if(!c.length) c=DB.PSUS.filter(x=>x.watt>=Math.floor(need*0.9));
  return c.sort((a,b)=>a.price-b.price);
}

/* ---------- 按模式挑选 ----------
   value:     目标附近但价格更敏感（惩罚系数 75）
   balanced:  围绕目标花费的均衡取舍（惩罚系数 55）
   perf:      性能优先，价格仅轻惩罚 */
function pick(cands, target, scoreFn, mode, minT=300){
  if(!cands.length) return null;
  if(mode==='perf'){
    return cands.reduce((a,b)=> (scoreFn(b)-b.price*0.0035) > (scoreFn(a)-a.price*0.0035) ? b : a);
  }
  const penalty = mode==='value' ? 75 : 55;
  const t = Math.max(target, minT);
  return cands.reduce((a,b)=>{ const u=x=>scoreFn(x)-penalty*Math.abs(x.price-t)/t; return u(b)>u(a)?b:a; });
}

/* ---------- 生成单套方案 ---------- */
function one(name, spend, mode, fl, W, pr, budget){
  const hard = hardOf(fl), m = mergedScen(fl);
  const targetTotal = Math.max(budget.max*spend, 1600);
  const ids = {};
  const note = [];

  const csList = caseCands(fl,hard,mode);
  let cs;
  if(mode==='value'){ cs = csList[0]; }
  else if(mode==='balanced'){
    // 均衡版至少给显卡和散热留出余量，避免小机箱拖累游戏配置
    const roomy = csList.filter(x=>x.gpuMax>=300 && x.rad>=240);
    cs = roomy[0] || csList[0];
  } else { cs = csList[0]; }
  ids.case = cs.id;

  const preferIgpu = m.preferIgpu && !hard.hz4k && !hard.vr && !hard.multiScreen && !m.gpuVram && !hard.gpuBrand;
  const cpuList = cpuCands(fl,hard,m,pr,preferIgpu);
  const cpu = pick(cpuList, W.cpu*targetTotal, c=>cpuScore(c,pr)+(hard.stream&&c.cores>=8?6:0), mode, Math.min(1300, budget.max*0.22));
  ids.cpu = cpu.id;

  const moboList = moboCands(cpu,cs,fl,hard,m);
  const mobo = mode==='value' ? moboList[0]
              : pick(moboList, W.mobo*targetTotal, x=>x.q*7+x.m2*3+(x.wifi?8:0)-x.price*0.012, 'balanced', 500);
  ids.mobo = mobo.id;

  const coolerList = coolerCands(cpu,cs,fl,hard,m,mode);
  const cooler = mode==='value' ? coolerList[0]
    : pick(coolerList, W.cooler*targetTotal, x=>x.silence*6+x.maxTdp*0.02-x.price*0.012, 'balanced', 150);
  ids.cooler = cooler.id;

  const ramList = ramCands(mobo,fl,hard,m);
  const fr = ramList.filter(x=>x.cap>=m.minRam).sort((a,b)=>a.price-b.price);
  let ram;
  if(mode==='value'||!fr.length){ ram = fr[0]||ramList[0]; }
  else {
    ram = fr[0];
    const tR = W.ram*targetTotal*0.6;
    const caps = [...new Set(fr.map(x=>x.cap))].sort((a,b)=>a-b);
    const ci = caps.indexOf(ram.cap);
    if(ci+1<caps.length){ const nxt=fr.find(x=>x.cap===caps[ci+1]); if(nxt&&nxt.price<=tR) ram=nxt; }
    if(fl.priority==='颜值优先'){ const rg=fr.find(x=>x.cap===ram.cap&&x.rgb); if(rg) ram=rg; }
  }
  ids.ram = ram.id;

  const gpuList = gpuCands(cs,fl,hard,m,preferIgpu);
  const gpu = pick(gpuList, W.gpu*targetTotal, g=>gpuScore(g,pr)+(hard.stream&&g.brand==='NVIDIA'?6:0)+(m.nv&&g.brand==='NVIDIA'?6:0), mode, preferIgpu?300:Math.min(2000, budget.max*0.3));
  ids.gpu = gpu.id;

  const ssdList = ssdCands(fl,m);
  let ssd;
  if(m.hdd){ ssd = DB.SSDS.find(x=>x.id==='hdd4t'); }
  else if(mode==='value'||!ssdList.length){ ssd = ssdList[0]; }
  else {
    ssd = ssdList[0];
    const tS = W.ssd*targetTotal*0.6;
    const caps = [...new Set(ssdList.map(x=>x.cap))].sort((a,b)=>a-b);
    const ci = caps.indexOf(ssd.cap);
    if(ci+1<caps.length){ const nxt=ssdList.find(x=>x.cap===caps[ci+1]); if(nxt&&nxt.price<=tS) ssd=nxt; }
  }
  ids.ssd = ssd.id;

  // 电源
  let need = Math.ceil((R.watt(R.resolve(ids)))*1.32);
  if(fl.priority==='稳定优先'||hard.allday) need=Math.ceil(need*1.12);
  if(has(fl.focus||[],'电源留余')) need=Math.ceil(need*1.15);
  const psu = psuCands(cs,fl,hard,need)[0];
  ids.psu = psu.id;

  // 风扇
  const fanRules = ()=>{
    if(cs.form==='ITX'&&cs.gpuMax<=250) return 'none';
    if(fl.priority==='静音优先') return 'pk3';
    if(mode!=='value') return 'argb3';   // 均衡/性能版默认 ARGB 灯扇，观感拉满
    if(fl.priority==='颜值优先') return 'argb3';
    if(W.fan>=0.09) return 'pk3';
    return 'none';
  };
  ids.fan = fanRules();

  /* --- 预算收敛 --- */
  // 升降级步进要求列表按价格升序（perf/颜值模式的部分列表按品质排序，这里统一归一）
  const byPrice = (a,b)=>a.price-b.price;
  const lists = { case:[...csList].sort(byPrice), cpu:cpuList, mobo:moboList,
                  cooler:[...coolerList].sort(byPrice), ram:[...ramList].sort(byPrice),
                  gpu:gpuList, ssd:ssdList };
  // 降级顺序：场景权重越低的品类越先削减；同接口/同兼容域内移动
  const order = ['cpu','mobo','gpu','ram','ssd','cooler','case','fan'].sort((a,b)=>(W[a]||0)-(W[b]||0));
  const FITO={ITX:['ITX'],'M-ATX':['ITX','M-ATX'],ATX:['ITX','M-ATX','ATX'],'E-ATX':['ITX','M-ATX','ATX','E-ATX']};
  const okStep=(k,cand)=>{
    const cur={ cpu:()=>R.byId('cpu',ids.cpu), mobo:()=>R.byId('mobo',ids.mobo), case:()=>R.byId('case',ids.case) };
    if(k==='cpu' && cand.socket!==cur.mobo().socket) return false;
    if(k==='cooler'){
      if(cand.maxTdp < cur.cpu().tdp*1.02) return false;
      if(cand.type==='air'&&!cand.low&&cand.h*100>cur.case().coolerMax) return false;
      if(cand.type==='aio'&&cur.case().rad<cand.rad) return false;
    }
    if(k==='case'){
      if(!FITO[cand.form].includes(cur.mobo().form)) return false;
      const g=R.byId('gpu',ids.gpu);
      if(g.id!=='igpu'&&g.len>cand.gpuMax) return false;
      const co=R.byId('cooler',ids.cooler);
      if(co.type==='aio'&&cand.rad<co.rad) return false;
      if(co.type==='air'&&!co.low&&co.h*100>cand.coolerMax) return false;
    }
    if(k==='gpu' && cand.id!=='igpu' && cand.len>cur.case().gpuMax) return false;
    return true;
  };
  const step=(dir)=>{
    for(const k of order){
      const L=lists[k]; if(!L) continue;
      const i=L.findIndex(x=>x.id===ids[k]);
      let j=i+dir;
      while(j>=0&&j<L.length){
        const cand=L[j];
        if(!okStep(k,cand)){ j+=dir; continue; }
        ids[k]=cand.id;
        if(k==='gpu'||k==='cpu'){
          need=Math.ceil(R.watt(R.resolve(ids))*1.32);
          const pl=psuCands(lists.case.find(x=>x.id===ids.case),fl,hard,need);
          if(pl[0]) ids.psu=pl[0].id;
        }
        return true;
      }
    }
    return false;
  };
  let guard=60;
  while(R.total(R.resolve(ids))>budget.max&&guard-->0){ if(!step(-1)) break; }
  if(mode==='perf'){ guard=40; while(R.total(R.resolve(ids))<budget.max*0.93&&guard-->0){ const before=R.total(R.resolve(ids)); if(!step(1)) break; if(R.total(R.resolve(ids))>budget.max){ step(-1); break; } if(before===R.total(R.resolve(ids))) break; } }

  const P = R.resolve(ids);
  const chk = R.check(P,fl);
  const sc = R.scores(P);
  const match = matchOf(P,fl,budget,chk);
  return { name, parts:ids, total:R.total(P), scores:sc, check:chk, estimates:R.estimates(P), match, badges:badgesOf(P,fl,chk) };
}

/* ---------- 匹配度 / 徽章 ---------- */
function matchOf(P,fl,budget,chk){
  let pct=60; const rs=[];
  const tot=R.total(P);
  if(tot<=budget.max) { pct+=8; rs.push('预算内'); } else rs.push('略超预算');
  const sp=fl.special||[];
  if(has(sp,'超频玩家')&&P.cpu.oc&&P.mobo.oc){pct+=3;rs.push('支持超频');}
  if(has(sp,'内存超频')&&P.mobo.oc){pct+=3;rs.push('内存可超频');}
  if(has(sp,'黑苹果')&&P.cpu.brand==='Intel'&&(P.gpu.brand==='AMD'||P.gpu.id==='igpu')){pct+=3;rs.push('黑苹果友好');}
  if(has(sp,'便携出行')&&P.case.form==='ITX'){pct+=3;rs.push('ITX 便携');}
  if(has(sp,'直播推流')&&(P.cpu.cores>=8||P.gpu.brand==='NVIDIA')){pct+=3;rs.push('推流方案');}
  if(has(sp,'4K高刷')&&P.gpu.gaming>=70){pct+=3;rs.push('4K 级显卡');}
  if(has(sp,'VR畅玩')&&P.gpu.gaming>=62){pct+=3;rs.push('VR 就绪');}
  if(has(sp,'虚拟机多开')&&P.ram.cap>=64&&P.cpu.cores>=12){pct+=3;rs.push('多开大内存');}
  if(has(sp,'7×24运行')&&P.psu.rating==='金牌'){pct+=3;rs.push('金牌电源');}
  const pr=fl.priority||'';
  if(pr==='性价比优先'&&tot<=(budget.min+budget.max)/2+500){pct+=5;rs.push('价格克制');}
  if(pr==='性能优先'&&Math.min(P.cpu.gaming,P.gpu.gaming)>=70){pct+=5;rs.push('性能释放');}
  if(pr==='颜值优先'&&(P.case.looks>=8||P.fan.rgb)){pct+=5;rs.push('高颜值');}
  if(pr==='静音优先'&&P.case.silent>=6&&P.cooler.silence>=7){pct+=5;rs.push('静音组合');}
  if(pr==='稳定优先'&&(P.psu.watt-R.watt(P))/P.psu.watt>=0.3){pct+=5;rs.push('供电余量足');}
  if(pr==='保值优先'&&(P.gpu.brand==='NVIDIA'||P.gpu.id==='igpu')){pct+=5;rs.push('大牌保值');}
  return { pct:clamp(Math.round(pct),40,98), reasons:rs };
}
function badgesOf(P,fl,chk){
  const b=[];
  (chk.warnings||[]).forEach(w=>{ if(w.lvl!=='ok') b.push({txt:w.msg,warn:w.lvl==='bad'}); });
  return b.slice(0,4);
}

/* ---------- 评分 / 估算 / 检查 ---------- */
R.scores = P => {
  const game = clamp(Math.round(Math.min(P.cpu.gaming,P.gpu.gaming)/110*100),3,100);
  const prod = clamp(Math.round(P.cpu.work*0.75+Math.max(P.gpu.ai,P.cpu.work*0.2)*0.25),3,100);
  const create= clamp(Math.round(P.cpu.work*0.45+P.gpu.ai*0.55),3,100);
  const rgbN=[P.gpu.rgb,P.cooler.rgb,P.fan.rgb,P.ram.rgb].filter(Boolean).length;
  const silence=clamp(Math.round(38+P.case.silent*4+P.cooler.silence*2.6+(P.fan.count>3?-4:2)),0,100);
  const looks  =clamp(Math.round(28+P.case.looks*3.6+rgbN*9),0,100);
  const head=(P.psu.watt-R.watt(P))/P.psu.watt;
  const upgrade=clamp(Math.round(30+P.mobo.m2*7+(P.case.form==='ITX'?4:18)+head*45),0,100);
  return { game, prod, create, silence, looks, upgrade };
};
R.estimates = P => {
  const s=Math.min(P.cpu.gaming,P.gpu.gaming);
  let fps;
  if(s>=90) fps='4K 3A 高画质流畅 · 2K 电竞 240Hz+';
  else if(s>=75) fps='4K 3A 中高画质 · 2K 高刷';
  else if(s>=60) fps='2K 3A 高画质 · 1080P 电竞高刷';
  else if(s>=45) fps='1080P 3A 高画质 · 2K 网游流畅';
  else if(s>=30) fps='1080P 网游高画质流畅';
  else fps='1080P 网游中画质 · 办公影音';
  const w=Math.round(P.cpu.work*0.75+P.gpu.ai*0.25);
  return { fps, work:'生产力指数 '+w+' / 100', render:'多核吞吐 ≈ 旗舰的 '+Math.round(P.cpu.work)+'%' };
};
R.check = (P,fl) => {
  const W=[]; const wattNeed=R.watt(P);
  const head=(P.psu.watt-wattNeed)/P.psu.watt;
  W.push({lvl:head>=0.25?'ok':head>=0.1?'warn':'bad', msg:'电源 '+P.psu.watt+'W'+(head>=0.25?' · 余量充足 ✓':head>=0.1?' · 余量偏紧':' · 功率不足，建议升级')});
  W.push({lvl:P.gpu.len<=P.case.gpuMax-15?'ok':P.gpu.len<=P.case.gpuMax?'warn':'bad',
          msg:P.gpu.id==='igpu'?'核显输出，无需独立显卡':'显卡 '+P.gpu.len+'mm / 机箱最长 '+P.case.gpuMax+'mm'});
  if(P.cooler.type==='air'&&!P.cooler.low)
    W.push({lvl:P.cooler.h*100<=P.case.coolerMax?'ok':'bad', msg:'散热限高 '+P.case.coolerMax+'mm'+(P.cooler.h*100<=P.case.coolerMax?' ✓':' · 装不下，请更换')});
  if(P.cooler.type==='aio')
    W.push({lvl:P.case.rad>=P.cooler.rad?'ok':'bad', msg:P.cooler.rad+'mm 冷排 · 机箱支持 '+P.case.rad+'mm'});
  W.push({lvl:P.cooler.maxTdp>=P.cpu.tdp?'ok':'bad', msg:'散热压制 '+P.cooler.maxTdp+'W / CPU 发热 '+P.cpu.tdp+'W'});
  const FIT={ITX:['ITX'],'M-ATX':['ITX','M-ATX'],ATX:['ITX','M-ATX','ATX'],'E-ATX':['ITX','M-ATX','ATX','E-ATX']};
  W.push({lvl:FIT[P.case.form].includes(P.mobo.form)?'ok':'bad', msg:P.mobo.form+' 主板 · '+P.case.form+' 机箱'});
  W.push({lvl:P.mobo.socket===P.cpu.socket?'ok':'bad', msg:P.cpu.socket+' 接口匹配 '+P.mobo.socket});
  W.push({lvl:P.ram.ddr===P.mobo.ddr?'ok':'bad', msg:'内存 '+P.ram.ddr+' · 主板 '+P.mobo.ddr+' 内存插槽'});
  W.push({lvl:P.case.form==='ITX'&&P.psu.form!=='SFX'?'warn':'ok',
          msg:P.case.form==='ITX' ? 'ITX 机箱电源规格 '+P.psu.form+'（建议 SFX）' : '电源 '+P.psu.form+' 规格 · 机箱兼容'});
  const bt={cpu:Math.round(P.cpu.gaming/110*100), gpu:Math.round(P.gpu.gaming/110*100)};
  const ratio=P.cpu.gaming/Math.max(P.gpu.gaming,1);
  let bn='搭配均衡';
  if(ratio<0.75&&P.gpu.id!=='igpu') bn='CPU 偏弱，网游帧率受限';
  else if(ratio>1.35&&P.gpu.id!=='igpu') bn='显卡相对 CPU 偏弱';
  return { total:R.total(P), wattNeed, psuWatt:P.psu.watt, headroom:head, warnings:W, bottleneck:{...bt,note:bn}, ok:!W.some(x=>x.lvl==='bad') };
};

/* ---------- 三套方案 ---------- */
R.builds = fl => {
  const bm = window.BUDGET_MAP[fl.budget]||[3000,6000];
  const budget={min:bm[0],max:bm[1]};
  const W=weightsOf(fl), pr=profileOf(W, mergedScen(fl));
  const buildFl = f => { const w=weightsOf(f); return [w, profileOf(w, mergedScen(f))]; };
  const flQuiet = Object.assign({}, fl, {priority:'静音优先'});
  const flLooks = Object.assign({}, fl, {priority:'颜值优先'});
  const [Wq,prq] = buildFl(flQuiet), [Wl,prl] = buildFl(flLooks);
  return {
    value:    one('性价比之选', 0.84, 'value',    fl, W, pr, budget),
    balanced: one('均衡主流',   0.94, 'balanced', fl, W, pr, budget),
    perf:     one('性能拉满',   1.00, 'perf',     fl, W, pr, budget),
    quiet:    one('静音舒适版', 0.90, 'balanced', flQuiet, Wq, prq, budget),
    looks:    one('颜值海景房', 0.92, 'balanced', flLooks, Wl, prl, budget),
  };
};

/* ---------- 抽屉：某槽位的可选配件（兼容性标注） ---------- */
function compat(key,part,P0,fl){
  const P={...P0,[key]:part};
  const hard=hardOf(fl), m=mergedScen(fl);
  switch(key){
    case 'cpu':
      if(hard.cpuBrand&&part.brand!==hard.cpuBrand) return {ok:false,reason:'品牌不符'};
      if(hard.hackintosh&&part.brand!=='Intel') return {ok:false,reason:'黑苹果仅 Intel'};
      if(hard.oc&&!part.oc) return {ok:false,reason:'不支持超频'};
      if(part.socket!==P.mobo.socket) return {ok:false,reason:'接口 '+part.socket+' ≠ '+P.mobo.socket};
      if(P.cooler.maxTdp<part.tdp) return {ok:false,reason:'散热压不住'};
      return {ok:true};
    case 'mobo':{
      const FIT={ITX:['ITX'],'M-ATX':['ITX','M-ATX'],ATX:['ITX','M-ATX','ATX'],'E-ATX':['ITX','M-ATX','ATX','E-ATX']};
      if(part.socket!==P.cpu.socket) return {ok:false,reason:'接口不符'};
      if(!FIT[P.case.form].includes(part.form)) return {ok:false,reason:P.case.form+' 机箱装不下'};
      if(P.cpu.ddr==='DDR5'&&part.ddr!=='DDR5') return {ok:false,reason:'CPU 仅 DDR5'};
      if(P.cpu.ddr==='DDR4'&&part.ddr!=='DDR4') return {ok:false,reason:'CPU 仅 DDR4'};
      if((hard.oc||hard.memOc)&&!part.oc) return {ok:false,reason:'不支持超频'};
      if(has(fl.focus||[],'无线WiFi')&&!part.wifi) return {ok:false,reason:'无 WiFi'};
      return {ok:true};
    }
    case 'gpu':
      if(part.id!=='igpu'){
        if(part.len>P.case.gpuMax) return {ok:false,reason:'超机箱限长 '+P.case.gpuMax+'mm'};
        if(hard.gpuBrand&&part.brand!==hard.gpuBrand) return {ok:false,reason:'品牌不符'};
        if(hard.hackintosh&&part.brand!=='AMD') return {ok:false,reason:'黑苹果建议 A 卡'};
      }
      if((P.psu.watt-R.watt({...P,gpu:part}))<0&&part.id!=='igpu') return {ok:false,reason:'电源功率不足'};
      return {ok:true};
    case 'ram':
      if(part.ddr!==P.mobo.ddr) return {ok:false,reason:'需 '+P.mobo.ddr};
      return {ok:true};
    case 'ssd':
      if(part.hdd&&P.mobo.m2<1) return {ok:false,reason:'无盘位'};
      return {ok:true};
    case 'psu':{
      if(P.case.form==='ITX'&&part.form!=='SFX') return {ok:false,reason:'ITX 需 SFX 电源'};
      return part.watt>=R.watt(P)?{ok:true}:{ok:false,reason:'功率不足（需 '+R.watt(P)+'W）'};
    }
    case 'cooler':
      if(part.maxTdp<P.cpu.tdp) return {ok:false,reason:'压不住 '+P.cpu.name.split(' ').pop()};
      if(part.type==='air'&&!part.low&&part.h*100>P.case.coolerMax) return {ok:false,reason:'超机箱限高'};
      if(part.type==='aio'&&P.case.rad<part.rad) return {ok:false,reason:'机箱不支持 '+part.rad+'mm 冷排'};
      return {ok:true};
    case 'case':{
      const FIT={ITX:['ITX'],'M-ATX':['ITX','M-ATX'],ATX:['ITX','M-ATX','ATX'],'E-ATX':['ITX','M-ATX','ATX','E-ATX']};
      if(!FIT[part.form].includes(P.mobo.form)) return {ok:false,reason:'装不下 '+P.mobo.form+' 主板'};
      if(P.gpu.id!=='igpu'&&P.gpu.len>part.gpuMax) return {ok:false,reason:'显卡超长 '+P.gpu.len+'mm'};
      if(P.cooler.type==='air'&&!P.cooler.low&&P.cooler.h*100>part.coolerMax) return {ok:false,reason:'散热器超高'};
      if(P.cooler.type==='aio'&&part.rad<P.cooler.rad) return {ok:false,reason:'不支持 '+P.cooler.rad+'mm 冷排'};
      return {ok:true};
    }
    case 'fan':
      if(P.case.form==='ITX'&&part.count>3) return {ok:false,reason:'ITX 空间不足'};
      return {ok:true};
  }
  return {ok:true};
}
R.optionsFor = (key, partsIds, fl) => {
  const P = R.resolve(partsIds);
  const W = weightsOf(fl), pr = profileOf(W, mergedScen(fl));
  const scoreFn = key==='cpu'?c=>cpuScore(c,pr) : key==='gpu'?g=>gpuScore(g,pr)
    : key==='mobo'?x=>x.q*7+x.m2*3 : key==='ram'?x=>x.cap*0.3 : key==='ssd'?x=>x.cap*0.012
    : key==='psu'?x=>x.watt*0.05 : key==='cooler'?x=>x.silence*8+x.maxTdp*0.05
    : key==='case'?x=>x.looks*2+x.silent : x=>x.count*3;
  const list = DB[CAT[key]].slice();
  const best = list.filter(p=>compat(key,p,P,fl).ok).reduce((a,b)=>scoreFn(b)>scoreFn(a)?b:a, list[0]);
  return list.map(p=>{
    const c = compat(key,p,P,fl);
    const tags=[];
    if(partsIds[key]===p.id) tags.push('当前');
    if(c.ok&&p.id===best.id&&partsIds[key]!==p.id) tags.push('推荐');
    if(!c.ok) tags.push(c.reason);
    return {p, ok:c.ok, reason:c.reason, tags};
  }).sort((a,b)=>(b.ok?1:0)-(a.ok?1:0)||b.p.price-a.p.price);
};

/* ---------- 智能优化：预算允许下提升短板 ---------- */
R.optimize = (partsIds, fl) => {
  const ids={...partsIds};
  const bm=window.BUDGET_MAP[fl.budget];
  const cap=bm?bm[1]:R.total(R.resolve(ids))*1.12;
  const W=weightsOf(fl), pr=profileOf(W, mergedScen(fl));
  const applied=[];
  for(const key of ['gpu','cpu','ssd','ram']){
    const P=R.resolve(ids);
    const cur=P[key];
    const curScore= key==='cpu'?cpuScore(cur,pr) : key==='gpu'?gpuScore(cur,pr)
      : key==='ssd'?cur.cap*0.012 : cur.cap*0.3;
    const cands=DB[CAT[key]].filter(p=>p.id!==cur.id&&compat(key,p,P,fl).ok)
      .map(p=>({p, s: key==='cpu'?cpuScore(p,pr):key==='gpu'?gpuScore(p,pr):key==='ssd'?p.cap*0.012:p.cap*0.3}))
      .filter(x=>x.s>curScore*1.12);
    if(!cands.length) continue;
    cands.sort((a,b)=>a.p.price-b.p.price);
    const c=cands.find(x=>{ const t=R.total({...R.resolve(ids),[key]:x.p}); return t<=Math.max(cap,R.total(P)*1.1); });
    if(c){ ids[key]=c.p.id; applied.push(SLOT_NAME[key]+' → '+c.p.name.split(' ').slice(-1)[0]); }
  }
  // 同步电源
  const P2=R.resolve(ids);
  const need=Math.ceil(R.watt(P2)*1.32);
  const psu=DB.PSUS.filter(x=>x.watt>=need&&(P2.case.form!=='ITX'||x.form==='SFX')).sort((a,b)=>a.price-b.price)[0];
  if(psu) ids.psu=psu.id;
  return { parts:ids, applied };
};
const SLOT_NAME={cpu:'处理器',mobo:'主板',gpu:'显卡',ram:'内存',ssd:'存储',psu:'电源',cooler:'散热器',case:'机箱',fan:'风扇'};
R.SLOT_NAME=SLOT_NAME;

})();
