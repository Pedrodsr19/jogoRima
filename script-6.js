/* ================= DB ================= */
const DB_KEY='rimabattle_v2';
function normalizeDB(d){
  if(!d) d={mcs:[],battles:[],national:{states:{},nacional:null}};
  d.mcs=(d.mcs||[]).map(m=>({...m,amigos:m.amigos||[],rivais:m.rivais||[]}));
  d.battles=(d.battles||[]).map(b=>({
    id:b.id,name:b.name,color:b.color||'#144fe0',color2:b.color2||'#e11d33',color3:b.color3||'#22c55e',
    mcIds:b.mcIds||[],editions:b.editions||[],ranking:b.ranking||{},
    currentSeason:b.currentSeason||1, seasonHistory:b.seasonHistory||[],
    scoring:b.scoring||undefined,
    estado:b.estado||'', tipo:b.tipo||'mainstream'
  }));
  d.events=(d.events||[]).map(ev=>({
    id:ev.id,name:ev.name,color:ev.color||'#144fe0',color2:ev.color2||'#e11d33',color3:ev.color3||'#22c55e',
    mcIds:ev.mcIds||[],editions:ev.editions||[]
  }));
  d.national=d.national||{states:{},nacional:null};
  d.national.states=d.national.states||{};
  if(d.national.classificationMode===undefined) d.national.classificationMode='campeao';
  if(d.national.classificationLocked===undefined) d.national.classificationLocked=false;
  d.nationalConfig=d.nationalConfig||{};
  if(!d.nationalConfig.color3) d.nationalConfig.color3='#22c55e';
  d.liga=d.liga||{};
  d.liga.color=d.liga.color||'#2f6bff';
  d.liga.color2=d.liga.color2||'#ff2d4d';
  d.liga.color3=d.liga.color3||'#22c55e';
  d.liga.seasonNumber=d.liga.seasonNumber||1;
  d.liga.seasonOffsets=d.liga.seasonOffsets||{};
  d.liga.seasonHistory=d.liga.seasonHistory||[];
  d.nationalTitles=d.nationalTitles||[];
  d.nationalStats=d.nationalStats||{};
  d.fms=d.fms||{history:[],current:null};
  d.fms.color=d.fms.color||'#2f6bff';
  d.fms.color2=d.fms.color2||'#ff2d4d';
  d.fms.color3=d.fms.color3||'#22c55e';
  d.fmsTitles=d.fmsTitles||[];
  Object.values(d.national.states).forEach(sd=>{ if(sd.color && !sd.color3) sd.color3='#22c55e'; });
  d.careers=(d.careers||[]).map(c=>({
    id:c.id,mcId:c.mcId,temporada:c.temporada||1,semana:c.semana||1,
    energyUsed:c.energyUsed||0,ligaBoost:c.ligaBoost||{value:0,weeksLeft:0},
    weekBattleStatus:c.weekBattleStatus||{},pendingInvites:c.pendingInvites||[],
    nationalSeason:c.nationalSeason||{regionalTries:0,wentRegional:false,wentEstadual:false,lockedOut:false,invitedTop80:false,responded80:false}
  }));
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
function teamHasRivalConflict(team,candidateId){
  const cand=mcById(candidateId); if(!cand) return false;
  return team.some(memberId=>{ const mem=mcById(memberId); return mem && (cand.rivais.includes(memberId)||mem.rivais.includes(candidateId)); });
}
function formTeams(pool,teamSize){
  const remaining=shuffle(pool.slice());
  const teams=[];
  while(remaining.length>=teamSize){
    const seed=remaining.shift();
    const team=[seed];
    while(team.length<teamSize && remaining.length){
      let candidate=null;
      if(Math.random()<0.7){
        for(const memberId of team){
          const mem=mcById(memberId); if(!mem) continue;
          const friends=mem.amigos.filter(fid=>remaining.includes(fid)&&!teamHasRivalConflict(team,fid));
          if(friends.length){ candidate=friends[Math.floor(Math.random()*friends.length)]; break; }
        }
      }
      if(!candidate){
        const validPool=remaining.filter(id=>!teamHasRivalConflict(team,id));
        candidate=validPool.length?validPool[Math.floor(Math.random()*validPool.length)]:remaining[0];
      }
      team.push(candidate);
      remaining.splice(remaining.indexOf(candidate),1);
    }
    teams.push(team);
  }
  return repairRivalConflicts(teams);
}
function repairRivalConflicts(teams){
  for(let i=0;i<teams.length;i++){
    for(let j=0;j<teams[i].length;j++){
      const person=teams[i][j];
      const others=teams[i].filter((_,idx)=>idx!==j);
      if(!teamHasRivalConflict(others,person)) continue;
      outer: for(let k=0;k<teams.length;k++){
        if(k===i) continue;
        for(let l=0;l<teams[k].length;l++){
          const candidate=teams[k][l];
          const teamKOthers=teams[k].filter((_,idx)=>idx!==l);
          if(!teamHasRivalConflict(others,candidate) && !teamHasRivalConflict(teamKOthers,person)){
            teams[i][j]=candidate; teams[k][l]=person;
            break outer;
          }
        }
      }
    }
  }
  return teams;
}
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
function mcAvatarSmall(id){
  const m=mcById(id);
  if(m&&m.foto) return `<img src="${esc(m.foto)}" class="mcAvatarSm" onerror="this.style.display='none'">`;
  return '';
}
function mcLinkAv(id,nameFallback){ return mcAvatarSmall(id)+mcLink(id,nameFallback); }
function battleById(id){return db.battles.find(b=>b.id===id);}
function eventById(id){return db.events.find(e=>e.id===id);}

function calcProb(la,lb){
  const diff=la-lb;
  let p=0.5+0.5*Math.tanh(diff/20);
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
function decideRoundMode(teamSize,roundIdx,duplaTipo){
  if(teamSize<=1) return 'team';
  if(teamSize===2) return (duplaTipo==='tipo2') ? 'team' : (roundIdx<2?'team':'solo');
  if(teamSize===3) return roundIdx<2?'team':'solo';
  return 'team';
}
function propagateWinner(bracket,match){
  if(bracket.flat) return;
  const ri=findRoundIndex(bracket,match);
  if(ri>=0 && ri+1<bracket.rounds.length){
    const midx=bracket.rounds[ri].indexOf(match);
    const nextMatch=bracket.rounds[ri+1][Math.floor(midx/2)];
    if(midx%2===0) nextMatch.a=match.winner; else nextMatch.b=match.winner;
  }
}
function simulateOneRoundOfMatch(bracket,match,targetWins,duplaTipo){
  if(!match.a||!match.b||match.done) return false;
  const pa=bracket.participants[match.a], pb=bracket.participants[match.b];
  if(!match.rounds) match.rounds=[];
  const idx=match.rounds.length;
  const teamSize=pa.kind==='team'?pa.mcIds.length:1;
  const mode=decideRoundMode(teamSize,idx,duplaTipo);
  let levelA,levelB,repA=null,repB=null;
  if(mode==='team'){ levelA=pa.level; levelB=pb.level; }
  else {
    repA=pa.kind==='team'?pa.mcIds[Math.floor(Math.random()*pa.mcIds.length)]:pa.id;
    repB=pb.kind==='team'?pb.mcIds[Math.floor(Math.random()*pb.mcIds.length)]:pb.id;
    levelA=mcById(repA).nivel; levelB=mcById(repB).nivel;
  }
  const p=calcProb(levelA,levelB);
  const winSide=Math.random()<p?'a':'b';
  match.scoreA=match.scoreA||0; match.scoreB=match.scoreB||0;
  if(winSide==='a') match.scoreA++; else match.scoreB++;
  match.rounds.push({mode,repA,repB,winSide});
  if(match.scoreA>=targetWins||match.scoreB>=targetWins){
    match.done=true;
    match.winner=match.scoreA>match.scoreB?match.a:match.b;
    match.loser=match.scoreA>match.scoreB?match.b:match.a;
    propagateWinner(bracket,match);
  }
  return true;
}
function simulateMatch(bracket,match,targetWins,duplaTipo){
  if(!match.a||!match.b||match.done) return false;
  let guard=0;
  while(!match.done && guard<20){ simulateOneRoundOfMatch(bracket,match,targetWins,duplaTipo); guard++; }
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
function simulateOne(bracket,targetWins,duplaTipo){
  const p=pendingMatches(bracket); if(p.length===0) return false;
  simulateMatch(bracket,p[0],targetWins,duplaTipo); return true;
}
function simulateSingleRound(bracket,targetWins,duplaTipo){
  const p=pendingMatches(bracket); if(p.length===0) return false;
  simulateOneRoundOfMatch(bracket,p[0],targetWins,duplaTipo); return true;
}
function simulatePhase(bracket,targetWins,duplaTipo){
  const ri=activeRoundIndex(bracket); if(ri===-1) return false;
  bracket.rounds[ri].forEach(m=>{ if(m.a&&m.b&&!m.done) simulateMatch(bracket,m,targetWins,duplaTipo); });
  return true;
}
function simulateAll(bracket,targetWins,duplaTipo){
  let guard=0;
  while(guard<200){
    const p=pendingMatches(bracket);
    if(p.length===0) break;
    p.forEach(m=>simulateMatch(bracket,m,targetWins,duplaTipo));
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
  db.liga.color3=document.getElementById('editLigaColor3').value;
  save(); window.__editLiga=false; render();
}
function finalizarTemporadaLiga(){
  const ranking=Object.entries(ligaSeasonRanking()).sort((a,b)=>b[1]-a[1]);
  if(ranking.length===0) return;
  if(!confirm(`Finalizar a Temporada ${db.liga.seasonNumber} da Liga Central? O ranking de temporada será zerado (as batalhas individuais não são afetadas).`)) return;
  const championMcId=ranking[0][0];
  db.liga.seasonHistory.push({season:db.liga.seasonNumber,championMcId});
  const car=db.careers.find(c=>c.mcId===championMcId);
  if(car) car.ligaBoost={value:5,weeksLeft:5};
  const offsets={}; db.battles.forEach(b=>{ offsets[b.id]=b.editions.length; });
  db.liga.seasonOffsets=offsets;
  db.liga.seasonNumber+=1;
  save(); render();
}
window.__ligaTab='semanal';
function switchLigaTab(tab){ window.__ligaTab=tab; render(); }
function viewLiga(){
  applyBattleTheme(db.liga.color,db.liga.color2,db.liga.color3);
  const showEdit=!!window.__editLiga;
  const weekly=Object.entries(ligaWeeklyRanking()).sort((a,b)=>b[1]-a[1]);
  const season=Object.entries(ligaSeasonRanking()).sort((a,b)=>b[1]-a[1]);
  const weeklyRows=weekly.map((r,i)=>`<div class="rankrow"><div><span class="pos">${i+1}º</span> ${mcLinkAv(r[0])}</div><b>${r[1]} pts</b></div>`).join('');
  const seasonRows=season.map((r,i)=>`<div class="rankrow"><div><span class="pos">${i+1}º</span> ${mcLinkAv(r[0])}</div><b>${r[1]} pts</b></div>`).join('');
  const history=db.liga.seasonHistory.slice().reverse().map(s=>`<div class="champrow"><span class="badge">Temporada ${s.season}</span> ${mcLink(s.championMcId)}</div>`).join('');
  const tab=window.__ligaTab;
  return `${topbar('Liga Central','Ranking geral de todas as batalhas','battles')}
  <div class="content">
    <div class="card">
      <button class="btn secondary small" onclick="toggleEditLiga()">${showEdit?'Cancelar':'Editar Liga Central (cores)'}</button>
      ${showEdit?`<div style="margin-top:12px;">
        <div class="grid3">
          <div><label>Cor principal</label><input type="color" id="editLigaColor1" value="${db.liga.color}"></div>
          <div><label>Cor secundária</label><input type="color" id="editLigaColor2" value="${db.liga.color2}"></div>
          <div><label>Cor complementar</label><input type="color" id="editLigaColor3" value="${db.liga.color3||'#22c55e'}"></div>
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
  db.fms.color3=document.getElementById('editFmsColor3').value;
  save(); window.__editFms=false; render();
}
function fmsNameFor(id){ return mcLink(id); }
function viewFms(){
  applyBattleTheme(db.fms.color,db.fms.color2,db.fms.color3);
  const cur=db.fms.current;
  const showEdit=!!window.__editFms;
  const editBlock=`<div class="card">
    <button class="btn secondary small" onclick="toggleEditFms()">${showEdit?'Cancelar':'Editar FMS (cores)'}</button>
    ${showEdit?`<div style="margin-top:12px;">
      <div class="grid3">
        <div><label>Cor principal</label><input type="color" id="editFmsColor1" value="${db.fms.color}"></div>
        <div><label>Cor secundária</label><input type="color" id="editFmsColor2" value="${db.fms.color2}"></div>
        <div><label>Cor complementar</label><input type="color" id="editFmsColor3" value="${db.fms.color3||'#22c55e'}"></div>
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
  applyBattleTheme(db.fms.color,db.fms.color2,db.fms.color3);
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
  const side=(id,score)=>`<div class="side ${done&&m.winner===id?'win':''}"><div class="side-names"><span class="nm">${mcLink(id)}</span></div>${done?`<span class="side-level">${score}</span>`:''}</div>`;
  const mid=done?`<div class="vs-score">${m.scoreA} × ${m.scoreB}</div>`:`<div class="vs-score vs-pending">VS</div>`;
  return `<div class="match ${done?'done':''}">${side(m.a,m.scoreA)}${mid}${side(m.b,m.scoreB)}</div>`;
}
function fmsGroupBlock(groupKey,group){
  const standings=fmsStandings(group);
  const standingsHtml=standings.map((s,i)=>`<div class="rankrow"><div><span class="pos">${i+1}º</span> ${mcLinkAv(s.id)}</div><b>${s.pts} pts</b></div>`).join('');
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
  applyBattleTheme(db.fms.color,db.fms.color2,db.fms.color3);
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
function hashStr(s){ let h=0; for(let i=0;i<(s||'').length;i++){ h=(h*31+s.charCodeAt(i))>>>0; } return h; }
function pickVariant(mcId){ return hashStr(mcId)%3; }
/* ---- helpers geométricos das ilustrações ---- */
const _star=(cx,cy,s,op)=>`<path d="M${cx} ${cy-s} L${cx+s*0.28} ${cy-s*0.28} L${cx+s} ${cy} L${cx+s*0.28} ${cy+s*0.28} L${cx} ${cy+s} L${cx-s*0.28} ${cy+s*0.28} L${cx-s} ${cy} L${cx-s*0.28} ${cy-s*0.28} Z" fill="${op}"/>`;
const _leaf=(cx,cy,size,rot,op)=>`<g transform="translate(${cx},${cy}) rotate(${rot})"><path d="M0 ${-size} C${size*0.55} ${-size*0.75} ${size*0.75} ${-size*0.12} ${size*0.5} ${size*0.5} C${size*0.2} ${size*0.25} ${-size*0.12} ${-size*0.5} 0 ${-size} Z" fill="${op}"/><path d="M0 ${-size*0.9} L${size*0.42} ${size*0.35}" stroke="${op}" stroke-width="2" fill="none"/></g>`;
const _drop=(cx,cy,s,op)=>`<path d="M${cx} ${cy-s} C${cx+s*0.6} ${cy-s*0.2} ${cx+s*0.5} ${cy+s*0.6} ${cx} ${cy+s} C${cx-s*0.5} ${cy+s*0.6} ${cx-s*0.6} ${cy-s*0.2} ${cx} ${cy-s} Z" fill="${op}"/>`;
const _wave=(x,y,w,amp,op,sw)=>`<path d="M${x} ${y} Q${x+w*0.25} ${y-amp} ${x+w*0.5} ${y} T${x+w} ${y}" stroke="${op}" stroke-width="${sw}" fill="none"/>`;
const _sunburst=(cx,cy,r,rays,op,sw,len)=>{ let o=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${op}"/>`; for(let i=0;i<rays;i++){ const a=(i*2*Math.PI)/rays; const x1=cx+Math.cos(a)*(r+6), y1=cy+Math.sin(a)*(r+6), x2=cx+Math.cos(a)*(r+6+len), y2=cy+Math.sin(a)*(r+6+len); o+=`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${op}" stroke-width="${sw}"/>`; } return o; };
const _bolt=(cx,cy,s,op)=>`<path d="M${cx} ${cy-s} L${cx-s*0.4} ${cy+s*0.1} L${cx} ${cy+s*0.1} L${cx-s*0.3} ${cy+s} L${cx+s*0.5} ${cy-s*0.1} L${cx} ${cy-s*0.1} Z" fill="${op}"/>`;
const _moon=(cx,cy,r,op)=>`<path d="M${cx} ${cy-r} A${r} ${r} 0 1 0 ${cx} ${cy+r} A${r*0.6} ${r*0.6} 0 1 1 ${cx} ${cy-r} Z" fill="${op}"/>`;
const _gem=(cx,cy,s,op)=>`<path d="M${cx-s} ${cy-s*0.3} L${cx-s*0.4} ${cy-s} L${cx+s*0.4} ${cy-s} L${cx+s} ${cy-s*0.3} L${cx} ${cy+s} Z" fill="${op}"/>`;
const _flame=(cx,cy,s,op)=>`<path d="M${cx} ${cy-s} C${cx-s*0.5} ${cy-s*0.3} ${cx-s*0.35} ${cy+s*0.25} ${cx} ${cy+s*0.35} C${cx+s*0.15} ${cy+s*0.1} ${cx+s*0.3} ${cy-s*0.2} ${cx+s*0.15} ${cy-s*0.5} C${cx+s*0.35} ${cy-s*0.35} ${cx+s*0.45} ${cy-s*0.05} ${cx+s*0.3} ${cy+s*0.3} C${cx+s*0.6} ${cy+s*0.1} ${cx+s*0.55} ${cy-s*0.5} ${cx} ${cy-s} Z" fill="${op}"/>`;
const _diamond=(cx,cy,s,op,sw)=>`<rect x="${cx-s/2}" y="${cy-s/2}" width="${s}" height="${s}" transform="rotate(45 ${cx} ${cy})" fill="none" stroke="${op}" stroke-width="${sw}"/>`;
const _chevron=(x,y,w,h,op,sw)=>`<path d="M${x} ${y+h} L${x+w/2} ${y} L${x+w} ${y+h}" stroke="${op}" stroke-width="${sw}" fill="none"/>`;
const _hex=(cx,cy,r,op,sw)=>{ const pts=[]; for(let i=0;i<6;i++){ const a=Math.PI/6+i*Math.PI/3; pts.push(`${(cx+r*Math.cos(a)).toFixed(1)},${(cy+r*Math.sin(a)).toFixed(1)}`); } return `<polygon points="${pts.join(' ')}" fill="none" stroke="${op}" stroke-width="${sw}"/>`; };
const _crown=(cx,cy,w,h,op)=>{ const half=w/2; return `<path d="M${cx-half} ${cy+h*0.3} L${cx-half*0.6} ${cy-h*0.6} L${cx-half*0.2} ${cy+h*0.05} L${cx} ${cy-h} L${cx+half*0.2} ${cy+h*0.05} L${cx+half*0.6} ${cy-h*0.6} L${cx+half} ${cy+h*0.3} Z" fill="${op}"/><rect x="${cx-half}" y="${cy+h*0.3}" width="${w}" height="${h*0.15}" rx="3" fill="${op}"/>`; };
const _medal=(cx,cy,s,op)=>`<circle cx="${cx}" cy="${cy}" r="${s*0.5}" fill="${op}"/><path d="M${cx-s*0.3} ${cy+s*0.4} L${cx-s*0.5} ${cy+s*1.1} L${cx-s*0.1} ${cy+s*0.8} L${cx+s*0.1} ${cy+s*0.8} L${cx+s*0.5} ${cy+s*1.1} L${cx+s*0.3} ${cy+s*0.4} Z" fill="${op}"/>`;
const _firework=(cx,cy,r,op,sw)=>{ let o=''; for(let i=0;i<10;i++){ const a=(i*2*Math.PI)/10; const x1=cx+Math.cos(a)*r*0.3, y1=cy+Math.sin(a)*r*0.3, x2=cx+Math.cos(a)*r, y2=cy+Math.sin(a)*r; o+=`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${op}" stroke-width="${sw}"/>`; } return o+`<circle cx="${cx}" cy="${cy}" r="4" fill="${op}"/>`; };

function tierIllustrationSvg(tierIdx,variant){
  const OP='rgba(255,255,255,0.22)', OP2='rgba(255,255,255,0.14)', OP3='rgba(255,255,255,0.09)';
  if(tierIdx===0) return '';
  const variants=[[],[],[],[],[],[],[],[]];
  // tier 1 - verde / folhas
  variants[1]=[
    `${_leaf(190,45,55,18,OP)}${_leaf(38,205,36,-20,OP2)}`,
    `${_leaf(200,35,30,10,OP)}${_leaf(35,55,22,60,OP2)}${_leaf(210,195,24,-40,OP2)}`,
    `<path d="M20 220 C60 180 90 140 120 90 C150 60 180 40 220 20" stroke="${OP2}" stroke-width="3" fill="none"/>${_leaf(90,140,26,-30,OP)}${_leaf(150,70,22,20,OP)}${_leaf(200,30,18,-10,OP2)}`
  ];
  // tier 2 - azul / ondas
  variants[2]=[
    `${_wave(-10,190,240,25,OP,6)}${_wave(-10,212,240,20,OP2,5)}<circle cx="195" cy="35" r="16" fill="${OP}"/><circle cx="168" cy="60" r="8" fill="${OP2}"/>`,
    `${_drop(200,30,16,OP)}${_drop(175,60,11,OP2)}${_drop(215,75,8,OP3)}${_drop(30,190,14,OP2)}`,
    `${_wave(-10,40,240,22,OP,6)}<circle cx="35" cy="200" r="18" fill="${OP2}"/><circle cx="65" cy="215" r="9" fill="${OP3}"/>`
  ];
  // tier 3 - amarelo / sol
  variants[3]=[
    _sunburst(200,35,20,8,OP,4,16),
    `<circle cx="195" cy="40" r="24" fill="${OP2}"/><circle cx="195" cy="40" r="15" fill="${OP}"/>${_sunburst(35,205,10,6,OP2,3,10)}`,
    `${_bolt(200,40,34,OP)}${_bolt(35,195,24,OP2)}`
  ];
  // tier 4 - roxo / brilhos
  variants[4]=[
    `${_star(200,40,22,OP)}${_star(30,200,16,OP2)}${_star(210,190,10,OP2)}`,
    `${_moon(200,45,26,OP)}${_star(150,25,10,OP2)}${_star(35,200,14,OP2)}`,
    `${_gem(195,40,22,OP)}${_gem(35,195,16,OP2)}${_gem(60,210,10,OP3)}`
  ];
  // tier 5 - vermelho / chamas
  variants[5]=[
    `${_flame(200,30,42,OP)}${_flame(35,195,30,OP2)}`,
    `${_flame(195,35,50,OP)}<circle cx="150" cy="80" r="5" fill="${OP2}"/><circle cx="170" cy="110" r="3" fill="${OP3}"/><circle cx="130" cy="60" r="4" fill="${OP2}"/>`,
    `${_flame(180,30,30,OP)}${_flame(210,45,24,OP2)}${_flame(195,65,20,OP3)}`
  ];
  // tier 6 - preto e branco / geométrico
  variants[6]=[
    `${_diamond(195,40,34,OP,3)}${_diamond(195,40,18,OP2,2)}${_diamond(30,200,26,OP,3)}${_diamond(30,200,12,OP2,2)}`,
    `${_chevron(150,10,80,26,OP,4)}${_chevron(150,36,80,26,OP2,3)}${_chevron(10,180,80,26,OP2,3)}`,
    `${_hex(200,40,26,OP,3)}${_hex(200,40,14,OP2,2)}${_hex(30,200,18,OP2,2)}`
  ];
  // tier 7 - colorido 30+
  variants[7]=[
    `${_crown(95,60,110,50,OP)}${_star(195,180,14,OP2)}${_star(25,190,10,OP2)}`,
    `${_firework(195,45,34,OP,3)}${_firework(35,195,26,OP2,2)}`,
    `${_medal(195,150,26,OP)}${_star(45,45,14,OP2)}${_star(200,40,10,OP3)}`
  ];
  const list=variants[tierIdx];
  const v=list[variant%list.length];
  return svgDataUrl(v);
}
function buildCardStyle(count,mcId){
  const idx=titleTierIndex(count);
  let grad;
  if(idx===7){ grad=`linear-gradient(120deg,#3b82f6 0%,#ef4444 20%,#eab308 40%,#22c55e 60%,#a855f7 80%,#3b82f6 100%)`; }
  else { const tc=titleTierColor(count); grad=`linear-gradient(135deg,${tc[0]},${tc[1]})`; }
  const illus=tierIllustrationSvg(idx,pickVariant(mcId));
  const bgImage=illus?`${illus}, ${grad}`:grad;
  const sizePos=illus?`background-size:cover, cover; background-position:center, center; background-repeat:no-repeat, no-repeat;`:'';
  const borderColor=idx===7?'#a855f7':titleTierColor(count)[0];
  return `background-image:${bgImage}; ${sizePos} border-top-color:${borderColor};`;
}
function titleRowHtml(t){
  const special=['Regional','Estadual','Nacional','FMS','Evento'].includes(t.type);
  return `<div class="titlerow ${special?'titlerow-special':''}">${special?'⭐ ':''}<span class="badge ${special?'badge-special':''}">${t.type}</span> ${esc(t.label)}</div>`;
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
  (db.events||[]).forEach(ev=>{
    ev.editions.forEach(ed=>{ if(editionChampionIds(ed).includes(mcId)) titles.push({type:'Evento',label:`Campeão - ${ed.name} (${ev.name})`}); });
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
  if(mode==='oneround') simulateSingleRound(sel.bracket,2);
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
  celebrateChampion(mcName(m.winner),'Campeão FMS - Edição '+cur.edicao, db.fms.color, db.fms.color2, m.winner);
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
  root.setProperty('--accent3','#22c55e');
  root.setProperty('--bg','linear-gradient(160deg,#0a0d16,#10152a)');
  root.setProperty('--card','#151b2e');
  root.setProperty('--line','#262e47');
  root.setProperty('--text','#eef2fb');
  root.setProperty('--topbar-bg','linear-gradient(120deg,#0b1330,#1450ff)');
  root.setProperty('--on-accent',contrastText('#2f6bff'));
  root.setProperty('--on-accent2',contrastText('#ff2d4d'));
  root.setProperty('--on-accent3',contrastText('#22c55e'));
  root.setProperty('--accent-fg',boostForDark('#2f6bff'));
  root.setProperty('--accent2-fg',boostForDark('#ff2d4d'));
  root.setProperty('--accent3-fg',boostForDark('#22c55e'));
}
function applyBattleTheme(c1,c2,c3){
  c3=c3||'#22c55e';
  const root=document.documentElement.style;
  root.setProperty('--accent',c1);
  root.setProperty('--accent2',c2);
  root.setProperty('--accent3',c3);
  root.setProperty('--bg',`linear-gradient(150deg,${c1},${lightenColor(c2,0.1)})`);
  root.setProperty('--card',`linear-gradient(135deg,${tintDark(c1,0.4)},${tintDark(c2,0.32)})`);
  root.setProperty('--line',lightenColor(c1,0.2));
  root.setProperty('--text','#ffffff');
  root.setProperty('--topbar-bg',`linear-gradient(120deg,${c1},${c2})`);
  root.setProperty('--on-accent',contrastText(c1));
  root.setProperty('--on-accent2',contrastText(c2));
  root.setProperty('--on-accent3',contrastText(c3));
  root.setProperty('--accent-fg',boostForDark(c1));
  root.setProperty('--accent2-fg',boostForDark(c2));
  root.setProperty('--accent3-fg',boostForDark(c3));
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
  else if(r[0]==='career' && !r[1]) html=viewCareerHome();
  else if(r[0]==='career' && r[1]==='create') html=viewCareerCreate();
  else if(r[0]==='career' && r[1]==='dash') html=viewCareerDashboard(r[2]);
  else if(r[0]==='career' && r[1]==='battle') html=viewCareerBattle(r[2],r[3]);
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
    <div class="navcard" onclick="nav('career')"><div><h3>🧑‍🎤 Modo Carreira</h3><div class="muted">${db.careers.length}/3 carreira(s)</div></div><div class="chev">›</div></div>
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
      <label>Foto (URL, opcional)</label><input id="mcfoto" placeholder="https://...">
      <label>ou enviar arquivo</label><input id="mcfotofile" type="file" accept="image/*" onchange="handleMcPhotoFile(this,'mcfoto')">
      <button class="btn" onclick="addMc()">Cadastrar MC</button>
    </div>
    <div class="card mclist"><h3>MCs cadastrados</h3>${rows||'<p class="muted">Nenhum MC cadastrado.</p>'}</div>
  </div>`;
}
function handleMcPhotoFile(input,targetId){
  const file=input.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{ document.getElementById(targetId).value=e.target.result; };
  reader.readAsDataURL(file);
}
function addMc(){
  const name=document.getElementById('mcname').value.trim();
  const estado=document.getElementById('mcestado').value.trim();
  let nivel=parseInt(document.getElementById('mcnivel').value);
  const foto=document.getElementById('mcfoto').value.trim();
  if(!name||!estado||isNaN(nivel)) return alert('Preencha nome, estado e nível.');
  nivel=Math.max(0,Math.min(100,nivel));
  db.mcs.push({id:uid(),name,estado,nivel,foto,amigos:[],rivais:[]});
  save(); render();
}
function delMc(id){
  if(!confirm('Excluir este MC definitivamente? Ele será removido de todas as batalhas, seleções e rankings.')) return;
  db.mcs=db.mcs.filter(m=>m.id!==id);
  db.mcs.forEach(m=>{ m.amigos=m.amigos.filter(x=>x!==id); m.rivais=m.rivais.filter(x=>x!==id); });
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
function closeCelebration(){ const r=document.getElementById('celebrationRoot'); if(r) r.innerHTML=''; }
function celebrateChampion(name,label,c1,c2,mcId,special){
  special = special!==false;
  const root=document.getElementById('celebrationRoot'); if(!root) return;
  c1=c1||'#2f6bff'; c2=c2||'#ff2d4d';
  const m=mcId?mcById(mcId):null;
  const colors=[c1,c2,'#ffffff',lightenColor(c1,0.4),lightenColor(c2,0.4)];
  let confetti='';
  const confettiCount=special?36:16;
  for(let i=0;i<confettiCount;i++){
    const left=Math.random()*100;
    const delay=(Math.random()*0.5).toFixed(2);
    const dur=(1.4+Math.random()*1.1).toFixed(2);
    const size=4+Math.random()*6;
    const color=colors[i%colors.length];
    confetti+=`<span class="celebConfettiPiece" style="left:${left}%;width:${size}px;height:${size*1.6}px;background:${color};animation-delay:${delay}s;animation-duration:${dur}s;"></span>`;
  }
  const photoHtml=(m&&m.foto)?`<img src="${esc(m.foto)}" class="celebPhoto ${special?'celebPhotoSpecial':''}" onerror="this.style.display='none';document.getElementById('celebTrophyFallback').style.display='block';">`:'';
  const ribbon=special?`<div class="celebRibbon">★ TÍTULO ESPECIAL ★</div>`:'';
  root.innerHTML=`<div class="celebOverlay" onclick="if(event.target===this)closeCelebration()">
    <div class="celebCard ${special?'celebSpecial':''}" style="background:linear-gradient(150deg,${c1},${c2});">
      ${confetti}
      ${ribbon}
      ${photoHtml}
      <div class="celebTrophy ${special?'':'celebTrophySmall'}" id="celebTrophyFallback" style="${photoHtml?'display:none;':''}">🏆</div>
      <div class="celebLabel">${esc(label)}</div>
      <h1 class="celebName">${esc(name)}</h1>
      <button class="btn secondary" style="background:rgba(255,255,255,.15);color:#fff;border-color:rgba(255,255,255,.6);" onclick="closeCelebration()">Fechar</button>
    </div>
  </div>`;
}
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
    <div class="titlelist">${titles.length?titles.map(t=>titleRowHtml(t)).join(''):'<p class="muted">Nenhum título ainda.</p>'}</div>`;
    cardStyle=buildCardStyle(titles.length,id);
  } else if(tab==='nacional'){
    const natMatches=collectNationalMatchesForMc(id);
    const persisted=db.nationalStats[id]||{wins:0,losses:0};
    const natWins=persisted.wins+natMatches.filter(x=>x.won).length;
    const natLosses=persisted.losses+natMatches.filter(x=>!x.won).length;
    const natTitles=(db.nationalTitles||[]).filter(t=>t.mcId===id);
    const titRegional=natTitles.filter(t=>t.type==='Regional').length;
    const titEstadual=natTitles.filter(t=>t.type==='Estadual').length;
    const titNacional=natTitles.filter(t=>t.type==='Nacional').length;
    body=`<div class="statgrid">
      <div class="statbox"><b>${natWins}</b><span>Vitórias no Nacional</span></div>
      <div class="statbox"><b>${natLosses}</b><span>Derrotas no Nacional</span></div>
      <div class="statbox"><b>${titRegional}</b><span>Títulos de Regional</span></div>
      <div class="statbox"><b>${titEstadual}</b><span>Títulos de Estadual</span></div>
      <div class="statbox"><b>${titNacional}</b><span>Títulos de Nacional</span></div>
    </div>
    <div class="titlelist">${natTitles.length?natTitles.map(t=>titleRowHtml(t)).join(''):'<p class="muted">Nenhum título no Nacional ainda.</p>'}</div>`;
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
    cardStyle=buildCardStyle(fs.titleCount,id);
  } else {
    const battle=battleById(tab);
    if(!battle){ window.__modalTab='geral'; return renderMcModal(); }
    const matches=battleMatchesForMc(battle,id);
    const wins=matches.filter(x=>x.won).length, losses=matches.length-wins;
    const titleCount=titleCountsForBattle(battle)[id]||0;
    const participacoes=battleParticipations(battle,id);
    cardStyle=buildCardStyle(titleCount,i                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                