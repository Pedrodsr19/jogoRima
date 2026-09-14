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
  d.nationalStats=d.nationalStats||{};
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
  let p=0.5+0.5*Math.tanh(diff/38);
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
      <button class="btn small gold" onclick="simFmsG
