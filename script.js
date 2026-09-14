/* ================= DB ================= */
const DB_KEY='rimabattle_v2';
function normalizeDB(d){
  if(!d) d={mcs:[],battles:[],national:{states:{},nacional:null}};
  d.mcs=d.mcs||[];
  d.battles=(d.battles||[]).map(b=>({
    id:b.id,name:b.name,color:b.color||'#144fe0',color2:b.color2||'#e11d33',
    mcIds:b.mcIds||[],editions:b.editions||[],ranking:b.ranking||{},
    currentSeason:b.currentSeason||1, seasonHistory:b.seasonHistory||[],
    scoring:b.scoring||undefined,
    estado:b.estado||'', tipo:b.tipo||'mainstream'
  }));
  d.events=(d.events||[]).map(ev=>({
    id:ev.id,name:ev.name,color:ev.color||'#144fe0',color2:ev.color2||'#e11d33',
    mcIds:ev.mcIds||[],editions:ev.editions||[]
  }));
  d.national=d.national||{states:{},nacional:null};
  d.national.states=d.national.states||{};
  if(d.national.classificationMode===undefined) d.national.classificationMode='campeao';
  if(d.national.classificationLocked===undefined) d.national.classificationLocked=false;
  d.nationalConfig=d.nationalConfig||{};
  d.liga=d.liga||{};
  d.liga.color=d.liga.color||'#2f6bff';
  d.liga.color2=d.liga.color2||'#ff2d4d';
  d.liga.seasonNumber=d.liga.seasonNumber||1;
  d.liga.seasonOffsets=d.liga.seasonOffsets||{};
  d.liga.seasonHistory=d.liga.seasonHistory||[];
  d.nationalTitles=d.nationalTitles||[];
  d.fms=d.fms||{history:[],current:null};
  d.fms.color=d.fms.color||'#2f6bff';
  d.fms.color2=d.fms.color2||'#ff2d4d';
  d.fmsTitles=d.fmsTitles||[];
  backfillNationalTitles(d);
  return d;
}
function backfillNationalTitles(d){
  Object.entries(d.national.states||{}).forEach(([estado,sd])=>{
    (sd.regionals||[]).forEach(reg=>{
      if(reg.bracket && isBracketComplete(reg.bracket) && !reg.titleLogged){
        const champ=bracketChampion(reg.bracket);
        if(champ) d.nationalTitles.push({mcId:champ,type:'Regional',label:`Campeão Regional ${reg.idx} - ${estado}`});
        reg.titleLogged=true;
      }
    });
    if(sd.estadualBracket && isBracketComplete(sd.estadualBracket) && sd.estadualChampionMcId && !sd.estadualTitleLogged){
      d.nationalTitles.push({mcId:sd.estadualChampionMcId,type:'Estadual',label:`Campeão Estadual - ${estado}`});
      sd.estadualTitleLogged=true;
    }
  });
  const nac=d.national.nacional;
  if(nac && nac.phase==='done' && nac.championMcId && !nac.titleLogged){
    d.nationalTitles.push({mcId:nac.championMcId,type:'Nacional',label:'Campeão Nacional'});
    nac.titleLogged=true;
  }
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
function eventById(id){return db.events.find(e=>e.id===id);}

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
function computePlacements(bracket,scoring){
  const res={};
  const totalRounds=bracket.rounds.length;
  const finalMatch=bracket.rounds[totalRounds-1][0];
  if(finalMatch && finalMatch.done) res[finalMatch.winner]=scoring?scoring.campeao:9;
  for(let i=totalRounds-1;i>=0;i--){
    const depth=totalRounds-1-i;
    let pts;
    if(scoring){ pts = depth===0?scoring.vice : depth===1?scoring.semi : depth===2?scoring.quartas : scoring.primeira; }
    else { pts = pointsForDepth(depth); }
    bracket.rounds[i].forEach(m=>{ if(m.done && m.loser!=null && res[m.loser]===undefined) res[m.loser]=pts; });
  }
  Object.keys(res).forEach(pid=>{
    const bonus=count20WinsForParticipant(bracket,pid);
    if(bonus) res[pid]+=bonus;
  });
  return res;
}
function count20WinsForParticipant(bracket,pid){
  let c=0;
  bracket.rounds.forEach(round=>round.forEach(m=>{
    if(m.done && m.winner===pid){
      const diff=Math.abs((m.scoreA||0)-(m.scoreB||0));
      if(diff===2) c++;
    }
  }));
  return c;
}
function applyRankingIfNeeded(battle,edition){
  if(edition.pointsApplied) return;
  if(!isBracketComplete(edition.bracket)) return;
  if(edition.excludeFromRanking){ edition.pointsApplied=true; save(); return; }
  const pts=computePlacements(edition.bracket,battle.scoring);
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

/* ================= LIGA CENTRAL ================= */
function placementsPerMc(bracket,scoring){
  const raw=computePlacements(bracket,scoring);
  const out={};
  Object.keys(raw).forEach(pid=>{
    const meta=bracket.participants[pid]; if(!meta) return;
    const val=raw[pid];
    if(meta.kind==='team'){ meta.mcIds.forEach(mid=>{ if(mcExists(mid)) out[mid]=(out[mid]||0)+val; }); }
    else { if(mcExists(pid)) out[pid]=(out[pid]||0)+val; }
  });
  return out;
}
function ligaWeeklyRanking(){
  const totals={};
  db.battles.forEach(b=>{
    if(!b.editions.length) return;
    const ed=b.editions[b.editions.length-1];
    if(!isBracketComplete(ed.bracket) || ed.excludeFromRanking) return;
    const pm=placementsPerMc(ed.bracket,b.scoring);
    Object.keys(pm).forEach(mid=>{ totals[mid]=(totals[mid]||0)+pm[mid]; });
  });
  return totals;
}
function ligaSeasonRanking(){
  const offsets=db.liga.seasonOffsets||{};
  const totals={};
  db.battles.forEach(b=>{
    const start=offsets[b.id]||0;
    for(let i=start;i<b.editions.length;i++){
      const ed=b.editions[i];
      if(!isBracketComplete(ed.bracket) || ed.excludeFromRanking) continue;
      const pm=placementsPerMc(ed.bracket,b.scoring);
      Object.keys(pm).forEach(mid=>{ totals[mid]=(totals[mid]||0)+pm[mid]; });
    }
  });
  return totals;
}
window.__editLiga=false;
function toggleEditLiga(){ window.__editLiga=!window.__editLiga; render(); }
function saveLigaColors(){
  db.liga.color=document.getElementById('editLigaColor1').value;
  db.liga.color2=document.getElementById('editLigaColor2').value;
  save(); window.__editLiga=false; render();
}
function finalizarTemporadaLiga(){
  const ranking=Object.entries(ligaSeasonRanking()).sort((a,b)=>b[1]-a[1]);
  if(ranking.length===0) return;
  if(!confirm(`Finalizar a Temporada ${db.liga.seasonNumber} da Liga Central? O ranking de temporada será zerado (as batalhas individuais não são afetadas).`)) return;
  const championMcId=ranking[0][0];
  db.liga.seasonHistory.push({season:db.liga.seasonNumber,championMcId});
  const offsets={}; db.battles.forEach(b=>{ offsets[b.id]=b.editions.length; });
  db.liga.seasonOffsets=offsets;
  db.liga.seasonNumber+=1;
  save(); render();
}
window.__ligaTab='semanal';
function switchLigaTab(tab){ window.__ligaTab=tab; render(); }
function viewLiga(){
  applyBattleTheme(db.liga.color,db.liga.color2);
  const showEdit=!!window.__editLiga;
  const weekly=Object.entries(ligaWeeklyRanking()).sort((a,b)=>b[1]-a[1]);
  const season=Object.entries(ligaSeasonRanking()).sort((a,b)=>b[1]-a[1]);
  const weeklyRows=weekly.map((r,i)=>`<div class="rankrow"><div><span class="pos">${i+1}º</span> ${mcLink(r[0])}</div><b>${r[1]} pts</b></div>`).join('');
  const seasonRows=season.map((r,i)=>`<div class="rankrow"><div><span class="pos">${i+1}º</span> ${mcLink(r[0])}</div><b>${r[1]} pts</b></div>`).join('');
  const history=db.liga.seasonHistory.slice().reverse().map(s=>`<div class="champrow"><span class="badge">Temporada ${s.season}</span> ${mcLink(s.championMcId)}</div>`).join('');
  const tab=window.__ligaTab;
  return `${topbar('Liga Central','Ranking geral de todas as batalhas','battles')}
  <div class="content">
    <div class="card">
      <button class="btn secondary small" onclick="toggleEditLiga()">${showEdit?'Cancelar':'Editar Liga Central (cores)'}</button>
      ${showEdit?`<div style="margin-top:12px;">
        <div class="grid2">
          <div><label>Cor principal</label><input type="color" id="editLigaColor1" value="${db.liga.color}"></div>
          <div><label>Cor secundária</label><input type="color" id="editLigaColor2" value="${db.liga.color2}"></div>
        </div>
        <button class="btn" onclick="saveLigaColors()">Salvar cores</button>
      </div>`:''}
    </div>
    <div class="modalTabs" style="border-color:var(--line);">
      <div class="mtab ${tab==='semanal'?'active':''}" onclick="switchLigaTab('semanal')">Liga Semanal</div>
      <div class="mtab ${tab==='temporada'?'active':''}" onclick="switchLigaTab('temporada')">Liga da Temporada</div>
    </div>
    ${tab==='semanal'?`<div class="card"><h3>Ranking Semanal</h3><p class="note">Última edição de cada batalha, automático.</p>${weeklyRows||'<p class="muted">Sem resultados ainda.</p>'}</div>`:''}
    ${tab==='temporada'?`<div class="card"><h3>Ranking · Temporada ${db.liga.seasonNumber}</h3>${seasonRows||'<p class="muted">Sem resultados ainda nesta temporada.</p>'}
      <button class="btn gold small" style="margin-top:12px;" onclick="finalizarTemporadaLiga()" ${season.length===0?'disabled':''}>Finalizar Temporada</button>
    </div>
    ${history?`<div class="card"><h3>Campeões de Temporada</h3>${history}</div>`:''}`:''}
  </div>`;
}

/* ================= FMS VIEWS ================= */
window.__editFms=false;
function toggleEditFms(){ window.__editFms=!window.__editFms; render(); }
function saveFmsColors(){
  db.fms.color=document.getElementById('editFmsColor1').value;
  db.fms.color2=document.getElementById('editFmsColor2').value;
  save(); window.__editFms=false; render();
}
function fmsNameFor(id){ return mcLink(id); }
function viewFms(){
  applyBattleTheme(db.fms.color,db.fms.color2);
  const cur=db.fms.current;
  const showEdit=!!window.__editFms;
  const editBlock=`<div class="card">
    <button class="btn secondary small" onclick="toggleEditFms()">${showEdit?'Cancelar':'Editar FMS (cores)'}</button>
    ${showEdit?`<div style="margin-top:12px;">
      <div class="grid2">
        <div><label>Cor principal</label><input type="color" id="editFmsColor1" value="${db.fms.color}"></div>
        <div><label>Cor secundária</label><input type="color" id="editFmsColor2" value="${db.fms.color2}"></div>
      </div>
      <button class="btn" onclick="saveFmsColors()">Salvar cores</button>
    </div>`:''}
  </div>`;
  let body=editBlock;
  if(!cur){
    body+=`<div class="card"><p>Serão selecionados automaticamente os 45 MCs de maior nível (desempate: títulos, depois vitórias).</p>
    <button class="btn" onclick="iniciarFMS()">Iniciar FMS</button></div>`;
    if(db.fms.history.length){
      body+=`<div class="card"><h3>Edições anteriores</h3>${db.fms.history.slice().reverse().map(ed=>`<div class="champrow"><span class="badge">Edição ${ed.edicao}</span> ${ed.championMcId?fmsNameFor(ed.championMcId):'—'}</div>`).join('')}</div>`;
    }
    return `${topbar('FMS Brasil','Freestyle Master Series','home')}<div class="content">${body}</div>`;
  }
  body+=`<div class="card"><p>Edição <b>${cur.edicao}</b> · MCs elegíveis (top 45): <b>${cur.mcsElegiveis.length}</b> · Restantes: <b>${cur.remainingIds.length}</b></p></div>`;
  if(cur.phase==='seletivas'){
    body+=`<div class="list-grid">${cur.seletivas.map(s=>{
      const status=s.done?'Concluída · Campeão: '+esc(mcName(s.championMcId)):(s.bracket?'Em andamento':(cur.classificados.length===s.idx-1?'Pronta para sortear':'Aguardando'));
      return `<div class="navcard" onclick="nav('fms/seletiva/${s.idx}')"><div><h3>${s.idx}. ${esc(s.estado)}</h3><div class="muted">${status}</div></div><div class="chev">›</div></div>`;
    }).join('')}</div>`;
    if(cur.classificados.length===12){
      body+=`<div class="card"><h3>As 12 seletivas foram concluídas!</h3><button class="btn gold" onclick="iniciarFasePrincipal()">Iniciar Fase de Grupos</button></div>`;
    }
  } else {
    body+=`<div class="navcard" onclick="nav('fms/principal')"><div><h3>FMS Principal</h3><div class="muted">${cur.phase==='done'?'Concluída · Campeão: '+esc(mcName(cur.championMcId)):'Em andamento ('+cur.phase+')'}</div></div><div class="chev">›</div></div>`;
  }
  if(cur.phase==='done'){
    body+=`<div class="card" style="text-align:center;"><h2>🏆 Campeão da FMS</h2><h1>${mcLink(cur.championMcId)}</h1>
    <button class="btn" style="margin-top:14px;" onclick="novaFMS()">Iniciar Nova FMS</button></div>`;
  }
  if(db.fms.history.length){
    body+=`<div class="card"><h3>Edições anteriores</h3>${db.fms.history.slice().reverse().map(ed=>`<div class="champrow"><span class="badge">Edição ${ed.edicao}</span> ${ed.championMcId?fmsNameFor(ed.championMcId):'—'}</div>`).join('')}</div>`;
  }
  return `${topbar('FMS Brasil','Freestyle Master Series · Edição '+cur.edicao,'home')}<div class="content">${body}</div>`;
}
function viewFmsSeletiva(idx){
  applyBattleTheme(db.fms.color,db.fms.color2);
  const cur=db.fms.current;
  const sel=cur.seletivas.find(s=>s.idx===idx);
  let body='';
  if(!sel.bracket){
    const isNext=cur.classificados.length===idx-1;
    body=`<div class="card"><p>${isNext?'32 MCs serão sorteados entre os '+cur.remainingIds.length+' ainda elegíveis.':'Aguarde a conclusão da seletiva anterior.'}</p>
    <button class="btn" ${isNext?'':'disabled'} onclick="sortearSeletiva(${idx})">Sortear Seletiva</button></div>`;
  } else {
    body=`<div class="card">${renderBracketBlock(sel.bracket,2,'simSeletiva',[idx])}</div>`;
  }
  return `${topbar('Seletiva '+idx,sel.estado,'fms')}<div class="content">${body}</div>`;
}
function fmsMatchRow(m){
  const done=m.done;
  const side=(id,other,score,otherScore)=>`<div class="side ${done&&m.winner===id?'win':''}"><span class="nm">${mcLink(id)}</span><span>${done?score:''}</span></div>`;
  return `<div class="match ${done?'done':''}">${side(m.a,m.b,m.scoreA,m.scoreB)}${side(m.b,m.a,m.scoreB,m.scoreA)}</div>`;
}
function fmsGroupBlock(groupKey,group){
  const standings=fmsStandings(group);
  const standingsHtml=standings.map((s,i)=>`<div class="rankrow"><div><span class="pos">${i+1}º</span> ${mcLink(s.id)}</div><b>${s.pts} pts</b></div>`).join('');
  const ri=fmsGroupActiveRound(group);
  const roundsHtml=group.rounds.map((round,i)=>`<div class="round"><h4>RODADA ${i+1}</h4>${round.map(m=>fmsMatchRow(m)).join('')}</div>`).join('');
  const complete=ri===-1;
  return `<div class="card"><h3>Grupo ${groupKey}</h3>
    <div style="margin-bottom:10px;">${standingsHtml}</div>
    <div class="brackets-scroll">${roundsHtml}</div>
    ${complete?'<div class="badge">Grupo concluído</div>':`<div class="actionsrow">
      <button class="btn small" onclick="simFmsGroup('${groupKey}','one')">Simular Batalha</button>
      <button class="btn small secondary" onclick="simFmsGroup('${groupKey}','round')">Simular Rodada</button>
      <button class="btn small gold" onclick="simFmsGroup('${groupKey}','all')">Simular Tudo</button>
    </div>`}
  </div>`;
}
function viewFmsPrincipal(){
  applyBattleTheme(db.fms.color,db.fms.color2);
  const cur=db.fms.current;
  let body='';
  body+=fmsGroupBlock('A',cur.grupos.A);
  body+=fmsGroupBlock('B',cur.grupos.B);
  if(cur.semifinais){
    body+=`<div class="card"><h3>Semifinais</h3>
      <h4>Semifinal 1</h4>${fmsMatchRow(cur.semifinais.sf1)}
      ${!cur.semifinais.sf1.done?`<button class="btn small" onclick="simFmsSemi('sf1')">Simular</button>`:''}
      <h4>Semifinal 2</h4>${fmsMatchRow(cur.semifinais.sf2)}
      ${!cur.semifinais.sf2.done?`<button class="btn small" onclick="simFmsSemi('sf2')">Simular</button>`:''}
    </div>`;
  }
  if(cur.final){
    body+=`<div class="card"><h3>Final</h3>${fmsMatchRow(cur.final)}
      ${!cur.final.done?`<button class="btn small gold" onclick="simFmsFinal()">Simular Final</button>`:''}
    </div>`;
  }
  if(cur.phase==='done'){
    body+=`<div class="card" style="text-align:center;"><h2>🏆 Campeão da FMS</h2><h1>${mcLink(cur.championMcId)}</h1></div>`;
  }
  return `${topbar('FMS Principal','Fase de grupos, semis e final','fms')}<div class="content">${body}</div>`;
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
  if(c<15) return ['#7e22ce','#a855f7'];
  if(c<20) return ['#7f1d1d','#ef4444'];
  if(c<30) return ['#111111','#f5f5f5'];
  return null;
}
function titleTierIndex(c){ if(c<1)return 0; if(c<2)return 1; if(c<5)return 2; if(c<10)return 3; if(c<15)return 4; if(c<20)return 5; if(c<30)return 6; return 7; }
function svgDataUrl(inner){
  return `url('data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">${inner}</svg>`)}')`;
}
function tierIllustrationSvg(tierIdx){
  const OP='rgba(255,255,255,0.16)', OP2='rgba(255,255,255,0.1)';
  const star=(cx,cy,s,op)=>`<path d="M${cx} ${cy-s} L${cx+s*0.28} ${cy-s*0.28} L${cx+s} ${cy} L${cx+s*0.28} ${cy+s*0.28} L${cx} ${cy+s} L${cx-s*0.28} ${cy+s*0.28} L${cx-s} ${cy} L${cx-s*0.28} ${cy-s*0.28} Z" fill="${op}"/>`;
  if(tierIdx===0) return '';
  if(tierIdx===1){ // folhas
    return svgDataUrl(`
      <path d="M205 15 C175 35 160 70 185 100 C215 80 230 40 205 15 Z" fill="${OP}"/>
      <path d="M195 55 L188 95" stroke="${OP}" stroke-width="4" fill="none"/>
      <path d="M15 210 C0 190 8 155 35 140 C45 175 35 200 15 210 Z" fill="${OP2}"/>
      <path d="M25 175 L20 205" stroke="${OP2}" stroke-width="3" fill="none"/>
    `);
  }
  if(tierIdx===2){ // ondas
    return svgDataUrl(`
      <path d="M-10 190 Q20 165 50 190 T110 190 T170 190 T230 190" stroke="${OP}" stroke-width="6" fill="none"/>
      <path d="M-10 210 Q20 190 50 210 T110 210 T170 210 T230 210" stroke="${OP2}" stroke-width="5" fill="none"/>
      <circle cx="195" cy="35" r="14" fill="${OP}"/>
      <circle cx="170" cy="60" r="7" fill="${OP2}"/>
    `);
  }
  if(tierIdx===3){ // sol
    let rays='';
    for(let i=0;i<8;i++){ const a=(i*Math.PI)/4; const x1=200+Math.cos(a)*26, y1=35+Math.sin(a)*26, x2=200+Math.cos(a)*40, y2=35+Math.sin(a)*40; rays+=`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${OP}" stroke-width="4"/>`; }
    return svgDataUrl(`<circle cx="200" cy="35" r="20" fill="${OP}"/>${rays}`);
  }
  if(tierIdx===4){ // sparkles / roxo
    return svgDataUrl(`${star(200,40,22,OP)}${star(30,200,16,OP2)}${star(210,190,10,OP2)}`);
  }
  if(tierIdx===5){ // chamas / vermelho
    return svgDataUrl(`
      <path d="M200 20 C185 45 175 68 190 88 C200 74 210 60 205 40 C216 55 226 75 210 96 C232 84 236 52 200 20 Z" fill="${OP}"/>
      <path d="M35 145 C26 160 21 176 30 188 C36 179 42 170 39 158 C47 167 53 180 44 192 C58 185 60 162 35 145 Z" fill="${OP2}"/>
    `);
  }
  if(tierIdx===6){ // preto e branco - losangos geométricos
    const diamond=(cx,cy,s,op)=>`<rect x="${cx-s/2}" y="${cy-s/2}" width="${s}" height="${s}" transform="rotate(45 ${cx} ${cy})" fill="none" stroke="${op}" stroke-width="3"/>`;
    return svgDataUrl(`${diamond(195,40,34,OP)}${diamond(195,40,18,OP2)}${diamond(30,200,26,OP)}${diamond(30,200,12,OP2)}`);
  }
  // tier 7 - colorido 30+: coroa + brilhos
  return svgDataUrl(`
    <path d="M40 90 L58 40 L76 75 L95 30 L114 75 L132 40 L150 90 Z" fill="${OP}"/>
    <rect x="38" y="90" width="114" height="14" rx="4" fill="${OP}"/>
    ${star(195,180,14,OP2)}${star(25,190,10,OP2)}
  `);
}
function buildCardStyle(count){
  const idx=titleTierIndex(count);
  let grad;
  if(idx===7){ grad=`linear-gradient(120deg,#3b82f6 0%,#ef4444 20%,#eab308 40%,#22c55e 60%,#a855f7 80%,#3b82f6 100%)`; }
  else { const tc=titleTierColor(count); grad=`linear-gradient(135deg,${tc[0]},${tc[1]})`; }
  const illus=tierIllustrationSvg(idx);
  const bgImage=illus?`${illus}, ${grad}`:grad;
  const sizePos=illus?`background-size:cover, cover; background-position:center, center; background-repeat:no-repeat, no-repeat;`:'';
  const borderColor=idx===7?'#a855f7':titleTierColor(count)[0];
  return `background-image:${bgImage}; ${sizePos} border-top-color:${borderColor};`;
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
  (db.nationalTitles||[]).forEach(t=>{ if(t.mcId===mcId) titles.push({type:t.type,label:t.label}); });
  (db.fmsTitles||[]).forEach(t=>{ if(t.mcId===mcId) titles.push({type:'FMS',label:t.label}); });
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

/* ================= FMS ================= */
const FMS_ESTADOS=['São Paulo','Rio de Janeiro','Espírito Santo','Minas Gerais','Paraná','Rio Grande do Sul','Bahia','Ceará','Mato Grosso','Pernambuco','Amazonas','Pará'];
function allFmsEditions(){ return (db.fms.history||[]).concat(db.fms.current?[db.fms.current]:[]); }
function fmsSelectTop45(){
  const scored=db.mcs.map(m=>({id:m.id,nivel:m.nivel,titulos:collectTitles(m.id).length,vitorias:collectMatchesForMc(m.id).filter(x=>x.won).length}));
  scored.sort((a,b)=> b.nivel-a.nivel || b.titulos-a.titulos || b.vitorias-a.vitorias);
  return scored.slice(0,45).map(s=>s.id);
}
function iniciarFMS(){
  const elegiveis=fmsSelectTop45();
  if(elegiveis.length<32) return alert('São necessários pelo menos 32 MCs cadastrados para iniciar a FMS.');
  db.fms.current={
    edicao:(db.fms.history?db.fms.history.length:0)+1,
    mcsElegiveis:elegiveis,
    remainingIds:elegiveis.slice(),
    seletivas:FMS_ESTADOS.map((estado,i)=>({estado,idx:i+1,bracket:null,championMcId:null,done:false})),
    classificados:[],
    grupos:null,
    semifinais:null,
    final:null,
    championMcId:null,
    phase:'seletivas'
  };
  save(); nav('fms');
}
function sortearSeletiva(idx){
  const cur=db.fms.current;
  const sel=cur.seletivas.find(s=>s.idx===idx);
  if(!sel || sel.bracket) return;
  if(cur.classificados.length!==idx-1) return;
  const need=32;
  const pool=shuffle(cur.remainingIds).slice(0,need);
  sel.bracket=buildBracket(shuffle(pool).map(mcParticipant));
  save(); render();
}
function simSeletiva(idx,mode){
  const cur=db.fms.current;
  const sel=cur.seletivas.find(s=>s.idx===idx);
  if(!sel || !sel.bracket) return;
  if(mode==='one') simulateOne(sel.bracket,2);
  if(mode==='phase') simulatePhase(sel.bracket,2);
  if(mode==='all') simulateAll(sel.bracket,2);
  if(isBracketComplete(sel.bracket) && !sel.done){
    sel.done=true;
    sel.championMcId=bracketChampion(sel.bracket);
    cur.remainingIds=cur.remainingIds.filter(id=>id!==sel.championMcId);
    cur.classificados.push(sel.championMcId);
  }
  save(); render();
}
function roundRobinRounds(players){
  const n=players.length; const rounds=[];
  let arr=players.slice();
  const fixed=arr[0]; let rest=arr.slice(1);
  for(let r=0;r<n-1;r++){
    const full=[fixed,...rest]; const round=[];
    for(let i=0;i<n/2;i++){ round.push({a:full[i],b:full[n-1-i],scoreA:null,scoreB:null,winner:null,done:false}); }
    rounds.push(round);
    rest.unshift(rest.pop());
  }
  return rounds;
}
function iniciarFasePrincipal(){
  const cur=db.fms.current;
  if(cur.classificados.length!==12) return;
  const shuffled=shuffle(cur.classificados);
  const A=shuffled.slice(0,6), B=shuffled.slice(6,12);
  cur.grupos={
    A:{players:A,rounds:roundRobinRounds(A)},
    B:{players:B,rounds:roundRobinRounds(B)}
  };
  cur.phase='grupos';
  save(); nav('fms/principal');
}
function fmsMatchPoints(m){
  if(!m.done) return 0;
  const diff=Math.abs(m.scoreA-m.scoreB);
  return diff===2?3:2;
}
function fmsStandings(group){
  const pts={}; group.players.forEach(id=>pts[id]=0);
  group.rounds.forEach(round=>round.forEach(m=>{
    if(!m.done) return;
    const winner=m.winner, p=fmsMatchPoints(m);
    pts[winner]=(pts[winner]||0)+p;
  }));
  const order=db.fms.current.classificados;
  return group.players.slice().sort((x,y)=> (pts[y]-pts[x]) || (order.indexOf(x)-order.indexOf(y)) ).map(id=>({id,pts:pts[id]}));
}
function fmsGroupActiveRound(group){
  for(let i=0;i<group.rounds.length;i++){ if(group.rounds[i].some(m=>!m.done)) return i; }
  return -1;
}
function simFmsGroupMatch(m){
  const pa=mcById(m.a), pb=mcById(m.b);
  const p=calcProb(pa.nivel,pb.nivel);
  const [sa,sb]=simulateBestOf(2,p);
  m.scoreA=sa; m.scoreB=sb; m.winner=sa>sb?m.a:m.b; m.done=true;
}
function simFmsGroup(groupKey,mode){
  const cur=db.fms.current; const group=cur.grupos[groupKey];
  if(mode==='one'){ for(const round of group.rounds){ const m=round.find(x=>!x.done); if(m){ simFmsGroupMatch(m); break; } } }
  if(mode==='round'){ const ri=fmsGroupActiveRound(group); if(ri>=0) group.rounds[ri].forEach(m=>{ if(!m.done) simFmsGroupMatch(m); }); }
  if(mode==='all'){ group.rounds.forEach(round=>round.forEach(m=>{ if(!m.done) simFmsGroupMatch(m); })); }
  checkFmsGroupsComplete();
  save(); render();
}
function checkFmsGroupsComplete(){
  const cur=db.fms.current;
  if(!cur.grupos || cur.semifinais) return;
  const aDone=cur.grupos.A.rounds.every(r=>r.every(m=>m.done));
  const bDone=cur.grupos.B.rounds.every(r=>r.every(m=>m.done));
  if(aDone && bDone){
    const stA=fmsStandings(cur.grupos.A), stB=fmsStandings(cur.grupos.B);
    cur.semifinais={
      sf1:{a:stA[0].id,b:stB[1].id,scoreA:null,scoreB:null,winner:null,done:false},
      sf2:{a:stB[0].id,b:stA[1].id,scoreA:null,scoreB:null,winner:null,done:false}
    };
    cur.phase='semifinal';
  }
}
function simFmsSemi(key){
  const cur=db.fms.current; const m=cur.semifinais[key]; if(!m||m.done) return;
  simFmsGroupMatch(m);
  if(cur.semifinais.sf1.done && cur.semifinais.sf2.done && !cur.final){
    cur.final={a:cur.semifinais.sf1.winner,b:cur.semifinais.sf2.winner,scoreA:null,scoreB:null,winner:null,done:false};
    cur.phase='final';
  }
  save(); render();
}
function simFmsFinal(){
  const cur=db.fms.current; const m=cur.final; if(!m||m.done) return;
  simFmsGroupMatch(m);
  cur.championMcId=m.winner;
  cur.phase='done';
  db.fmsTitles.push({mcId:m.winner,edicao:cur.edicao,label:`Campeão FMS - Edição ${cur.edicao}`});
  save(); render();
}
function novaFMS(){
  if(!confirm('Iniciar uma nova FMS? Os resultados anteriores continuam no histórico dos MCs.')) return;
  db.fms.history.push(db.fms.current);
  db.fms.current=null;
  save(); iniciarFMS();
}
function bracketInvolvesFms(bracket,mcId){ return bracketInvolves(bracket,mcId); }
function fmsMcHasHistory(mcId){
  return allFmsEditions().some(ed=> ed.mcsElegiveis && ed.mcsElegiveis.includes(mcId));
}
function fmsStatsForMc(mcId){
  let selPart=0, selWin=0, selLoss=0, mainPart=0, mainWin=0, mainLoss=0;
  allFmsEditions().forEach(ed=>{
    ed.seletivas.forEach(sel=>{
      if(sel.bracket && bracketInvolvesFms(sel.bracket,mcId)){
        selPart++;
        sel.bracket.rounds.forEach(round=>round.forEach(m=>{
          if(!m.done) return;
          const ina=m.a===mcId, inb=m.b===mcId;
          if(ina||inb){ if((ina&&m.winner===m.a)||(inb&&m.winner===m.b)) selWin++; else selLoss++; }
        }));
      }
    });
    if(ed.grupos){
      ['A','B'].forEach(gk=>{
        const group=ed.grupos[gk]; if(!group||!group.players.includes(mcId)) return;
        let counted=false;
        group.rounds.forEach(round=>round.forEach(m=>{
          if(m.a===mcId||m.b===mcId){
            if(!counted){ mainPart++; counted=true; }
            if(m.done){ const won=(m.a===mcId&&m.winner===m.a)||(m.b===mcId&&m.winner===m.b); if(won) mainWin++; else mainLoss++; }
          }
        }));
      });
    }
    ['sf1','sf2'].forEach(k=>{ const m=ed.semifinais&&ed.semifinais[k]; if(m&&(m.a===mcId||m.b===mcId)&&m.done){ const won=(m.a===mcId&&m.winner===m.a)||(m.b===mcId&&m.winner===m.b); if(won) mainWin++; else mainLoss++; } });
    if(ed.final && (ed.final.a===mcId||ed.final.b===mcId) && ed.final.done){ const won=(ed.final.a===mcId&&ed.final.winner===ed.final.a)||(ed.final.b===mcId&&ed.final.winner===ed.final.b); if(won) mainWin++; else mainLoss++; }
  });
  const totalMatches=selWin+selLoss+mainWin+mainLoss;
  const totalWins=selWin+mainWin;
  const winrate=totalMatches?Math.round(totalWins/totalMatches*100):0;
  const titleCount=(db.fmsTitles||[]).filter(t=>t.mcId===mcId).length;
  return {selPart,selWin,selLoss,mainPart,mainWin,mainLoss,titleCount,winrate};
}

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
  else if(r[0]==='liga') html=viewLiga();
  else if(r[0]==='fms' && !r[1]) html=viewFms();
  else if(r[0]==='fms' && r[1]==='seletiva') html=viewFmsSeletiva(parseInt(r[2]));
  else if(r[0]==='fms' && r[1]==='principal') html=viewFmsPrincipal();
  else if(r[0]==='events') html=viewEvents();
  else if(r[0]==='event' && r[1]==='newedition') html=viewNewEventEdition(r[2]);
  else if(r[0]==='event' && r[1]) html=viewEventDetail(r[1]);
  else if(r[0]==='eventedition') html=viewEventEdition(r[1],r[2]);
  else if(r[0]==='battle' && r[1] && !r[2]) html=viewBattleDetail(r[1]);
  else if(r[0]==='battle' && r[1]==='newedition') html=viewNewEdition(r[2]);
  else if(r[0]==='edition') html=viewEdition(r[1],r[2]);
  else html=viewHome();
  root.innerHTML=html;
  if(r[0]==='battle' && r[1]==='newedition') updateTeamOptions(r[2]);
  if(r[0]==='event' && r[1]==='newedition') updateEventTeamOptions(r[2]);
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
    <div class="navcard" onclick="nav('fms')"><div><h3>🎙️ FMS Brasil</h3><div class="muted">${db.fms.current?'Edição '+db.fms.current.edicao+' em andamento':'Nenhuma edição em andamento'}</div></div><div class="chev">›</div></div>
    <div class="navcard" onclick="nav('events')"><div><h3>✨ Eventos Especiais</h3><div class="muted">${db.events.length} evento(s) criados</div></div><div class="chev">›</div></div>
  </div>
  <div class="card">
    <h3>Backup</h3>
    <p class="muted">Exporte os dados do simulador para um arquivo .json, ou importe um backup existente (substitui os dados atuais).</p>
    <div class="actionsrow">
      <button class="btn secondary small" onclick="exportJSON('full')">Exportação Completa</button>
      <button class="btn secondary small" onclick="toggleCustomExport()">${window.__showCustomExport?'Cancelar':'Exportação Personalizada'}</button>
      <button class="btn secondary small" onclick="document.getElementById('importFileInput').click()">Importar JSON</button>
    </div>
    ${window.__showCustomExport?`<div style="margin-top:12px;">
      <label class="checkline"><input type="checkbox" id="expMcs" checked><span>MCs (cadastro, níveis, estados)</span></label>
      <label class="checkline"><input type="checkbox" id="expBattles" checked><span>Batalhas Normais (edições, rankings, temporadas, títulos, cores)</span></label>
      <label class="checkline"><input type="checkbox" id="expNational" checked><span>Estrutura Nacional (Regionais, Estaduais, Nacional, cores, classificação)</span></label>
      <button class="btn small" style="margin-top:10px;" onclick="exportJSON('custom')">Exportar Selecionados</button>
    </div>`:''}
    <input type="file" id="importFileInput" accept=".json,application/json" style="display:none" onchange="importJSON(this)">
  </div>
  </div>`;
}
window.__showCustomExport=false;
function toggleCustomExport(){ window.__showCustomExport=!window.__showCustomExport; render(); }
function exportJSON(mode){
  let data;
  if(mode==='full'){ data=db; }
  else {
    data={};
    if(document.getElementById('expMcs').checked) data.mcs=db.mcs;
    if(document.getElementById('expBattles').checked) data.battles=db.battles;
    if(document.getElementById('expNational').checked){ data.national=db.national; data.nationalConfig=db.nationalConfig; }
  }
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
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
      if(!data||typeof data!=='object') throw new Error('formato inválido');
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
  const mcBattles=db.battles.filter(bt=>bt.mcIds.includes(id) || (titleCountsForBattle(bt)[id]||0)>0);
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
    cardStyle=buildCardStyle(titles.length);
  } else if(tab==='nacional'){
    const natMatches=collectNationalMatchesForMc(id);
    const natWins=natMatches.filter(x=>x.won).length;
    const natTitles=(db.nationalTitles||[]).filter(t=>t.mcId===id);
    const titRegional=natTitles.filter(t=>t.type==='Regional').length;
    const titEstadual=natTitles.filter(t=>t.type==='Estadual').length;
    const titNacional=natTitles.filter(t=>t.type==='Nacional').length;
    body=`<div class="statgrid">
      <div class="statbox"><b>${natWins}</b><span>Vitórias no Nacional</span></div>
      <div class="statbox"><b>${titRegional}</b><span>Títulos de Regional</span></div>
      <div class="statbox"><b>${titEstadual}</b><span>Títulos de Estadual</span></div>
      <div class="statbox"><b>${titNacional}</b><span>Títulos de Nacional</span></div>
    </div>
    <div class="titlelist">${natTitles.length?natTitles.map(t=>`<div class="titlerow"><span class="badge">${t.type}</span> ${esc(t.label)}</div>`).join(''):'<p class="muted">Nenhum título no Nacional ainda.</p>'}</div>`;
  } else if(tab==='fms'){
    const fs=fmsStatsForMc(id);
    body=`<div class="statgrid">
      <div class="statbox"><b>${fs.selPart}</b><span>Participações Seletivas</span></div>
      <div class="statbox"><b>${fs.selWin}</b><span>Vitórias Seletivas</span></div>
      <div class="statbox"><b>${fs.selLoss}</b><span>Derrotas Seletivas</span></div>
      <div class="statbox"><b>${fs.mainPart}</b><span>Participações FMS</span></div>
      <div class="statbox"><b>${fs.mainWin}</b><span>Vitórias FMS</span></div>
      <div class="statbox"><b>${fs.mainLoss}</b><span>Derrotas FMS</span></div>
      <div class="statbox"><b>${fs.titleCount}</b><span>Título FMS</span></div>
      <div class="statbox"><b>${fs.winrate}%</b><span>Aproveitamento</span></div>
    </div>`;
    cardStyle=buildCardStyle(fs.titleCount);
  } else {
    const battle=battleById(tab);
    if(!battle){ window.__modalTab='geral'; return renderMcModal(); }
    const matches=battleMatchesForMc(battle,id);
    const wins=matches.filter(x=>x.won).length, losses=matches.length-wins;
    const titleCount=titleCountsForBattle(battle)[id]||0;
    const participacoes=battleParticipations(battle,id);
    cardStyle=buildCardStyle(titleCount);
    body=`<div class="statgrid">
      <div class="statbox"><b>${matches.length}</b><span>Batalhas</span></div>
      <div class="statbox"><b>${wins}</b><span>Vitórias</span></div>
      <div class="statbox"><b>${losses}</b><span>Derrotas</span></div>
      <div class="statbox"><b>${participacoes}</b><span>Participações</span></div>
      <div class="statbox"><b>${titleCount}</b><span>Títulos</span></div>
    </div>`;
  }
  const tabsHtml=`<div class="mtab ${tab==='geral'?'active':''}" onclick="switchModalTab('geral')">Geral</div>`+
    `<div class="mtab ${tab==='nacional'?'active':''}" onclick="switchModalTab('nacional')">Nacional</div>`+
    (fmsMcHasHistory(id)?`<div class="mtab ${tab==='fms'?'active':''}" onclick="switchModalTab('fms')">FMS</div>`:'')+
    mcBattles.map(bt=>`<div class="mtab ${tab===bt.id?'active':''}" onclick="switchModalTab('${bt.id}')">${esc(bt.name)}</div>`).join('');
  root.innerHTML=`<div class="modalOverlay" onclick="if(event.target===this)closeMcModal()">
    <div class="modalCard" style="${cardStyle}">
      <div class="modalHead"><h2>${esc(m.name)}</h2><span class="modalClose" onclick="closeMcModal()">✕</span></div>
      <div class="muted" style="margin-bottom:12px;">${esc(m.estado)} · Nível ${m.nivel}</div>
      <div class="modalTabs">${tabsHtml}</div>
      ${body}
      <div class="editorBox">
        <h4>Editor do MC</h4>
        <label>Nome</label><input id="editMcName" value="${esc(m.name)}">
        <div class="grid2">
          <div><label>Estado</label><input id="editMcEstado" value="${esc(m.estado)}"></div>
          <div><label>Nível (0-100)</label><input id="editMcNivel" type="number" min="0" max="100" value="${m.nivel}"></div>
        </div>
        <button class="btn" onclick="saveMcEdit('${id}')">Salvar alterações</button>
      </div>
    </div>
  </div>`;
}
function saveMcEdit(id){
  const m=mcById(id); if(!m) return;
  const name=document.getElementById('editMcName').value.trim();
  const estado=document.getElementById('editMcEstado').value.trim();
  let nivel=parseInt(document.getElementById('editMcNivel').value);
  if(!name||!estado||isNaN(nivel)) return alert('Preencha nome, estado e nível.');
  m.name=name; m.estado=estado; m.nivel=Math.max(0,Math.min(100,nivel));
  save(); renderMcModal(); render();
}

/* ================= NACIONAL HOME ================= */
window.__editNacional=false;
function toggleEditNacional(){ window.__editNacional=!window.__editNacional; render(); }
function saveNacionalColors(){
  db.nationalConfig.color=document.getElementById('editNacColor1').value;
  db.nationalConfig.color2=document.getElementById('editNacColor2').value;
  save(); window.__editNacional=false; render();
}
function setClassificationMode(mode){
  if(db.national.classificationLocked) return;
  db.national.classificationMode=mode;
  save(); render();
}
function viewNacionalHome(){
  if(db.nationalConfig.color) applyBattleTheme(db.nationalConfig.color,db.nationalConfig.color2);
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
  const mode=db.national.classificationMode||'campeao';
  const locked=db.national.classificationLocked;
  const showEditNac=!!window.__editNacional;
  return `${topbar('Estrutura Nacional','Regional → Estadual → Nacional','home')}
  <div class="content">
    <div class="card">
      <button class="btn secondary small" onclick="toggleEditNacional()">${showEditNac?'Cancelar':'Editar Nacional (cores)'}</button>
      ${showEditNac?`<div style="margin-top:12px;">
        <div class="grid2">
          <div><label>Cor principal</label><input type="color" id="editNacColor1" value="${db.nationalConfig.color||'#2f6bff'}"></div>
          <div><label>Cor secundária</label><input type="color" id="editNacColor2" value="${db.nationalConfig.color2||'#ff2d4d'}"></div>
        </div>
        <button class="btn" onclick="saveNacionalColors()">Salvar cores</button>
      </div>`:''}
    </div>
    <div class="card">
      <h3>Classificação para o Nacional</h3>
      <p class="muted">${locked?'Configuração travada nesta temporada (já existe Estadual simulado).':'Escolha antes de simular o primeiro Estadual desta temporada.'}</p>
      <select id="classModeSelect" onchange="setClassificationMode(this.value)" ${locked?'disabled':''}>
        <option value="campeao" ${mode==='campeao'?'selected':''}>Somente Campeão</option>
        <option value="campeao_vice" ${mode==='campeao_vice'?'selected':''}>Campeão + Vice</option>
      </select>
    </div>
    <div class="list-grid">${estados.length? rows : '<p class="muted">Cadastre MCs com estado definido para começar.</p>'}</div>
    ${nacBtn}
    <div class="card"><h3>Reiniciar</h3><p class="muted">Apaga todo o progresso de Regionais, Estaduais e do Nacional (os MCs cadastrados não são afetados).</p><button class="btn danger" onclick="resetNacional()">Reiniciar Estrutura Nacional</button></div>
  </div>`;
}
function resetNacional(){
  if(!confirm('Isso vai apagar TODO o progresso da estrutura Nacional (Regionais, Estaduais e Nacional). Deseja continuar?')) return;
  const newStates={};
  Object.entries(db.national.states||{}).forEach(([estado,sd])=>{
    if(sd.color) newStates[estado]={built:false,color:sd.color,color2:sd.color2};
  });
  db.national={states:newStates,nacional:null,classificationMode:'campeao',classificationLocked:false};
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
  if(isBracketComplete(reg.bracket) && !reg.titleLogged){
    reg.titleLogged=true;
    const champ=bracketChampion(reg.bracket);
    db.nationalTitles.push({mcId:champ,type:'Regional',label:`Campeão Regional ${idx} - ${estado}`});
  }
  save(); render();
}
function viewEstadual(estado){
  const sd=getStateData(estado);
  if(sd.color) applyBattleTheme(sd.color,sd.color2);
  const html=renderBracketBlock(sd.estadualBracket,2,'simEstadual',[`'${estado.replace(/'/g,"\\'")}'`]);
  if(isBracketComplete(sd.estadualBracket) && !sd.estadualDone){
    sd.estadualChampionMcId=bracketChampion(sd.estadualBracket);
    sd.estadualDone=true;
    if(!sd.estadualTitleLogged){
      sd.estadualTitleLogged=true;
      db.nationalTitles.push({mcId:sd.estadualChampionMcId,type:'Estadual',label:`Campeão Estadual - ${estado}`});
    }
    save();
  }
  return `${topbar('Estadual',estado,'nacional/estado/'+encodeURIComponent(estado))}
  <div class="content"><div class="card">${html}</div></div>`;
}
function simEstadual(estado,mode){
  const sd=getStateData(estado);
  db.national.classificationLocked=true;
  if(mode==='one') simulateOne(sd.estadualBracket,2);
  if(mode==='phase') simulatePhase(sd.estadualBracket,2);
  if(mode==='all') simulateAll(sd.estadualBracket,2);
  save(); render();
}

/* ================= NACIONAL MAIN ================= */
function iniciarNacional(){
  const mode=db.national.classificationMode||'campeao';
  const estados=estadosDisponiveis().filter(e=>{ const sd=getStateData(e); return sd.estadualDone && mcExists(sd.estadualChampionMcId); });
  let participants=[];
  estados.forEach(e=>{
    const sd=getStateData(e); const champ=mcById(sd.estadualChampionMcId);
    participants.push({id:champ.id,kind:'mc',name:champ.name,level:champ.nivel,estado:e});
    if(mode==='campeao_vice' && sd.estadualBracket){
      const finalMatch=sd.estadualBracket.rounds[sd.estadualBracket.rounds.length-1][0];
      const viceId=finalMatch.loser;
      if(viceId && mcExists(viceId)){ const vice=mcById(viceId); participants.push({id:vice.id,kind:'mc',name:vice.name,level:vice.nivel,estado:e}); }
    }
  });
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
  if(db.nationalConfig.color) applyBattleTheme(db.nationalConfig.color,db.nationalConfig.color2);
  const nac=db.national.nacional;
  if(!nac) return `${topbar('Nacional','','nacional')}<div class="content"><p class="muted">Nacional ainda não iniciado.</p></div>`;
  let body='';
  body+=`<div class="card"><p>Estados participantes: <b>${nac.n}</b></p><p>Tamanho do bracket principal: <b>${nac.target}</b></p>${nac.excess>0?`<p>Vagas diretas: <b>${nac.directGroup.length}</b> · Pré-fase: <b>${nac.prefaseGroup.length}</b> MC(s)</p>`:''}</div>`;
  if(nac.prefaseBracket){
    body+=`<div class="card"><h3>Pré-fase</h3>${renderFlatBlock(nac.prefaseBracket,'simNacional')}</div>`;
  }
  if(nac.mainBracket){
    body+=`<div class="card"><h3>Bracket Nacional</h3>${renderBracketBlock(nac.mainBracket,2,'simNacionalMain',[])}</div>`;
    if(isBracketComplete(nac.mainBracket) && !nac.championMcId){
      nac.championMcId=bracketChampion(nac.mainBracket); nac.phase='done';
      if(!nac.titleLogged){ nac.titleLogged=true; db.nationalTitles.push({mcId:nac.championMcId,type:'Nacional',label:'Campeão Nacional'}); }
      save();
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
    </div>`;}).join('')}
    ${(()=>{ const txt=contrastText(db.liga.color); const muted=txt==='#ffffff'?'rgba(255,255,255,.85)':'rgba(18,20,28,.7)';
      return `<div class="navcard" onclick="nav('liga')" style="background:linear-gradient(120deg,${db.liga.color},${db.liga.color2});border:none;">
      <div><h3 style="color:${txt};">🏛️ Liga Central</h3><div class="muted" style="color:${muted};">Ranking geral de todas as batalhas</div></div><div class="chev" style="color:${txt};">›</div>
    </div>`; })()}
  </div>`;
  const showNew=!!window.__showNewBattleForm;
  return `${topbar('Batalhas','Batalhas criadas pelo usuário','home')}
  <div class="content">
    <div class="card">
      <button class="btn secondary small" onclick="toggleNewBattleForm()">${showNew?'Cancelar':'Criar Batalha'}</button>
      ${showNew?`<div style="margin-top:12px;">
      <label>Nome</label><input id="battlename" placeholder="Nome da batalha">
      <div class="grid2">
        <div><label>Cor principal</label><input type="color" id="battlecolor1" value="#144fe0"></div>
        <div><label>Cor secundária</label><input type="color" id="battlecolor2" value="#e11d33"></div>
      </div>
      <h4>Pontuação do ranking (opcional)</h4>
      <div class="grid2">
        <div><label>Campeão</label><input type="number" id="scCampeao" value="9"></div>
        <div><label>Vice</label><input type="number" id="scVice" value="6"></div>
        <div><label>Semifinal</label><input type="number" id="scSemi" value="4"></div>
        <div><label>Quartas</label><input type="number" id="scQuartas" value="3"></div>
        <div><label>Primeira fase</label><input type="number" id="scPrimeira" value="1"></div>
      </div>
      <button class="btn" onclick="createBattle()">Criar Batalha</button>
      </div>`:''}
    </div>
    ${db.battles.length?rows:'<p class="muted">Nenhuma batalha criada.</p>'}
  </div>`;
}
window.__showNewBattleForm=false;
function toggleNewBattleForm(){ window.__showNewBattleForm=!window.__showNewBattleForm; render(); }
function createBattle(){
  const name=document.getElementById('battlename').value.trim();
  const color=document.getElementById('battlecolor1').value;
  const color2=document.getElementById('battlecolor2').value;
  if(!name) return alert('Digite um nome.');
  const scoring={
    campeao:parseInt(document.getElementById('scCampeao').value)||9,
    vice:parseInt(document.getElementById('scVice').value)||6,
    semi:parseInt(document.getElementById('scSemi').value)||4,
    quartas:parseInt(document.getElementById('scQuartas').value)||3,
    primeira:parseInt(document.getElementById('scPrimeira').value)||1
  };
  db.battles.push({id:uid(),name,color,color2,mcIds:[],editions:[],ranking:{},currentSeason:1,seasonHistory:[],scoring});
  save(); nav('battles');
}

window.__editionsFilter={};
function setEditionsFilter(battleId,val){ window.__editionsFilter[battleId]=val; render(); }
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
  b.estado=document.getElementById('editBattleEstado').value.trim();
  b.tipo=document.getElementById('editBattleTipo').value;
  save(); window.__editBattle[id]=false; render();
}
function saveBattleScoring(id){
  const b=battleById(id);
  b.scoring={
    campeao:parseInt(document.getElementById('scCampeao_'+id).value)||0,
    vice:parseInt(document.getElementById('scVice_'+id).value)||0,
    semi:parseInt(document.getElementById('scSemi_'+id).value)||0,
    quartas:parseInt(document.getElementById('scQuartas_'+id).value)||0,
    primeira:parseInt(document.getElementById('scPrimeira_'+id).value)||0
  };
  save(); alert('Pontuação salva. Vale a partir das próximas edições/simulações.');
  window.__editBattle[id]=false; render();
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
  const edFilter=window.__editionsFilter[b.id]||'all';
  const edFiltered = edFilter==='all'?b.editions: b.editions.slice(-parseInt(edFilter));
  const editions=`<div class="list-grid">${edFiltered.map(ed=>`
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
        <div class="grid2">
          <div><label>Estado</label><input id="editBattleEstado" placeholder="Ex: SP" value="${esc(b.estado||'')}"></div>
          <div><label>Tipo</label><select id="editBattleTipo">
            <option value="mainstream" ${b.tipo==='mainstream'?'selected':''}>Mainstream</option>
            <option value="underground" ${b.tipo==='underground'?'selected':''}>Underground</option>
          </select></div>
        </div>
        <p class="note">Underground reduz em 50% a chance de sorteio de MCs de outro estado (usa o estado definido acima).</p>
        <button class="btn" onclick="saveBattleEdit('${b.id}')">Salvar Batalha</button>
        <h4>Pontuação do ranking</h4>
        <div class="grid2">
          <div><label>Campeão</label><input type="number" id="scCampeao_${b.id}" value="${b.scoring?b.scoring.campeao:9}"></div>
          <div><label>Vice</label><input type="number" id="scVice_${b.id}" value="${b.scoring?b.scoring.vice:6}"></div>
          <div><label>Semifinal</label><input type="number" id="scSemi_${b.id}" value="${b.scoring?b.scoring.semi:4}"></div>
          <div><label>Quartas</label><input type="number" id="scQuartas_${b.id}" value="${b.scoring?b.scoring.quartas:3}"></div>
          <div><label>Primeira fase</label><input type="number" id="scPrimeira_${b.id}" value="${b.scoring?b.scoring.primeira:1}"></div>
        </div>
        <button class="btn secondary" onclick="saveBattleScoring('${b.id}')">Salvar Pontuação</button>
      </div>`:''}
    </div>
    <div class="card">
      <h3>MCs participantes</h3>
      <button class="btn secondary small" onclick="toggleParticipants('${b.id}')">${showParts?'Ocultar lista':'Ver / selecionar MCs participantes'}</button>
      <p class="note">Mínimo de 8 MCs para criar edições (selecionados: <span id="mcSelCount">${b.mcIds.length}</span>).</p>
      ${showParts?`<div id="mcCheckList" style="margin-top:10px;">${mcCheck||'<p class="muted">Cadastre MCs primeiro.</p>'}</div>`:''}
    </div>
    <div class="card"><h3>🏆 Últimos Campeões</h3>${campHtml}</div>
    <div class="card"><h3>Edições</h3>
      <label>Mostrar</label>
      <select onchange="setEditionsFilter('${b.id}',this.value)" style="max-width:220px;">
        <option value="all" ${edFilter==='all'?'selected':''}>Todas</option>
        <option value="10" ${edFilter==='10'?'selected':''}>Últimas 10</option>
        <option value="5" ${edFilter==='5'?'selected':''}>Últimas 5</option>
      </select>
      <div style="margin-top:10px;">${b.editions.length?editions:'<p class="muted">Nenhuma edição criada.</p>'}</div>
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
  return `${topbar('Nova Edição',b.name,'battle/'+b.id)}
  <div class="content">
    <div class="card">
      <label>Nome da edição</label><input id="edname" placeholder="Ex: Edição 01" value="Edição ${b.editions.length+1}">
      <label>Modalidade</label>
      <select id="edformat" onchange="updateTeamOptions('${b.id}')">
        <option value="solo">Solo</option>
        <option value="dupla">Duplas</option>
        <option value="trio">Trios</option>
        <option value="quarteto">Quartetos</option>
      </select>
      <div id="teamcountwrap"></div>
      <label class="checkline" style="margin-top:12px;"><input type="checkbox" id="edNoRanking"><span>Não contar para o ranking desta batalha</span></label>
      <button class="btn" onclick="createEdition('${b.id}')">Criar e Sortear</button>
    </div>
  </div>`;
}
function updateTeamOptions(battleId){
  const b=battleById(battleId);
  const fmtEl=document.getElementById('edformat'); if(!fmtEl) return;
  const fmt=fmtEl.value;
  const wrap=document.getElementById('teamcountwrap');
  if(fmt==='solo'){
    const opts=[8,16,32].filter(s=>b.mcIds.length>=s);
    wrap.innerHTML=`<label>Quantidade de MCs</label><select id="teamcount">${opts.map(o=>`<option value="${o}">${o} MCs</option>`).join('')||'<option disabled>MCs insuficientes</option>'}</select>`;
    return;
  }
  const teamSizeMap={dupla:2,trio:3,quarteto:4};
  const ts=teamSizeMap[fmt];
  const maxTeams=Math.floor(b.mcIds.length/ts);
  const opts=[4,8,16].filter(v=>v<=maxTeams);
  wrap.innerHTML=`<label>Quantidade de equipes</label><select id="teamcount">${opts.map(o=>`<option value="${o}">${o} equipes (${o*ts} MCs)</option>`).join('')||'<option disabled>MCs insuficientes</option>'}</select>`;
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
  if(battle.tipo==='underground' && battle.estado){
    ids.forEach(id=>{ const m=mcById(id); if(m && m.estado!==battle.estado){ weight[id]=weight[id]*0.5; } });
  }
  const keyed=ids.map(id=>({id,key:Math.pow(Math.random(),1/Math.max(weight[id],1e-6))}));
  keyed.sort((a,b)=>b.key-a.key);
  return keyed.slice(0,needed).map(x=>x.id);
}
function createEdition(battleId){
  const b=battleById(battleId);
  const name=document.getElementById('edname').value.trim()||'Edição';
  const fmt=document.getElementById('edformat').value;
  const tc=document.getElementById('teamcount');
  if(!tc||!tc.value) return alert('MCs insuficientes para este formato.');
  let size,teamSize,targetWins,formatLabel;
  if(fmt==='solo'){ size=parseInt(tc.value); teamSize=1; targetWins=2; formatLabel='Solo - '+size+' MCs'; }
  else {
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
  const edition={id:uid(),name,format:fmt,formatLabel,size,teamSize,targetWins,bracket,status:'drawn',pointsApplied:false,excludeFromRanking:!!document.getElementById('edNoRanking').checked};
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

/* ================= EVENTOS ESPECIAIS ================= */
window.__showParticipantsEv={};
window.__editEvent={};
window.__showNewEventForm=false;
function toggleParticipantsEv(id){ window.__showParticipantsEv[id]=!window.__showParticipantsEv[id]; render(); }
function toggleEditEvent(id){ window.__editEvent[id]=!window.__editEvent[id]; render(); }
function toggleNewEventForm(){ window.__showNewEventForm=!window.__showNewEventForm; render(); }
function createSpecialEvent(){
  const name=document.getElementById('eventname').value.trim();
  if(!name) return alert('Digite um nome.');
  const color=document.getElementById('eventcolor1').value;
  const color2=document.getElementById('eventcolor2').value;
  db.events.push({id:uid(),name,color,color2,mcIds:[],editions:[]});
  save(); window.__showNewEventForm=false; nav('events');
}
function saveEventEdit(id){
  const ev=eventById(id);
  const name=document.getElementById('editEventName').value.trim();
  if(!name) return alert('Digite um nome.');
  ev.name=name;
  ev.color=document.getElementById('editEventColor1').value;
  ev.color2=document.getElementById('editEventColor2').value;
  save(); window.__editEvent[id]=false; render();
}
function deleteEvent(id){
  const ev=eventById(id); if(!ev) return;
  if(!confirm(`Excluir o evento "${ev.name}"? Isso apaga todas as edições dele. Os MCs cadastrados não são afetados.`)) return;
  db.events=db.events.filter(e=>e.id!==id);
  save(); nav('events');
}
function toggleMcEvent(eventId,mcId){
  const ev=eventById(eventId);
  if(ev.mcIds.includes(mcId)) ev.mcIds=ev.mcIds.filter(x=>x!==mcId); else ev.mcIds.push(mcId);
  save();
  const btn=document.getElementById('createEventEditionBtn'); if(btn) btn.disabled=ev.mcIds.length<8;
  const cnt=document.getElementById('evSelCount'); if(cnt) cnt.textContent=ev.mcIds.length;
}
function viewEvents(){
  const showNew=!!window.__showNewEventForm;
  const rows=`<div class="list-grid">${db.events.map(ev=>{
    const txt=contrastText(ev.color);
    const muted=txt==='#ffffff'?'rgba(255,255,255,.85)':'rgba(18,20,28,.7)';
    return `<div class="navcard" onclick="nav('event/${ev.id}')" style="background:linear-gradient(120deg,${ev.color},${ev.color2});border:none;">
      <div><h3 style="color:${txt};">${esc(ev.name)}</h3><div class="muted" style="color:${muted};">${ev.mcIds.length} MC(s) · ${ev.editions.length} edição(ões)</div></div><div class="chev" style="color:${txt};">›</div>
    </div>`;}).join('')}</div>`;
  return `${topbar('Eventos Especiais','Torneios especiais, sem ranking','home')}
  <div class="content">
    <div class="card">
      <button class="btn secondary small" onclick="toggleNewEventForm()">${showNew?'Cancelar':'Criar Evento'}</button>
      ${showNew?`<div style="margin-top:12px;">
        <label>Nome</label><input id="eventname" placeholder="Nome do evento">
        <div class="grid2">
          <div><label>Cor principal</label><input type="color" id="eventcolor1" value="#144fe0"></div>
          <div><label>Cor secundária</label><input type="color" id="eventcolor2" value="#e11d33"></div>
        </div>
        <button class="btn" onclick="createSpecialEvent()">Criar Evento</button>
      </div>`:''}
    </div>
    ${db.events.length?rows:'<p class="muted">Nenhum evento criado.</p>'}
  </div>`;
}
function viewEventDetail(id){
  const ev=eventById(id); if(!ev) return viewEvents();
  applyBattleTheme(ev.color,ev.color2);
  const showEdit=!!window.__editEvent[id];
  const showParts=!!window.__showParticipantsEv[id];
  const mcCheck=db.mcs.map(m=>`
    <label class="checkline"><input type="checkbox" id="chkEv_${m.id}" ${ev.mcIds.includes(m.id)?'checked':''} onchange="toggleMcEvent('${ev.id}','${m.id}')"><span>${esc(m.name)} <span class="muted">(${esc(m.estado)} · ${m.nivel})</span></span></label>`).join('');
  const editions=`<div class="list-grid">${ev.editions.map(ed=>`
    <div class="navcard" onclick="nav('eventedition/${ev.id}/${ed.id}')"><div><h3>${esc(ed.name)}</h3><div class="muted">${esc(ed.formatLabel)} · ${isBracketComplete(ed.bracket)?'Concluída':'Em andamento'}</div></div><div class="chev">›</div></div>`).join('')}</div>`;
  const canCreate=ev.mcIds.length>=8;
  return `${topbar(ev.name,ev.mcIds.length+' MC(s) participantes','events')}
  <div class="content">
    <div class="card">
      <div class="actionsrow" style="margin-top:0;">
        <button class="btn secondary small" onclick="toggleEditEvent('${ev.id}')">${showEdit?'Cancelar edição':'Editar Evento'}</button>
        <button class="btn danger small" onclick="deleteEvent('${ev.id}')">Excluir Evento</button>
      </div>
      ${showEdit?`<div style="margin-top:12px;">
        <label>Nome</label><input id="editEventName" value="${esc(ev.name)}">
        <div class="grid2">
          <div><label>Cor principal</label><input type="color" id="editEventColor1" value="${ev.color}"></div>
          <div><label>Cor secundária</label><input type="color" id="editEventColor2" value="${ev.color2}"></div>
        </div>
        <button class="btn" onclick="saveEventEdit('${ev.id}')">Salvar Evento</button>
      </div>`:''}
    </div>
    <div class="card">
      <h3>MCs participantes</h3>
      <button class="btn secondary small" onclick="toggleParticipantsEv('${ev.id}')">${showParts?'Ocultar lista':'Ver / selecionar MCs participantes'}</button>
      <p class="note">Mínimo de 8 MCs para criar edições (selecionados: <span id="evSelCount">${ev.mcIds.length}</span>).</p>
      ${showParts?`<div style="margin-top:10px;">${mcCheck||'<p class="muted">Cadastre MCs primeiro.</p>'}</div>`:''}
    </div>
    <div class="card"><h3>Edições</h3>${ev.editions.length?editions:'<p class="muted">Nenhuma edição criada.</p>'}
      <button class="btn" id="createEventEditionBtn" ${canCreate?'':'disabled'} onclick="nav('event/newedition/${ev.id}')">Criar Edição</button>
    </div>
    <p class="note">Eventos Especiais não possuem ranking, temporada nem participam da Liga Central.</p>
  </div>`;
}
function viewNewEventEdition(eventId){
  const ev=eventById(eventId); if(!ev) return viewEvents();
  applyBattleTheme(ev.color,ev.color2);
  return `${topbar('Nova Edição',ev.name,'event/'+ev.id)}
  <div class="content">
    <div class="card">
      <label>Nome da edição</label><input id="evEdname" placeholder="Ex: Edição 01" value="Edição ${ev.editions.length+1}">
      <label>Modalidade</label>
      <select id="evEdformat" onchange="updateEventTeamOptions('${ev.id}')">
        <option value="solo">Solo</option>
        <option value="dupla">Duplas</option>
        <option value="trio">Trios</option>
        <option value="quarteto">Quartetos</option>
      </select>
      <div id="evTeamcountwrap"></div>
      <button class="btn" onclick="createEventEdition('${ev.id}')">Criar e Sortear</button>
    </div>
  </div>`;
}
function updateEventTeamOptions(eventId){
  const ev=eventById(eventId);
  const fmtEl=document.getElementById('evEdformat'); if(!fmtEl) return;
  const fmt=fmtEl.value;
  const wrap=document.getElementById('evTeamcountwrap');
  if(fmt==='solo'){
    const opts=[8,16,32].filter(s=>ev.mcIds.length>=s);
    wrap.innerHTML=`<label>Quantidade de MCs</label><select id="evTeamcount">${opts.map(o=>`<option value="${o}">${o} MCs</option>`).join('')||'<option disabled>MCs insuficientes</option>'}</select>`;
    return;
  }
  const teamSizeMap={dupla:2,trio:3,quarteto:4};
  const ts=teamSizeMap[fmt];
  const maxTeams=Math.floor(ev.mcIds.length/ts);
  const capOptions=fmt==='dupla'?[4,8,16,32]:[4,8,16];
  const opts=capOptions.filter(v=>v<=maxTeams);
  wrap.innerHTML=`<label>Quantidade de equipes</label><select id="evTeamcount">${opts.map(o=>`<option value="${o}">${o} equipes (${o*ts} MCs)</option>`).join('')||'<option disabled>MCs insuficientes</option>'}</select>`;
}
function createEventEdition(eventId){
  const ev=eventById(eventId);
  const name=document.getElementById('evEdname').value.trim()||'Edição';
  const fmt=document.getElementById('evEdformat').value;
  const tc=document.getElementById('evTeamcount');
  if(!tc||!tc.value) return alert('MCs insuficientes para este formato.');
  let size,teamSize,targetWins,formatLabel;
  size=parseInt(tc.value);
  if(fmt==='solo'){ teamSize=1; targetWins=2; formatLabel='Solo - '+size+' MCs'; }
  else {
    teamSize=fmt==='dupla'?2:fmt==='trio'?3:4;
    targetWins=fmt==='dupla'?2:3;
    formatLabel=(fmt==='dupla'?'Duplas':fmt==='trio'?'Trios':'Quartetos')+' - '+size+' equipes';
  }
  const needed=size*teamSize;
  if(ev.mcIds.length<needed) return alert('MCs insuficientes.');
  const pool=shuffle(ev.mcIds).slice(0,needed);
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
  ev.editions.push({id:uid(),name,format:fmt,formatLabel,size,teamSize,targetWins,bracket,status:'drawn'});
  save(); nav('eventedition/'+ev.id+'/'+ev.editions[ev.editions.length-1].id);
}
function viewEventEdition(eventId,edId){
  const ev=eventById(eventId); if(!ev) return viewEvents();
  const ed=ev.editions.find(e=>e.id===edId); if(!ed) return viewEventDetail(eventId);
  applyBattleTheme(ev.color,ev.color2);
  const html=renderBracketBlock(ed.bracket,ed.targetWins,'simEventEdition',[`'${eventId}'`,`'${edId}'`]);
  return `${topbar(ed.name,ed.formatLabel,'event/'+eventId)}
  <div class="content"><div class="card">${html}</div></div>`;
}
function simEventEdition(eventId,edId,mode){
  const ev=eventById(eventId); const ed=ev.editions.find(e=>e.id===edId);
  if(mode==='one') simulateOne(ed.bracket,ed.targetWins);
  if(mode==='phase') simulatePhase(ed.bracket,ed.targetWins);
  if(mode==='all') simulateAll(ed.bracket,ed.targetWins);
  save(); render();
}

/* ================= INIT ================= */
render();
