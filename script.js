/* ================= DB ================= */
const DB_KEY='rimabattle_v2';
function normalizeDB(d){
  if(!d) d={mcs:[],battles:[],national:{states:{},nacional:null}};
  d.mcs=d.mcs||[];
  d.battles=(d.battles||[]).map(b=>({
    id:b.id,name:b.name,color:b.color||'#144fe0',color2:b.color2||'#e11d33',
    mcIds:b.mcIds||[],editions:b.editions||[],ranking:b.ranking||{},
    currentSeason:b.currentSeason||1, seasonHistory:b.seasonHistory||[]
  }));
  d.national=d.national||{states:{},nacional:null};
  d.national.states=d.national.states||{};
  return d;
}
function loadDB(){
  let d=null;
  try{const raw=localStorage.getItem(DB_KEY); if(raw) d=JSON.parse(raw);}catch(e){}
  if(!d){
    try{const old=localStorage.getItem('rimabattle_v1'); if(old) d=JSON.parse(old);}catch(e){}
  }
  return normalizeDB(d);
}
let db=loadDB();
function save(){localStorage.setItem(DB_KEY,JSON.stringify(db));}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8);}

/* ================= helpers ================= */
function shuffle(arr){const a=arr.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function chunk(arr,size){const out=[];for(let i=0;i<arr.length;i+=size)out.push(arr.slice(i,i+size));return out;}
function mcById(id){return db.mcs.find(m=>m.id===id);}
function mcExists(id){return !!mcById(id);}
function mcName(id){const m=mcById(id);return m?m.name:'';}
function esc(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');}
function estadosDisponiveis(){return [...new Set(db.mcs.map(m=>m.estado))].sort();}
function mcsByEstado(estado){return db.mcs.filter(m=>m.estado===estado);}
function mcLink(id,nameFallback){
  if(mcExists(id)) return `<span class="mclink" onclick="openMcModal('${id}')">${esc(mcName(id))}</span>`;
  return esc(nameFallback||'');
}
function battleById(id){return db.battles.find(b=>b.id===id);}

function calcProb(la,lb){
  const diff=la-lb;
  let p=0.5+0.5*Math.tanh(diff/40);
  return Math.min(0.95,Math.max(0.05,p));
}
function simulateBestOf(target,pA){
  let sa=0,sb=0;
  while(sa<target&&sb<target){ if(Math.random()<pA) sa++; else sb++; }
  return [sa,sb];
}

/* ================= bracket engine ================= */
function buildBracket(participants){
  const parts={}; participants.forEach(p=>parts[p.id]=p);
  const rounds=[];
  let ids=participants.map(p=>p.id);
  let firstRound=[];
  for(let i=0;i<ids.length;i+=2){ firstRound.push({a:ids[i],b:ids[i+1],scoreA:null,scoreB:null,winner:null,loser:null,done:false}); }
  rounds.push(firstRound);
  let cnt=firstRound.length;
  while(cnt>1){ cnt=cnt/2; const r=[]; for(let i=0;i<cnt;i++) r.push({a:null,b:null,scoreA:null,scoreB:null,winner:null,loser:null,done:false}); rounds.push(r); }
  return {participants:parts,rounds:rounds,flat:false};
}
function buildFlatRound(participants){
  const parts={}; participants.forEach(p=>parts[p.id]=p);
  const ids=participants.map(p=>p.id);
  const round=[];
  for(let i=0;i<ids.length;i+=2){ round.push({a:ids[i],b:ids[i+1],scoreA:null,scoreB:null,winner:null,loser:null,done:false}); }
  return {participants:parts,rounds:[round],flat:true};
}
function findRoundIndex(bracket,match){ for(let i=0;i<bracket.rounds.length;i++){ if(bracket.rounds[i].indexOf(match)!==-1) return i; } return -1; }
function simulateMatch(bracket,match,targetWins){
  if(!match.a||!match.b||match.done) return false;
  const pa=bracket.participants[match.a], pb=bracket.participants[match.b];
  const p=calcProb(pa.level,pb.level);
  const [sa,sb]=simulateBestOf(targetWins,p);
  match.scoreA=sa; match.scoreB=sb;
  if(sa>sb){match.winner=match.a; match.loser=match.b;} else {match.winner=match.b; match.loser=match.a;}
  match.done=true;
  if(!bracket.flat){
    const ri=findRoundIndex(bracket,match);
    if(ri>=0 && ri+1<bracket.rounds.length){
      const midx=bracket.rounds[ri].indexOf(match);
      const nextMatch=bracket.rounds[ri+1][Math.floor(midx/2)];
      if(midx%2===0) nextMatch.a=match.winner; else nextMatch.b=match.winner;
    }
  }
  return true;
}
function pendingMatches(bracket){
  const out=[];
  bracket.rounds.forEach(r=>r.forEach(m=>{ if(m.a&&m.b&&!m.done) out.push(m); }));
  return out;
}
function activeRoundIndex(bracket){
  for(let i=0;i<bracket.rounds.length;i++){
    const r=bracket.rounds[i];
    const anyPending=r.some(m=>m.a&&m.b&&!m.done);
    const anyDone=r.some(m=>m.done);
    const allDone=r.every(m=>m.done);
    if(anyPending) return i;
    if(!allDone && !anyDone) return -1;
  }
  return -1;
}
function simulateOne(bracket,targetWins){
  const p=pendingMatches(bracket); if(p.length===0) return false;
  simulateMatch(bracket,p[0],targetWins); return true;
}
function simulatePhase(bracket,targetWins){
  const ri=activeRoundIndex(bracket); if(ri===-1) return false;
  bracket.rounds[ri].forEach(m=>{ if(m.a&&m.b&&!m.done) simulateMatch(bracket,m,targetWins); });
  return true;
}
function simulateAll(bracket,targetWins){
  let guard=0;
  while(guard<200){
    const p=pendingMatches(bracket);
    if(p.length===0) break;
    p.forEach(m=>simulateMatch(bracket,m,targetWins));
    guard++;
  }
}
function isBracketComplete(bracket){
  if(bracket.flat){ return bracket.rounds[0].every(m=>m.done); }
  const last=bracket.rounds[bracket.rounds.length-1][0];
  return !!(last && last.done);
}
function bracketChampion(bracket){
  if(bracket.flat) return null;
  const last=bracket.rounds[bracket.rounds.length-1][0];
  return last && last.done ? last.winner : null;
}
function roundLabel(matchCount){
  switch(matchCount){case 1:return 'FINAL';case 2:return 'SEMIFINAL';case 4:return 'QUARTAS';case 8:return 'OITAVAS';case 16:return 'RODADA 32';default:return 'RODADA '+ (matchCount*2);}
}

/* ================= ranking (pontos) ================= */
function pointsForDepth(depth){const table=[6,4,3,2,1];return table[depth]!==undefined?table[depth]:1;}
function computePlacements(bracket){
  const res={};
  const totalRounds=bracket.rounds.length;
  const finalMatch=bracket.rounds[totalRounds-1][0];
  if(finalMatch && finalMatch.done) res[finalMatch.winner]=9;
  for(let i=totalRounds-1;i>=0;i--){
    const depth=totalRounds-1-i;
    bracket.rounds[i].forEach(m=>{ if(m.done && m.loser!=null && res[m.loser]===undefined) res[m.loser]=pointsForDepth(depth); });
  }
  return res;
}
function applyRankingIfNeeded(battle,edition){
  if(edition.pointsApplied) return;
  if(!isBracketComplete(edition.bracket)) return;
  const pts=computePlacements(edition.bracket);
  Object.keys(pts).forEach(pid=>{
    const meta=edition.bracket.participants[pid]; const p=pts[pid];
    if(!meta) return;
    if(meta.kind==='team'){ meta.mcIds.forEach(mid=>{ if(mcExists(mid)) battle.ranking[mid]=(battle.ranking[mid]||0)+p; }); }
    else { if(mcExists(pid)) battle.ranking[pid]=(battle.ranking[pid]||0)+p; }
  });
  edition.pointsApplied=true;
  save();
}
function cleanupRanking(battle){
  Object.keys(battle.ranking).forEach(id=>{ if(!mcExists(id)) delete battle.ranking[id]; });
}

/* ================= títulos & histórico (calculado dinamicamente) ================= */
function editionChampionIds(ed){
  if(!isBracketComplete(ed.bracket)) return [];
  const champ=bracketChampion(ed.bracket);
  const p=ed.bracket.participants[champ]; if(!p) return [];
  return p.kind==='team'? p.mcIds.slice() : [p.id];
}
function editionChampionLabel(ed){
  if(!isBracketComplete(ed.bracket)) return null;
  const champ=bracketChampion(ed.bracket);
  const p=ed.bracket.participants[champ]; if(!p) return null;
  return {ids: p.kind==='team'?p.mcIds.slice():[p.id], name:p.name, kind:p.kind};
}
function titleCountsForBattle(battle){
  const counts={};
  battle.editions.forEach(ed=>{ editionChampionIds(ed).forEach(id=>{ if(mcExists(id)) counts[id]=(counts[id]||0)+1; }); });
  (battle.seasonHistory||[]).forEach(s=>{ if(s.championMcId && mcExists(s.championMcId)) counts[s.championMcId]=(counts[s.championMcId]||0)+1; });
  return counts;
}
function battleMatchesForMc(battle,mcId){
  const result=[];
  function involves(p){ if(!p) return false; return p.kind==='team'? p.mcIds.includes(mcId) : p.id===mcId; }
  battle.editions.forEach(ed=>{
    const bracket=ed.bracket; if(!bracket) return;
    bracket.rounds.forEach(round=>round.forEach(m=>{
      if(!m.done) return;
      const pa=bracket.participants[m.a], pb=bracket.participants[m.b];
      const ina=involves(pa), inb=involves(pb);
      if(ina||inb){ result.push({won:(ina&&m.winner===m.a)||(inb&&m.winner===m.b)}); }
    }));
  });
  return result;
}
function bracketInvolves(bracket,mcId){
  if(!bracket) return false;
  return Object.values(bracket.participants).some(p=> p.kind==='team'? p.mcIds.includes(mcId) : p.id===mcId);
}
function battleParticipations(battle,mcId){
  let c=0;
  battle.editions.forEach(ed=>{ if(bracketInvolves(ed.bracket,mcId)) c++; });
  return c;
}
function collectParticipations(mcId){
  let c=0;
  db.battles.forEach(b=>b.editions.forEach(ed=>{ if(bracketInvolves(ed.bracket,mcId)) c++; }));
  Object.values(db.national.states).forEach(sd=>{
    (sd.regionals||[]).forEach(r=>{ if(bracketInvolves(r.bracket,mcId)) c++; });
    if(bracketInvolves(sd.estadualBracket,mcId)) c++;
  });
  if(db.national.nacional){
    if(bracketInvolves(db.national.nacional.prefaseBracket,mcId)) c++;
    if(bracketInvolves(db.national.nacional.mainBracket,mcId)) c++;
  }
  return c;
}
function blendHex(a,b,t){
  a=a.replace('#',''); b=b.replace('#','');
  const ar=parseInt(a.substr(0,2),16),ag=parseInt(a.substr(2,2),16),ab=parseInt(a.substr(4,2),16);
  const br=parseInt(b.substr(0,2),16),bg=parseInt(b.substr(2,2),16),bb=parseInt(b.substr(4,2),16);
  return `rgb(${Math.round(ar+(br-ar)*t)},${Math.round(ag+(bg-ag)*t)},${Math.round(ab+(bb-ab)*t)})`;
}
function titleTierColor(c){
  if(c<1) return ['#33394a','#33394a'];
  if(c<2) return ['#1e8a4c','#22c55e'];
  if(c<5) return ['#1d4ed8','#3b82f6'];
  if(c<10) return ['#b45309','#eab308'];
  if(c<20) return ['#7e22ce','#a855f7'];
  return null;
}
function ultimosCampeoes(battle,n){
  n=n||6;
  const list=[];
  for(let i=battle.editions.length-1;i>=0 && list.length<n;i--){
    const ed=battle.editions[i];
    const lbl=editionChampionLabel(ed);
    if(lbl) list.push({edition:ed.name,label:lbl});
  }
  return list;
}
function collectMatchesForMc(mcId){
  const result=[];
  function involves(p){ if(!p) return false; return p.kind==='team'? p.mcIds.includes(mcId) : p.id===mcId; }
  function scanBracket(bracket){
    if(!bracket) return;
    bracket.rounds.forEach(round=>round.forEach(m=>{
      if(!m.done) return;
      const pa=bracket.participants[m.a], pb=bracket.participants[m.b];
      const ina=involves(pa), inb=involves(pb);
      if(ina || inb){
        const won=(ina && m.winner===m.a) || (inb && m.winner===m.b);
        result.push({won});
      }
    }));
  }
  db.battles.forEach(b=>b.editions.forEach(ed=>scanBracket(ed.bracket)));
  Object.values(db.national.states).forEach(sd=>{
    (sd.regionals||[]).forEach(r=>scanBracket(r.bracket));
    if(sd.estadualBracket) scanBracket(sd.estadualBracket);
  });
  if(db.national.nacional){
    scanBracket(db.national.nacional.prefaseBracket);
    scanBracket(db.national.nacional.mainBracket);
  }
  return result;
}
function collectNationalMatchesForMc(mcId){
  const result=[];
  function involves(p){ if(!p) return false; return p.id===mcId; }
  function scanBracket(bracket){
    if(!bracket) return;
    bracket.rounds.forEach(round=>round.forEach(m=>{
      if(!m.done) return;
      const pa=bracket.participants[m.a], pb=bracket.participants[m.b];
      const ina=involves(pa), inb=involves(pb);
      if(ina||inb){ const won=(ina&&m.winner===m.a)||(inb&&m.winner===m.b); result.push({won}); }
    }));
  }
  Object.values(db.national.states).forEach(sd=>{
    (sd.regionals||[]).forEach(r=>scanBracket(r.bracket));
    if(sd.estadualBracket) scanBracket(sd.estadualBracket);
  });
  if(db.national.nacional){ scanBracket(db.national.nacional.prefaseBracket); scanBracket(db.national.nacional.mainBracket); }
  return result;
}
function collectTitles(mcId){
  const titles=[];
  db.battles.forEach(b=>{
    b.editions.forEach(ed=>{ if(editionChampionIds(ed).includes(mcId)) titles.push({type:'Edição',label:`Campeão - ${ed.name} (${b.name})`}); });
    (b.seasonHistory||[]).forEach(s=>{ if(s.championMcId===mcId) titles.push({type:'Temporada',label:`Temporada ${s.season} de Ranking - ${b.name}`}); });
  });
  Object.entries(db.national.states).forEach(([estado,sd])=>{
    (sd.regionals||[]).forEach(r=>{ if(isBracketComplete(r.bracket) && bracketChampion(r.bracket)===mcId) titles.push({type:'Regional',label:`Campeão Regional ${r.idx} - ${estado}`}); });
    if(sd.estadualDone && sd.estadualChampionMcId===mcId) titles.push({type:'Estadual',label:`Campeão Estadual - ${estado}`});
  });
  if(db.national.nacional && db.national.nacional.championMcId===mcId) titles.push({type:'Nacional',label:'Campeão Nacional'});
  return titles;
}

/* ================= national helpers ================= */
function computeStateSize(count){ const sizes=[128,64,32,16,8]; for(const s of sizes){ if(count>=s) return s; } return null; }
function nextValidNacional(n){ const v=[32,16,8,4]; for(const x of v){ if(n>=x) return x; } return 4; }
function getStateData(estado){ if(!db.national.states[estado]) db.national.states[estado]={built:false}; return db.national.states[estado]; }
function classifiedFromRegional(bracket,count){
  if(count===2){ const f=bracket.rounds[bracket.rounds.length-1][0]; return [f.winner,f.loser]; }
  const semiRound=bracket.rounds[bracket.rounds.length-2]; const out=[]; semiRound.forEach(m=>{ out.push(m.a); out.push(m.b); }); return out;
}
function mcParticipant(id){ const m=mcById(id); return {id:m.id,kind:'mc',name:m.name,level:m.nivel,estado:m.estado}; }

/* ================= routing ================= */
window.addEventListener('hashchange',render);
function nav(h){ location.hash=h; }
function currentRoute(){ return location.hash.slice(1) || 'home'; }
function parts(){ return currentRoute().split('/').map(decodeURIComponent); }

function lightenColor(hex,amt){
  hex=(hex||'#144fe0').replace('#','');
  if(hex.length===3) hex=hex.split('').map(c=>c+c).join('');
  const r=parseInt(hex.substr(0,2),16), g=parseInt(hex.substr(2,2),16), b=parseInt(hex.substr(4,2),16);
  const mix=c=>Math.round(c+(255-c)*amt);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}
function luminance(hex){
  hex=(hex||'#000').replace('#','');
  if(hex.length===3) hex=hex.split('').map(c=>c+c).join('');
  const r=parseInt(hex.substr(0,2),16), g=parseInt(hex.substr(2,2),16), b=parseInt(hex.substr(4,2),16);
  return 0.299*r+0.587*g+0.114*b;
}
function contrastText(hex){ return luminance(hex)>150 ? '#12141c' : '#ffffff'; }
function boostForDark(hex){
  let l=luminance(hex);
  if(l>=150) return hex;
  const amt=Math.min(0.75,(150-l)/255*1.7);
  return lightenColor(hex,amt);
}
function setDefaultTheme(){
  const root=document.documentElement.style;
  root.setProperty('--accent','#2f6bff');
  root.setProperty('--accent2','#ff2d4d');
  root.setProperty('--bg','linear-gradient(160deg,#0a0d16,#10152a)');
  root.setProperty('--card','#151b2e');
  root.setProperty('--line','#262e47');
  root.setProperty('--text','#eef2fb');
  root.setProperty('--topbar-bg','linear-gradient(120deg,#0b1330,#1450ff)');
  root.setProperty('--on-accent',contrastText('#2f6bff'));
  root.setProperty('--on-accent2',contrastText('#ff2d4d'));
  root.setProperty('--accent-fg',boostForDark('#2f6bff'));
  root.setProperty('--accent2-fg',boostForDark('#ff2d4d'));
}
function applyBattleTheme(c1,c2){
  const root=document.documentElement.style;
  root.setProperty('--accent',c1);
  root.setProperty('--accent2',c2);
  root.setProperty('--bg',`linear-gradient(150deg,${c1},${lightenColor(c2,0.1)})`);
  root.setProperty('--card',`linear-gradient(135deg,${tintDark(c1,0.4)},${tintDark(c2,0.32)})`);
  root.setProperty('--line',lightenColor(c1,0.2));
  root.setProperty('--text','#ffffff');
  root.setProperty('--topbar-bg',`linear-gradient(120deg,${c1},${c2})`);
  root.setProperty('--on-accent',contrastText(c1));
  root.setProperty('--on-accent2',contrastText(c2));
  root.setProperty('--accent-fg',boostForDark(c1));
  root.setProperty('--accent2-fg',boostForDark(c2));
}
function tintDark(hex,amt){
  hex=(hex||'#000').replace('#','');
  const r=parseInt(hex.substr(0,2),16), g=parseInt(hex.substr(2,2),16), b=parseInt(hex.substr(4,2),16);
  const mix=c=>Math.round(c*amt);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

function render(){
  const root=document.getElementById('app');
  const r=parts();
  let html='';
  setDefaultTheme();
  if(r[0]==='home') html=viewHome();
  else if(r[0]==='mcs') html=viewMcs();
  else if(r[0]==='nacional' && !r[1]) html=viewNacionalHome();
  else if(r[0]==='nacional' && r[1]==='estado') html=viewEstado(r[2]);
  else if(r[0]==='nacional' && r[1]==='regional') html=viewRegional(r[2],parseInt(r[3]));
  else if(r[0]==='nacional' && r[1]==='estadual') html=viewEstadual(r[2]);
  else if(r[0]==='nacional' && r[1]==='main') html=viewNacionalMain();
  else if(r[0]==='battles' && !r[1]) html=viewBattles();
  else if(r[0]==='battle' && r[1] && !r[2]) html=viewBattleDetail(r[1]);
  else if(r[0]==='battle' && r[1]==='newedition') html=viewNewEdition(r[2]);
  else if(r[0]==='edition') html=viewEdition(r[1],r[2]);
  else html=viewHome();
  root.innerHTML=html;
  if(r[0]==='battle' && r[1]==='newedition') updateTeamOptions(r[2]);
  window.scrollTo(0,0);
}

function topbar(title,sub,backHash){
  return `<div class="topbar"><div class="topbar-inner"><div class="row">${backHash?`<span class="back" onclick="nav('${backHash}')">‹</span>`:''}<div><h2>${title}</h2>${sub?`<div class="sub">${sub}</div>`:''}</div></div></div></div>`;
}

/* ================= HOME ================= */
function viewHome(){
  return `${topbar('RIMA BATTLE SIM','Simulador de batalhas de rima')}
  <div class="content">
  <div class="list-grid">
    <div class="navcard hero1" onclick="nav('mcs')"><div><h3>🎤 Cadastro de MCs</h3><div class="muted">${db.mcs.length} MC(s) cadastrados</div></div><div class="chev">›</div></div>
    <div class="navcard hero2" onclick="nav('nacional')"><div><h3>🏆 Estrutura Nacional</h3><div class="muted">Regional → Estadual → Nacional</div></div><div class="chev">›</div></div>
    <div class="navcard hero3" onclick="nav('battles')"><div><h3>🔥 Batalhas</h3><div class="muted">${db.battles.length} batalha(s) criadas</div></div><div class="chev">›</div></div>
  </div>
  <div class="card">
    <h3>Backup</h3>
    <p class="muted">Exporte todos os dados do simulador para um arquivo .json, ou importe um backup existente (substitui os dados atuais).</p>
    <div class="actionsrow">
      <button class="btn secondary small" onclick="exportJSON()">Exportar JSON</button>
      <button class="btn secondary small" onclick="document.getElementById('importFileInput').click()">Importar JSON</button>
    </div>
    <input type="file" id="importFileInput" accept=".json,application/json" style="display:none" onchange="importJSON(this)">
  </div>
  </div>`;
}
function exportJSON(){
  const blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download='rima-battle-backup.json'; a.click();
  URL.revokeObjectURL(url);
}
function importJSON(input){
  const file=input.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const data=JSON.parse(e.target.result);
      if(!data||!Array.isArray(data.mcs)||!Array.isArray(data.battles)) throw new Error('formato inválido');
      db=normalizeDB(data);
      save();
      closeMcModal();
      alert('Backup importado com sucesso!');
      nav('home');
      render();
    }catch(err){ alert('Arquivo inválido: '+err.message); }
  };
  reader.readAsText(file);
  input.value='';
}

/* ================= MCs ================= */
function viewMcs(){
  const rows=db.mcs.slice().sort((a,b)=>b.nivel-a.nivel).map(m=>`
    <div class="mcrow"><div>${mcLink(m.id)}<div class="muted">${esc(m.estado)}</div></div>
    <div style="display:flex;align-items:center;gap:10px;"><span class="lvl">${m.nivel}</span><span onclick="delMc('${m.id}')" style="color:var(--accent2);font-weight:900;cursor:pointer;">✕</span></div></div>`).join('');
  return `${topbar('MCs','Cadastro de MCs','home')}
  <div class="content">
    <div class="card">
      <h3>Novo MC</h3>
      <label>Nome</label><input id="mcname" placeholder="Nome do MC">
      <label>Estado</label><input id="mcestado" placeholder="Ex: SP">
      <label>Nível (0-100)</label><input id="mcnivel" type="number" min="0" max="100" placeholder="0 a 100">
      <button class="btn" onclick="addMc()">Cadastrar MC</button>
    </div>
    <div class="card mclist"><h3>MCs cadastrados</h3>${rows||'<p class="muted">Nenhum MC cadastrado.</p>'}</div>
  </div>`;
}
function addMc(){
  const name=document.getElementById('mcname').value.trim();
  const estado=document.getElementById('mcestado').value.trim();
  let nivel=parseInt(document.getElementById('mcnivel').value);
  if(!name||!estado||isNaN(nivel)) return alert('Preencha nome, estado e nível.');
  nivel=Math.max(0,Math.min(100,nivel));
  db.mcs.push({id:uid(),name,estado,nivel});
  save(); render();
}
function delMc(id){
  if(!confirm('Excluir este MC definitivamente? Ele será removido de todas as batalhas, seleções e rankings.')) return;
  db.mcs=db.mcs.filter(m=>m.id!==id);
  db.battles.forEach(b=>{
    b.mcIds=b.mcIds.filter(x=>x!==id);
    if(b.ranking[id]!==undefined) delete b.ranking[id];
    (b.seasonHistory||[]).forEach(s=>{ if(s.championMcId===id) s.championMcId=null; });
  });
  Object.values(db.national.states).forEach(sd=>{
    if(sd.estadualChampionMcId===id){ sd.estadualChampionMcId=null; sd.estadualDone=false; }
  });
  if(db.national.nacional && db.national.nacional.championMcId===id) db.national.nacional.championMcId=null;
  save();
  if(window.__modalMcId===id) closeMcModal();
  render();
}

/* ================= MC MODAL ================= */
window.__modalMcId=null; window.__modalTab='geral';
function openMcModal(id){ if(!mcExists(id)) return; window.__modalMcId=id; window.__modalTab='geral'; renderMcModal(); }
function closeMcModal(){ document.getElementById('modalRoot').innerHTML=''; window.__modalMcId=null; }
function switchModalTab(tab){ window.__modalTab=tab; renderMcModal(); }
function renderMcModal(){
  const id=window.__modalMcId; const m=mcById(id); const root=document.getElementById('modalRoot');
  if(!m){ root.innerHTML=''; return; }
  const tab=window.__modalTab;
  const mcBattles=db.battles.filter(bt=>bt.mcIds.includes(id));
  const GRAY='#33394a';
  let body='', cardStyle=`background:${GRAY};border-top-color:var(--accent);`;
  if(tab==='geral'){
    const matches=collectMatchesForMc(id);
    const wins=matches.filter(x=>x.won).length, losses=matches.length-wins;
    const winrate=matches.length?Math.round(wins/matches.length*100):0;
    const titles=collectTitles(id);
    const participacoes=collectParticipations(id);
    body=`<div class="statgrid">
      <div class="statbox"><b>${matches.length}</b><span>Batalhas</span></div>
      <div class="statbox"><b>${wins}</b><span>Vitórias</span></div>
      <div class="statbox"><b>${losses}</b><span>Derrotas</span></div>
      <div class="statbox"><b>${winrate}%</b><span>Aproveitamento</span></div>
      <div class="statbox"><b>${participacoes}</b><span>Participações</span></div>
      <div class="statbox"><b>${titles.length}</b><span>Títulos</span></div>
    </div>
    <h4>Títulos gerais (${titles.length})</h4>
    <div class="titlelist">${titles.length?titles.map(t=>`<div class="titlerow"><span class="badge">${t.type}</span> ${esc(t.label)}</div>`).join(''):'<p class="muted">Nenhum título ainda.</p>'}</div>`;
  } else {
    const battle=battleById(tab);
    if(!battle){ window.__modalTab='geral'; return renderMcModal(); }
    const matches=battleMatchesForMc(battle,id);
    const wins=matches.filter(x=>x.won).length, losses=matches.length-wins;
    const titleCount=titleCountsForBattle(battle)[id]||0;
    const participacoes=battleParticipations(battle,id);
    const tierColors=titleTierColor(titleCount);
    const s1=tierColors?tierColors[0]:battle.color, s2=tierColors?tierColors[1]:battle.color2;
    cardStyle=`background:linear-gradient(135deg,${s1},${s2});border-top-color:${s1};`;
    body=`<div class="statgrid">
      <div class="statbox"><b>${participacoes}</b><span>Participações</span></div>
      <div class="statbox"><b>${wins}</b><span>Vitórias</span></div>
      <div class="statbox"><b>${losses}</b><span>Derrotas</span></div>
      <div class="statbox"><b>${titleCount}</b><span>Títulos</span></div>
    </div>`;
  }
  const tabsHtml=`<div class="mtab ${tab==='geral'?'active':''}" onclick="switchModalTab('geral')">Geral</div>`+
    mcBattles.map(bt=>`<div class="mtab ${tab===bt.id?'active':''}" onclick="switchModalTab('${bt.id}')">${esc(bt.name)}</div>`).join('');
  root.innerHTML=`<div class="modalOverlay" onclick="if(event.target===this)closeMcModal()">
    <div class="modalCard" style="${cardStyle}">
      <div class="modalHead"><h2>${esc(m.name)}</h2><span class="modalClose" onclick="closeMcModal()">✕</span></div>
      <div class="muted" style="margin-bottom:12px;">${esc(m.estado)} · Nível ${m.nivel}</div>
      <div class="modalTabs">${tabsHtml}</div>
      ${body}
      <h4>Editar MC</h4>
      <label>Nome</label><input id="editMcName" value="${esc(m.name)}">
      <label>Nível (0-100)</label><input id="editMcNivel" type="number" min="0" max="100" value="${m.nivel}">
      <button class="btn" onclick="saveMcEdit('${id}')">Salvar alterações</button>
    </div>
  </div>`;
}
function saveMcEdit(id){
  const m=mcById(id); if(!m) return;
  const name=document.getElementById('editMcName').value.trim();
  let nivel=parseInt(document.getElementById('editMcNivel').value);
  if(!name||isNaN(nivel)) return alert('Preencha nome e nível.');
  m.name=name; m.nivel=Math.max(0,Math.min(100,nivel));
  save(); renderMcModal(); render();
}

/* ================= NACIONAL HOME ================= */
function viewNacionalHome(){
  const estados=estadosDisponiveis();
  const rows=estados.map(e=>{
    const sd=getStateData(e);
    let status='Não iniciado';
    if(sd.estadualDone) status='Campeão: '+esc(mcName(sd.estadualChampionMcId));
    else if(sd.built) status='Em andamento';
    return `<div class="navcard" onclick="nav('nacional/estado/${encodeURIComponent(e)}')"><div><h3>${esc(e)}</h3><div class="muted">${status}</div></div><div class="chev">›</div></div>`;
  }).join('');
  const champCount=estados.filter(e=>getStateData(e).estadualDone).length;
  let nacBtn='';
  if(db.national.nacional){
    nacBtn=`<div class="navcard" onclick="nav('nacional/main')"><div><h3>🏆 Nacional</h3><div class="muted">${db.national.nacional.phase==='done'?'Campeão: '+esc(mcName(db.national.nacional.championMcId)):'Em andamento'}</div></div><div class="chev">›</div></div>`;
  } else {
    nacBtn=`<div class="card"><h3>Nacional</h3><p class="muted">Estados com campeão estadual: ${champCount} (mínimo 4)</p><button class="btn gold" ${champCount<4?'disabled':''} onclick="iniciarNacional()">Iniciar Nacional</button></div>`;
  }
  return `${topbar('Estrutura Nacional','Regional → Estadual → Nacional','home')}
  <div class="content">
    <div class="list-grid">${estados.length? rows : '<p class="muted">Cadastre MCs com estado definido para começar.</p>'}</div>
    ${nacBtn}
    <div class="card"><h3>Reiniciar</h3><p class="muted">Apaga todo o progresso de Regionais, Estaduais e do Nacional (os MCs cadastrados não são afetados).</p><button class="btn danger" onclick="resetNacional()">Reiniciar Estrutura Nacional</button></div>
  </div>`;
}
function resetNacional(){
  if(!confirm('Isso vai apagar TODO o progresso da estrutura Nacional (Regionais, Estaduais e Nacional). Deseja continuar?')) return;
  db.national={states:{},nacional:null};
  save(); render();
}

/* ================= ESTADO ================= */
window.__editEstado={};
function toggleEditEstado(estado){ window.__editEstado[estado]=!window.__editEstado[estado]; render(); }
function saveEstadoColors(estado){
  const sd=getStateData(estado);
  sd.color=document.getElementById('editEstadoColor1').value;
  sd.color2=document.getElementById('editEstadoColor2').value;
  save(); window.__editEstado[estado]=false; render();
}
function viewEstado(estado){
  const mcs=mcsByEstado(estado);
  const size=computeStateSize(mcs.length);
  const sd=getStateData(estado);
  if(sd.color) applyBattleTheme(sd.color,sd.color2);
  const showEdit=!!window.__editEstado[estado];
  const editBlock=`<div class="card">
    <button class="btn secondary small" onclick="toggleEditEstado('${estado.replace(/'/g,"\\'")}')">${showEdit?'Cancelar':'Editar Estadual (cores)'}</button>
    ${showEdit?`<div style="margin-top:12px;">
      <div class="grid2">
        <div><label>Cor principal</label><input type="color" id="editEstadoColor1" value="${sd.color||'#2f6bff'}"></div>
        <div><label>Cor secundária</label><input type="color" id="editEstadoColor2" value="${sd.color2||'#ff2d4d'}"></div>
      </div>
      <button class="btn" onclick="saveEstadoColors('${estado.replace(/'/g,"\\'")}')">Salvar cores</button>
    </div>`:''}
  </div>`;
  let body='';
  if(!sd.built){
    if(!size){
      body=`<div class="card"><p>Este estado possui <b>${mcs.length}</b> MC(s). São necessários no mínimo <b>8</b> MCs para habilitar a estrutura Nacional/Estadual.</p></div>`;
    } else {
      body=`<div class="card"><p>MCs disponíveis: <b>${mcs.length}</b></p><p>Tamanho da estrutura: <b>${size}</b></p>
      <button class="btn" onclick="sortearEstrutura('${estado.replace(/'/g,"\\'")}')">Sortear Estrutura</button></div>`;
    }
  } else {
    if(sd.regionals && sd.regionals.length){
      body+=`<div class="card"><h3>Regionais</h3><div class="list-grid">`;
      sd.regionals.forEach(reg=>{
        const done=isBracketComplete(reg.bracket);
        body+=`<div class="navcard" onclick="nav('nacional/regional/${encodeURIComponent(estado)}/${reg.idx}')"><div><h3>Regional ${reg.idx}</h3><div class="muted">${done?'Concluído':'Em andamento'}</div></div><div class="chev">›</div></div>`;
      });
      body+=`</div></div>`;
    }
    const allRegionaisDone=!sd.regionals || sd.regionals.length===0 || sd.regionals.every(r=>isBracketComplete(r.bracket));
    if(sd.regionals && sd.regionals.length && !sd.estadualBracket){
      body+=`<div class="card"><h3>Estadual</h3><p class="muted">${allRegionaisDone?'Regionais concluídos. Pronto para sorteio.':'Aguardando conclusão dos Regionais.'}</p>
      <button class="btn" ${allRegionaisDone?'':'disabled'} onclick="sortearEstadual('${estado.replace(/'/g,"\\'")}')">Sortear Estadual</button></div>`;
    } else if(sd.estadualBracket){
      const done=isBracketComplete(sd.estadualBracket);
      body+=`<div class="navcard" onclick="nav('nacional/estadual/${encodeURIComponent(estado)}')"><div><h3>Estadual</h3><div class="muted">${done?'Campeão: '+esc(mcName(sd.estadualChampionMcId)):'Em andamento'}</div></div><div class="chev">›</div></div>`;
    }
  }
  return `${topbar(estado,'Estrutura Nacional deste estado','nacional')}
  <div class="content">${editBlock}${body}</div>`;
}
function sortearEstrutura(estado){
  const mcs=mcsByEstado(estado);
  const size=computeStateSize(mcs.length);
  if(!size) return;
  const chosen=shuffle(mcs.map(m=>m.id)).slice(0,size);
  const sd=getStateData(estado);
  sd.size=size; sd.built=true;
  if(size===8||size===16){
    sd.regionals=[];
    const parts=shuffle(chosen).map(mcParticipant);
    sd.estadualBracket=buildBracket(parts);
  } else {
    const numRegionals=size/16;
    const classifiedPerRegional=(size===128)?2:4;
    const groups=chunk(shuffle(chosen),16);
    sd.classifiedPerRegional=classifiedPerRegional;
    sd.regionals=groups.map((g,i)=>({idx:i+1,bracket:buildBracket(shuffle(g).map(mcParticipant)),classified:null}));
    sd.estadualBracket=null;
  }
  save(); render();
}
function sortearEstadual(estado){
  const sd=getStateData(estado);
  let allIds=[];
  sd.regionals.forEach(reg=>{
    if(!reg.classified) reg.classified=classifiedFromRegional(reg.bracket,sd.classifiedPerRegional);
    allIds=allIds.concat(reg.classified);
  });
  const parts=shuffle(allIds).map(mcParticipant);
  sd.estadualBracket=buildBracket(parts);
  save(); nav('nacional/estadual/'+encodeURIComponent(estado));
}

/* ================= REGIONAL / ESTADUAL VIEWS ================= */
function viewRegional(estado,idx){
  const sd=getStateData(estado);
  if(sd.color) applyBattleTheme(sd.color,sd.color2);
  const reg=sd.regionals.find(r=>r.idx===idx);
  const html=renderBracketBlock(reg.bracket,2,'simRegional',[`'${estado.replace(/'/g,"\\'")}'`,idx]);
  return `${topbar('Regional '+idx,estado,'nacional/estado/'+encodeURIComponent(estado))}
  <div class="content"><div class="card">${html}</div></div>`;
}
function simRegional(estado,idx,mode){
  const sd=getStateData(estado);
  const reg=sd.regionals.find(r=>r.idx===idx);
  if(mode==='one') simulateOne(reg.bracket,2);
  if(mode==='phase') simulatePhase(reg.bracket,2);
  if(mode==='all') simulateAll(reg.bracket,2);
  save(); render();
}
function viewEstadual(estado){
  const sd=getStateData(estado);
  if(sd.color) applyBattleTheme(sd.color,sd.color2);
  const html=renderBracketBlock(sd.estadualBracket,2,'simEstadual',[`'${estado.replace(/'/g,"\\'")}'`]);
  if(isBracketComplete(sd.estadualBracket) && !sd.estadualDone){
    sd.estadualChampionMcId=bracketChampion(sd.estadualBracket);
    sd.estadualDone=true; save();
  }
  return `${topbar('Estadual',estado,'nacional/estado/'+encodeURIComponent(estado))}
  <div class="content"><div class="card">${html}</div></div>`;
}
function simEstadual(estado,mode){
  const sd=getStateData(estado);
  if(mode==='one') simulateOne(sd.estadualBracket,2);
  if(mode==='phase') simulatePhase(sd.estadualBracket,2);
  if(mode==='all') simulateAll(sd.estadualBracket,2);
  save(); render();
}

/* ================= NACIONAL MAIN ================= */
function iniciarNacional(){
  const estados=estadosDisponiveis().filter(e=>{ const sd=getStateData(e); return sd.estadualDone && mcExists(sd.estadualChampionMcId); });
  const participants=estados.map(e=>{ const sd=getStateData(e); const m=mcById(sd.estadualChampionMcId); return {id:m.id,kind:'mc',name:m.name,level:m.nivel,estado:e}; });
  const n=participants.length;
  const target=nextValidNacional(n);
  const excess=n-target;
  const nacional={n,target,excess,championMcId:null,phase:null,prefaseBracket:null,mainBracket:null,directGroup:null,prefaseGroup:null};
  if(excess>0){
    const prefaseCount=2*excess;
    const shuffled=shuffle(participants);
    const prefaseGroup=shuffled.slice(0,prefaseCount);
    const directGroup=shuffled.slice(prefaseCount);
    nacional.directGroup=directGroup;
    nacional.prefaseGroup=prefaseGroup;
    nacional.prefaseBracket=buildFlatRound(prefaseGroup);
    nacional.mainBracket=null;
    nacional.phase='prefase';
  } else {
    nacional.directGroup=participants;
    nacional.prefaseGroup=[];
    nacional.mainBracket=buildBracket(shuffle(participants));
    nacional.phase='main';
  }
  db.national.nacional=nacional;
  save(); nav('nacional/main');
}
function viewNacionalMain(){
  const nac=db.national.nacional;
  if(!nac) return `${topbar('Nacional','','nacional')}<div class="content"><p class="muted">Nacional ainda não iniciado.</p></div>`;
  let body='';
  body+=`<div class="card"><p>Estados participantes: <b>${nac.n}</b></p><p>Tamanho do bracket principal: <b>${nac.target}</b></p>${nac.excess>0?`<p>Vagas diretas: <b>${nac.directGroup.length}</b> · Pré-fase: <b>${nac.prefaseGroup.length}</b> MC(s)</p>`:''}</div>`;
  if(nac.prefaseBracket){
    body+=`<div class="card"><h3>Pré-fase</h3>${renderFlatBlock(nac.prefaseBracket,'simNacional')}</div>`;
  }
  if(nac.phase==='main' && nac.mainBracket){
    body+=`<div class="card"><h3>Bracket Nacional</h3>${renderBracketBlock(nac.mainBracket,2,'simNacionalMain',[])}</div>`;
    if(isBracketComplete(nac.mainBracket) && !nac.championMcId){
      nac.championMcId=bracketChampion(nac.mainBracket); nac.phase='done'; save();
    }
  }
  if(nac.phase==='done'){
    body+=`<div class="card" style="text-align:center;"><h2>🏆 Campeão Nacional</h2><h1>${mcLink(nac.championMcId)}</h1></div>`;
  }
  return `${topbar('Nacional','Bracket nacional','nacional')}<div class="content">${body}</div>`;
}
function simNacional(mode){
  const nac=db.national.nacional;
  if(mode==='one') simulateOne(nac.prefaseBracket,2);
  if(mode==='phase'||mode==='all') simulatePhase(nac.prefaseBracket,2);
  if(isBracketComplete(nac.prefaseBracket) && nac.phase==='prefase'){
    const winners=nac.prefaseBracket.rounds[0].map(m=>m.winner).filter(Boolean);
    const winnerParts=winners.map(id=>nac.prefaseBracket.participants[id]);
    const combined=shuffle(nac.directGroup.concat(winnerParts));
    nac.mainBracket=buildBracket(combined);
    nac.phase='main';
  }
  save(); render();
}
function simNacionalMain(mode){
  const nac=db.national.nacional;
  if(mode==='one') simulateOne(nac.mainBracket,2);
  if(mode==='phase') simulatePhase(nac.mainBracket,2);
  if(mode==='all') simulateAll(nac.mainBracket,2);
  save(); render();
}

/* ================= BRACKET RENDER ================= */
function sideHTML(bracket,id,winnerId,done){
  if(!id) return `<div class="side"><span class="nm emptyslot">—</span></div>`;
  const p=bracket.participants[id];
  const isWin=done && winnerId===id;
  const nameHtml = p ? (p.kind==='mc' ? mcLink(p.id,p.name) : esc(p.name)) : '?';
  return `<div class="side ${isWin?'win':''}"><span class="nm">${nameHtml}</span><span>${p?p.level:''}</span></div>`;
}
function matchHTML(bracket,m){
  const scoreTxt=m.done?`<div class="muted" style="text-align:center;">${m.scoreA} x ${m.scoreB}</div>`:'';
  return `<div class="match ${m.done?'done':''}">${sideHTML(bracket,m.a,m.winner,m.done)}${scoreTxt}${sideHTML(bracket,m.b,m.winner,m.done)}</div>`;
}
function renderBracketBlock(bracket,targetWins,fnName,args){
  args=args||[];
  function call(mode){ return `${fnName}(${args.concat(["'"+mode+"'"]).join(',')})`; }
  let cols='';
  bracket.rounds.forEach(round=>{
    cols+=`<div class="round"><h4>${roundLabel(round.length)}</h4>${round.map(m=>matchHTML(bracket,m)).join('')}</div>`;
  });
  const complete=isBracketComplete(bracket);
  const champ=complete?bracketChampion(bracket):null;
  return `<div class="brackets-scroll">${cols}</div>
  ${complete?`<div class="badge">Campeão: ${bracket.participants[champ]?esc(bracket.participants[champ].name):''}</div>`:
  `<div class="actionsrow">
    <button class="btn small" onclick="${call('one')}">Simular Batalha</button>
    <button class="btn small secondary" onclick="${call('phase')}">Simular Fase</button>
    <button class="btn small gold" onclick="${call('all')}">Simular Tudo</button>
  </div>`}`;
}
function renderFlatBlock(bracket,fn){
  const round=bracket.rounds[0];
  const complete=isBracketComplete(bracket);
  return `<div class="round" style="min-width:0;">${round.map(m=>matchHTML(bracket,m)).join('')}</div>
  ${complete?'<div class="badge">Pré-fase concluída</div>':
  `<div class="actionsrow">
    <button class="btn small" onclick="${fn}('one')">Simular Batalha</button>
    <button class="btn small gold" onclick="${fn}('phase')">Simular Fase</button>
  </div>`}`;
}

/* ================= BATTLES ================= */
function viewBattles(){
  const rows=`<div class="list-grid">${db.battles.map(b=>{
    const txt=contrastText(b.color);
    const muted=txt==='#ffffff'?'rgba(255,255,255,.85)':'rgba(18,20,28,.7)';
    return `<div class="navcard" onclick="nav('battle/${b.id}')" style="background:linear-gradient(120deg,${b.color},${b.color2});border:none;">
      <div><h3 style="color:${txt};">${esc(b.name)}</h3><div class="muted" style="color:${muted};">${b.mcIds.length} MC(s) · ${b.editions.length} edição(ões)</div></div><div class="chev" style="color:${txt};">›</div>
    </div>`;}).join('')}</div>`;
  return `${topbar('Batalhas','Batalhas criadas pelo usuário','home')}
  <div class="content">
    <div class="card"><h3>Nova Batalha</h3>
      <label>Nome</label><input id="battlename" placeholder="Nome da batalha">
      <div class="grid2">
        <div><label>Cor principal</label><input type="color" id="battlecolor1" value="#144fe0"></div>
        <div><label>Cor secundária</label><input type="color" id="battlecolor2" value="#e11d33"></div>
      </div>
      <button class="btn" onclick="createBattle()">Criar Batalha</button>
    </div>
    ${db.battles.length?rows:'<p class="muted">Nenhuma batalha criada.</p>'}
  </div>`;
}
function createBattle(){
  const name=document.getElementById('battlename').value.trim();
  const color=document.getElementById('battlecolor1').value;
  const color2=document.getElementById('battlecolor2').value;
  if(!name) return alert('Digite um nome.');
  db.battles.push({id:uid(),name,color,color2,mcIds:[],editions:[],ranking:{},currentSeason:1,seasonHistory:[]});
  save(); nav('battles');
}

window.__showParticipants={};
window.__editBattle={};
function toggleParticipants(battleId){ window.__showParticipants[battleId]=!window.__showParticipants[battleId]; render(); }
function toggleEditBattle(battleId){ window.__editBattle[battleId]=!window.__editBattle[battleId]; render(); }
function saveBattleEdit(id){
  const b=battleById(id);
  const name=document.getElementById('editBattleName').value.trim();
  if(!name) return alert('Digite um nome.');
  b.name=name;
  b.color=document.getElementById('editBattleColor1').value;
  b.color2=document.getElementById('editBattleColor2').value;
  save(); window.__editBattle[id]=false; render();
}
function deleteBattle(id){
  const b=battleById(id); if(!b) return;
  if(!confirm(`Excluir a batalha "${b.name}"? Isso apaga edições, ranking, temporadas e títulos dela. Os MCs cadastrados não são afetados. Essa ação não pode ser desfeita.`)) return;
  db.battles=db.battles.filter(x=>x.id!==id);
  save(); nav('battles');
}

function viewBattleDetail(id){
  const b=battleById(id); if(!b) return viewBattles();
  cleanupRanking(b); save();
  applyBattleTheme(b.color,b.color2);
  const mcCheck=db.mcs.map(m=>`
    <label class="checkline"><input type="checkbox" id="chk_${m.id}" ${b.mcIds.includes(m.id)?'checked':''} onchange="toggleMc('${b.id}','${m.id}')"><span>${esc(m.name)} <span class="muted">(${esc(m.estado)} · ${m.nivel})</span></span></label>`).join('');
  const editions=`<div class="list-grid">${b.editions.map(ed=>`
    <div class="navcard" onclick="nav('edition/${b.id}/${ed.id}')"><div><h3>${esc(ed.name)}</h3><div class="muted">${esc(ed.formatLabel)} · ${ed.status==='drawn'?(isBracketComplete(ed.bracket)?'Concluída':'Em andamento'):'Aguardando sorteio'}</div></div><div class="chev">›</div></div>`).join('')}</div>`;
  const ranking=Object.entries(b.ranking).sort((x,y)=>y[1]-x[1]);
  const rankRows=ranking.map((r,i)=>`<div class="rankrow"><div><span class="pos">${i+1}º</span> ${mcLink(r[0])}</div><b>${r[1]} pts</b></div>`).join('');
  const titleCounts=titleCountsForBattle(b);
  const titleRanking=Object.entries(titleCounts).sort((x,y)=>y[1]-x[1]);
  const titleRows=titleRanking.map((r,i)=>`<div class="rankrow"><div><span class="pos">${i+1}º</span> ${mcLink(r[0])}</div><b>${r[1]} título(s)</b></div>`).join('');
  const campeoes=ultimosCampeoes(b);
  const campHtml=campeoes.length?campeoes.map(c=>`<div class="champrow"><span class="badge">${esc(c.edition)}</span> ${c.label.kind==='mc'?mcLink(c.label.ids[0],c.label.name):esc(c.label.name)}</div>`).join(''):'<p class="muted">Nenhuma edição concluída ainda.</p>';
  const canCreateEdition=b.mcIds.length>=8;
  const showParts=!!window.__showParticipants[b.id];
  const showEdit=!!window.__editBattle[b.id];
  return `${topbar(b.name,b.mcIds.length+' MC(s) · Temporada '+b.currentSeason,'battles')}
  <div class="content">
    <div class="card">
      <div class="actionsrow" style="margin-top:0;">
        <button class="btn secondary small" onclick="toggleEditBattle('${b.id}')">${showEdit?'Cancelar edição':'Editar Batalha'}</button>
        <button class="btn danger small" onclick="deleteBattle('${b.id}')">Excluir Batalha</button>
      </div>
      ${showEdit?`<div style="margin-top:12px;">
        <label>Nome</label><input id="editBattleName" value="${esc(b.name)}">
        <div class="grid2">
          <div><label>Cor principal</label><input type="color" id="editBattleColor1" value="${b.color}"></div>
          <div><label>Cor secundária</label><input type="color" id="editBattleColor2" value="${b.color2}"></div>
        </div>
        <button class="btn" onclick="saveBattleEdit('${b.id}')">Salvar Batalha</button>
      </div>`:''}
    </div>
    <div class="card">
      <h3>MCs participantes</h3>
      <button class="btn secondary small" onclick="toggleParticipants('${b.id}')">${showParts?'Ocultar lista':'Ver / selecionar MCs participantes'}</button>
      <p class="note">Mínimo de 8 MCs para criar edições (selecionados: <span id="mcSelCount">${b.mcIds.length}</span>).</p>
      ${showParts?`<div id="mcCheckList" style="margin-top:10px;">${mcCheck||'<p class="muted">Cadastre MCs primeiro.</p>'}</div>`:''}
    </div>
    <div class="card"><h3>🏆 Últimos Campeões</h3>${campHtml}</div>
    <div class="card"><h3>Edições</h3>${b.editions.length?editions:'<p class="muted">Nenhuma edição criada.</p>'}
      <button class="btn" id="createEditionBtn" ${canCreateEdition?'':'disabled'} onclick="nav('battle/newedition/${b.id}')">Criar Edição</button>
    </div>
    <div class="card"><h3>Ranking · Temporada ${b.currentSeason}</h3>${rankRows||'<p class="muted">Sem resultados ainda nesta temporada.</p>'}
      <button class="btn gold small" style="margin-top:12px;" onclick="finalizarTemporada('${b.id}')" ${ranking.length===0?'disabled':''}>Finalizar Temporada</button>
    </div>
    <div class="card"><h3>Ranking de Títulos</h3>${titleRows||'<p class="muted">Nenhum título conquistado ainda.</p>'}</div>
  </div>`;
}
function toggleMc(battleId,mcId){
  const b=battleById(battleId);
  if(b.mcIds.includes(mcId)) b.mcIds=b.mcIds.filter(x=>x!==mcId); else b.mcIds.push(mcId);
  save();
  const btn=document.getElementById('createEditionBtn'); if(btn) btn.disabled=b.mcIds.length<8;
  const cnt=document.getElementById('mcSelCount'); if(cnt) cnt.textContent=b.mcIds.length;
}
function finalizarTemporada(battleId){
  const b=battleById(battleId);
  const ranking=Object.entries(b.ranking).sort((x,y)=>y[1]-x[1]);
  if(ranking.length===0) return;
  if(!confirm(`Finalizar a Temporada ${b.currentSeason}? O ranking atual será zerado e uma nova temporada começará.`)) return;
  const championMcId=ranking[0][0];
  b.seasonHistory.push({season:b.currentSeason,championMcId});
  b.ranking={};
  b.currentSeason+=1;
  save(); render();
}

/* ================= NEW EDITION ================= */
function viewNewEdition(battleId){
  const b=battleById(battleId); if(!b) return viewBattles();
  applyBattleTheme(b.color,b.color2);
  const n=b.mcIds.length;
  const soloOpts=[8,16].filter(s=>n>=s).map(s=>`<option value="solo${s}">Solo - ${s} MCs</option>`).join('');
  return `${topbar('Nova Edição',b.name,'battle/'+b.id)}
  <div class="content">
    <div class="card">
      <label>Nome da edição</label><input id="edname" placeholder="Ex: Edição 01" value="Edição ${b.editions.length+1}">
      <label>Formato</label>
      <select id="edformat" onchange="updateTeamOptions('${b.id}')">
        ${soloOpts}
        <option value="dupla">Duplas</option>
        <option value="trio">Trios</option>
        <option value="quarteto">Quartetos</option>
      </select>
      <div id="teamcountwrap"></div>
      <button class="btn" onclick="createEdition('${b.id}')">Criar e Sortear</button>
    </div>
  </div>`;
}
function updateTeamOptions(battleId){
  const b=battleById(battleId);
  const fmtEl=document.getElementById('edformat'); if(!fmtEl) return;
  const fmt=fmtEl.value;
  const wrap=document.getElementById('teamcountwrap');
  const teamSizeMap={dupla:2,trio:3,quarteto:4};
  if(teamSizeMap[fmt]){
    const ts=teamSizeMap[fmt];
    const maxTeams=Math.floor(b.mcIds.length/ts);
    const opts=[4,8,16,32].filter(v=>v<=maxTeams);
    wrap.innerHTML=`<label>Quantidade de equipes</label><select id="teamcount">${opts.map(o=>`<option value="${o}">${o} equipes (${o*ts} MCs)</option>`).join('')||'<option disabled>MCs insuficientes</option>'}</select>`;
  } else { wrap.innerHTML=''; }
}
function weightedDraft(battle,needed){
  const ids=battle.mcIds.slice();
  const sorted=ids.slice().sort((x,y)=>(battle.ranking[y]||0)-(battle.ranking[x]||0));
  const topCount=Math.min(8,sorted.length);
  const restCount=sorted.length-topCount;
  const topW=topCount>0?0.8/topCount:0;
  const restW=restCount>0?0.2/restCount:0;
  const weight={};
  sorted.forEach((id,i)=>{ weight[id]=i<topCount?topW:restW; });
  const keyed=ids.map(id=>({id,key:Math.pow(Math.random(),1/Math.max(weight[id],1e-6))}));
  keyed.sort((a,b)=>b.key-a.key);
  return keyed.slice(0,needed).map(x=>x.id);
}
function createEdition(battleId){
  const b=battleById(battleId);
  const name=document.getElementById('edname').value.trim()||'Edição';
  const fmt=document.getElementById('edformat').value;
  let size,teamSize,targetWins,formatLabel;
  if(fmt==='solo8'||fmt==='solo16'){ size=fmt==='solo8'?8:16; teamSize=1; targetWins=2; formatLabel='Solo - '+size+' MCs'; }
  else {
    const tc=document.getElementById('teamcount');
    if(!tc||!tc.value) return alert('MCs insuficientes para este formato.');
    size=parseInt(tc.value);
    teamSize=fmt==='dupla'?2:fmt==='trio'?3:4;
    targetWins=fmt==='dupla'?2:3;
    formatLabel=(fmt==='dupla'?'Duplas':fmt==='trio'?'Trios':'Quartetos')+' - '+size+' equipes';
  }
  const needed=size*teamSize;
  if(b.mcIds.length<needed) return alert('MCs insuficientes.');
  const pool=weightedDraft(b,needed);
  let participants;
  if(teamSize===1){
    participants=pool.map(mcParticipant);
  } else {
    const groups=chunk(pool,teamSize);
    participants=groups.map(g=>{
      const mcs=g.map(mcById);
      const level=Math.round(mcs.reduce((s,m)=>s+m.nivel,0)/mcs.length);
      return {id:uid(),kind:'team',name:mcs.map(m=>m.name).join(' & '),level,mcIds:g};
    });
  }
  const bracket=buildBracket(shuffle(participants));
  const edition={id:uid(),name,format:fmt,formatLabel,size,teamSize,targetWins,bracket,status:'drawn',pointsApplied:false};
  b.editions.push(edition);
  save(); nav('edition/'+b.id+'/'+edition.id);
}

/* ================= EDITION VIEW ================= */
function viewEdition(battleId,edId){
  const b=battleById(battleId); if(!b) return viewBattles();
  const ed=b.editions.find(e=>e.id===edId); if(!ed) return viewBattleDetail(battleId);
  applyBattleTheme(b.color,b.color2);
  applyRankingIfNeeded(b,ed);
  const html=renderBracketBlock(ed.bracket,ed.targetWins,'simEdition',[`'${battleId}'`,`'${edId}'`]);
  return `${topbar(ed.name,ed.formatLabel,'battle/'+battleId)}
  <div class="content"><div class="card">${html}</div></div>`;
}
function simEdition(battleId,edId,mode){
  const b=battleById(battleId); const ed=b.editions.find(e=>e.id===edId);
  if(mode==='one') simulateOne(ed.bracket,ed.targetWins);
  if(mode==='phase') simulatePhase(ed.bracket,ed.targetWins);
  if(mode==='all') simulateAll(ed.bracket,ed.targetWins);
  applyRankingIfNeeded(b,ed);
  save(); render();
}

/* ================= INIT ================= */
render();
