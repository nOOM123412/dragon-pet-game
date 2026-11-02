/* ================== Магический Дракончик — клиент ================== */
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
const state = { data:null, user:{ name:'гость', id:null } };

function el(id){ return document.getElementById(id); }
function api(path,opts){
  return fetch(path,opts).then(async r=>{
    const j = await r.json().catch(()=>({}));
    if(!r.ok) throw Object.assign({ status:r.status }, j);
    return j;
  });
}
let toastTimer=null;
function toast(msg){
  const t=el('toast'); if(!t) return; t.textContent=msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),2400);
}

/* ---------- пользователь ---------- */
(function initUser(){
  if(tg && tg.initDataUnsafe && tg.initDataUnsafe.user){
    const u=tg.initDataUnsafe.user;
    state.user.name = ((u.first_name||'') + (u.last_name?(' '+u.last_name):'')).trim() || u.username || 'друг';
    state.user.id = String(u.id);
    el('playerChip').textContent = '👤 ' + state.user.name;
    tg.ready(); tg.expand();
    try{ tg.setHeaderColor('#0b0a1f'); tg.setBackgroundColor('#0b0a1f'); }catch(e){}
  } else {
    el('playerChip').textContent = '👤 гость';
  }
})();

/* ---------- табы ---------- */
document.querySelectorAll('.tab').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b===btn));
    const t=btn.dataset.tab;
    document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.dataset.panel===t));
  });
});

/* ---------- настроение/реакции ---------- */
function moodText(p){
  if(p.hunger<20) return 'Я голоден… покорми меня 🍖';
  if(p.energy<15) return 'Я так устал… давай поспим 🌙';
  if(p.fun<20) return 'Мне скучно… поиграем? 🎈';
  if(p.hunger>75 && p.fun>75 && p.energy>50) return 'Мне так хорошо с тобой! 💛🐉';
  return 'Я рад тебя видеть 🐉';
}
function dragonReaction(cls, ms){
  const d=el('dragon'); if(!d) return; d.classList.add(cls);
  setTimeout(()=>d.classList.remove(cls),ms||700);
}

/* ---------- рендер ---------- */
function render(data){
  state.data=data;
  const p=data.pet;
  el('coins').textContent=p.coins;
  el('gems').textContent=p.gems;
  el('dayCount').textContent=p.dayCount;
  el('streak').textContent=p.streak;

  el('stageName').textContent=p.stageName;
  el('stageBadge').textContent='ур. '+(p.stage+1);
  el('valHunger').textContent=p.hunger;
  el('valFun').textContent=p.fun;
  el('valEnergy').textContent=p.energy;
  el('barHunger').style.width=p.hunger+'%';
  el('barFun').style.width=p.fun+'%';
  el('barEnergy').style.width=p.energy+'%';
  setWarn('hunger',p.hunger); setWarn('fun',p.fun); setWarn('energy',p.energy);

  const from = stageFloor(p.stage);
  const denom = (p.nextStageXp!=null) ? (p.nextStageXp-from) : 1;
  const pct = p.nextStageXp!=null ? Math.min(100,Math.round((p.xp-from)/denom*100)) : 100;
  el('xpFill').style.width=pct+'%';
  el('xpText').textContent = p.nextStageXp!=null
     ? `${p.xp} / ${p.nextStageXp} XP → ${p.nextStageName}`
     : `${p.xp} XP · максимум 👑`;

  el('moodBubble').textContent = moodText(p);
  el('flame').classList.toggle('on', p.stage>=2);

  const skin = (data.catalog.skins[p.skin]) || data.catalog.skins.fire;
  const stage=el('stage');
  stage.style.setProperty('--d-c1',skin.c1);
  stage.style.setProperty('--d-c2',skin.c2);
  el('glowRing').style.background='radial-gradient(circle,'+skin.aura+' 0%,transparent 70%)';

  const log=el('log');
  if(!data.recent || data.recent.length===0){
    log.innerHTML='<li class="empty">Пока пусто — начни заботиться о драконе 💫</li>';
  } else {
    log.innerHTML=data.recent.map(r=>{
      const time=new Date(r.ts).toLocaleString('ru-RU',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'});
      const label=r.detail || actionLabel(r.action);
      return `<li><span><b>${esc(r.by_name||'Кто-то')}</b> ${label}</span><span>${time}</span></li>`;
    }).join('');
  }

  renderShop(data);
  renderInventory(data);
  renderQuests(data);
  renderAchievements(data);
  renderSkins(data);

  if(data.loginMsgs && data.loginMsgs.length){
    data.loginMsgs.forEach((m,i)=>setTimeout(()=>toast(m),600+i*900));
  }
  if(data.newAchievements && data.newAchievements.length){
    data.newAchievements.forEach((a,i)=>setTimeout(()=>toast('🏆 '+a.name+'! +'+a.gem+'💎'),1500+i*900));
  }
}
function stageFloor(stage){ const T=[0,60,180,400,750,1300,2100,3200,5000]; return T[stage]||0; }
function setWarn(k,v){ const s=document.querySelector('.stat[data-stat="'+k+'"]'); if(s) s.classList.toggle('warn', v<20); }
function actionLabel(a){
  return ({feed:'покормил(а)',play:'поиграл(а)',rest:'уложил(а) спать',pet:'погладил(а)',magic:'сотворил(а) магию',use:'использовал(а) предмет',minigame:'сыграл(а) в игру'})[a]||a;
}
function esc(s){ return String(s).replace(/[&<>"]/g,c=>({'&':'&','<':'<','>':'>','"':'"'}[c])); }

/* ---------- действия ---------- */
document.querySelectorAll('.action-btn').forEach(btn=>{
  btn.addEventListener('click',()=>doCare(btn.dataset.action));
});
async function doCare(action){
  try{
    const r=await api('/api/care',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action,by_name:state.user.name,by_id:state.user.id})});
    const d=state.data; if(!d) return;
    d.pet=r.pet; d.recent=r.recent; if(r.daily) d.daily=r.daily;
    if(r.newAchievements) d.newAchievements=r.newAchievements;
    render(d); d.newAchievements=null;
    if(action==='feed'){ dragonReaction('playing',500); toast('Накормлен 🍖'); }
    else if(action==='play'){ dragonReaction('playing',700); toast('Как весело! 🎈'); }
    else if(action==='rest'){ dragonReaction('sleeping',900); toast('Сладких снов 🌙'); }
    else if(action==='pet'){ dragonReaction('playing',500); toast('Мур-р 🐉💜'); }
    else if(action==='magic'){ toast('Магия свершилась 🔮✨'); }
  }catch(e){
    if(e.status===429) toast('Магия восстанавливается… 🔮');
    else toast('Не удалось выполнить действие');
  }
}

/* ---------- магазин ---------- */
function renderShop(data){
  const items=data.catalog.items; const food=el('shopFood'); if(!food) return;
  const cats=[['food','🍖 Еда'],['toy','🎈 Игрушки'],['boost','✨ Усилители']];
  let html='';
  for(const [ck,title] of cats){
    const list=Object.entries(items).filter(([,it])=>it.cat===ck);
    if(!list.length) continue;
    html+=`<div class="card" style="grid-column:1/-1;font-weight:700;font-size:12px;color:var(--muted)">${title}</div>`;
    html+=list.map(([id,it])=>`
      <div class="card item-card">
        <div class="item-top"><span class="item-emoji">${it.emoji}</span><span class="item-name">${esc(it.name)}</span></div>
        <div class="item-desc">${effectText(it)}</div>
        <div class="price-row"><span class="price">${it.price} 🪙</span>
          <button class="btn-buy" data-buy="${id}" ${data.pet.coins<it.price?'disabled':''}>Купить</button>
        </div>
      </div>`).join('');
  }
  food.innerHTML=html;
  food.querySelectorAll('[data-buy]').forEach(b=>b.addEventListener('click',()=>doBuy('item',b.dataset.buy)));
}
function effectText(it){
  const e=it.effect||{}; const p=[];
  if(e.hunger) p.push('🍖+'+e.hunger);
  if(e.fun) p.push('🎈+'+e.fun);
  if(e.energy) p.push('⚡+'+e.energy);
  if(e.xp) p.push('✨+'+e.xp+'XP');
  if(it.xp) p.push('+'+it.xp+'XP');
  return p.join(' ');
}
async function doBuy(kind,id){
  try{
    const r=await api('/api/buy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,id})});
    const d=state.data;
    d.pet=r.pet; d.inventory=r.inventory; d.ownedSkins=r.ownedSkins; d.newAchievements=r.newAchievements;
    render(d); d.newAchievements=null;
    toast(kind==='skin'?'Скин приобретён! 🎨':'Куплено! 🛍️');
  }catch(e){
    if(e.error==='no_coins') toast('Недостаточно золота 🪙');
    else if(e.error==='already_owned') toast('Уже есть 👍');
    else toast('Не удалось купить');
  }
}

/* ---------- рюкзак ---------- */
function renderInventory(data){
  const inv=data.inventory||[]; const box=el('inventory'); if(!box) return;
  if(!inv.length){ box.innerHTML='<div class="empty-note" style="grid-column:1/-1">Рюкзак пуст — загляни в магазин 🛒</div>'; return; }
  box.innerHTML=inv.map(row=>{
    const it=data.catalog.items[row.item_id]; if(!it) return '';
    return `<div class="inv-card">
      <span class="item-emoji">${it.emoji}</span>
      <div style="flex:1">
        <div class="item-name">${esc(it.name)}</div>
        <div class="inv-qty">×${row.qty}</div>
      </div>
      <button class="btn-use" data-use="${row.item_id}">Исп.</button>
    </div>`;
  }).join('');
  box.querySelectorAll('[data-use]').forEach(b=>b.addEventListener('click',()=>doUse(b.dataset.use)));
}
async function doUse(item_id){
  try{
    const r=await api('/api/use',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({item_id,by_name:state.user.name})});
    const d=state.data; d.pet=r.pet; d.recent=r.recent; d.newAchievements=r.newAchievements;
    const row=d.inventory.find(x=>x.item_id===item_id);
    if(row){ row.qty-=1; if(row.qty<=0) d.inventory=d.inventory.filter(x=>x!==row); }
    render(d); d.newAchievements=null;
    toast('Использовано! ✨');
  }catch(e){ toast(e.error==='no_item'?'Предмета нет':'Не удалось использовать'); }
}

/* ---------- квесты ---------- */
function renderQuests(data){
  const daily=data.daily; if(!daily) return;
  el('questDay').textContent=daily.day+1;
  const box=el('quests'); if(!box) return;
  box.innerHTML=daily.quests.map(q=>{
    const pct=Math.min(100,Math.round(q.progress/q.goal*100));
    const rw=[]; if(q.reward.coins) rw.push(q.reward.coins+'🪙'); if(q.reward.gems) rw.push(q.reward.gems+'💎'); if(q.reward.xp) rw.push(q.reward.xp+'XP');
    let btn;
    if(q.claimed) btn='<button class="claim-btn" disabled>Получено ✓</button>';
    else if(q.done) btn=`<button class="claim-btn" data-claim="${q.id}">Забрать</button>`;
    else btn='<button class="claim-btn" disabled>В процессе</button>';
    return `<div class="quest ${q.done?'done':''}">
      <div class="quest-top"><span class="quest-text">${esc(q.text)}</span><span class="quest-reward">${rw.join(' + ')}</span></div>
      <div class="quest-bar"><div class="quest-fill" style="width:${pct}%"></div></div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span class="inv-qty">${Math.min(q.progress,q.goal)} / ${q.goal}</span>${btn}
      </div>
    </div>`;
  }).join('');
  box.querySelectorAll('[data-claim]').forEach(b=>b.addEventListener('click',()=>doClaim(b.dataset.claim)));
}
async function doClaim(id){
  try{
    const r=await api('/api/quest/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({quest_id:id})});
    const d=state.data; d.pet=r.pet; d.daily=r.daily; d.newAchievements=r.newAchievements;
    render(d); d.newAchievements=null; toast('Награда получена! 🎁');
  }catch(e){ toast(e.error==='already_claimed'?'Уже получено':'Квест не выполнен'); }
}

/* ---------- достижения ---------- */
const ACH_META=[
  {id:'first_care',emoji:'🌱',name:'Первый шаг',desc:'Позаботиться о драконе'},
  {id:'day3',emoji:'📅',name:'Три дня вместе',desc:'Играть 3 дня подряд'},
  {id:'day7',emoji:'🗓️',name:'Неделя заботы',desc:'Играть 7 дней подряд'},
  {id:'stage2',emoji:'🔥',name:'Пламя растёт',desc:'Достичь дракона-огня'},
  {id:'stage4',emoji:'🌟',name:'Древний друг',desc:'Достичь древнего дракона'},
  {id:'collector',emoji:'🎨',name:'Коллекционер',desc:'Собрать 3 скина'},
  {id:'rich',emoji:'💰',name:'Богач',desc:'Накопить 500 золота'},
  {id:'player',emoji:'🎮',name:'Геймер',desc:'Сыграть 10 партий'}
];
function renderAchievements(data){
  const box=el('achievements'); if(!box) return;
  const got=new Set(data.achievements||[]);
  box.innerHTML=ACH_META.map(a=>`
    <div class="ach ${got.has(a.id)?'unlocked':''}">
      <span class="ach-emoji">${a.emoji}</span>
      <div><div class="ach-name">${a.name}</div><div class="ach-desc">${a.desc}</div></div>
    </div>`).join('');
}

/* ---------- скины ---------- */
function renderSkins(data){
  const box=el('skins'); if(!box) return;
  const owned=new Set(data.ownedSkins||['fire']);
  box.innerHTML=Object.entries(data.catalog.skins).map(([id,s])=>{
    const isOwned=owned.has(id), isActive=data.pet.skin===id;
    let btn;
    if(isActive) btn='<button class="btn-apply" disabled>Выбран</button>';
    else if(isOwned) btn=`<button class="btn-apply" data-apply="${id}">Выбрать</button>`;
    else btn=`<button class="btn-apply" data-buyskin="${id}" ${data.pet.coins<s.price?'disabled':''}>${s.price} 🪙</button>`;
    return `<div class="skin-card ${isActive?'active':''}">
      <div class="skin-preview" style="background:radial-gradient(circle at 35% 30%,#fff,${s.c1},${s.c2})"></div>
      <div class="skin-name">${s.emoji} ${s.name}</div>
      <div class="skin-desc">${s.desc}</div>
      <div class="skin-actions">${btn}</div>
    </div>`;
  }).join('');
  box.querySelectorAll('[data-apply]').forEach(b=>b.addEventListener('click',()=>doApplySkin(b.dataset.apply)));
  box.querySelectorAll('[data-buyskin]').forEach(b=>b.addEventListener('click',()=>doBuy('skin',b.dataset.buyskin)));
}
async function doApplySkin(skin){
  try{
    const r=await api('/api/skin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({skin})});
    state.data.pet=r.pet; render(state.data); toast('Скин применён! 🎨');
  }catch(e){ toast('Не удалось сменить скин'); }
}

/* ---------- мини-игра ---------- */
const game={ active:false, score:0, timeLeft:20, timer:null, spawn:null };
if(el('gameStart')) el('gameStart').addEventListener('click',startGame);
function startGame(){
  if(game.active) return;
  game.active=true; game.score=0; game.timeLeft=20;
  el('gameScore').textContent='0'; el('gameTime').textContent='20';
  el('gameField').innerHTML='';
  game.timer=setInterval(()=>{
    game.timeLeft--; el('gameTime').textContent=game.timeLeft;
    if(game.timeLeft<=0) endGame();
  },1000);
  spawnStar();
  game.spawn=setInterval(spawnStar,700);
}
function spawnStar(){
  const field=el('gameField'); if(!field) return;
  const star=document.createElement('div');
  star.className='star-shot'; star.textContent='⭐';
  const maxX=Math.max(0,field.clientWidth-36), maxY=Math.max(0,field.clientHeight-36);
  star.style.left=(Math.random()*maxX)+'px';
  star.style.top=(Math.random()*maxY)+'px';
  star.addEventListener('click',()=>{
    if(!game.active) return;
    game.score++; el('gameScore').textContent=game.score;
    star.style.transform='scale(1.6)'; star.style.opacity='0';
    setTimeout(()=>star.remove(),120);
    if(tg && tg.HapticFeedback && tg.HapticFeedback.impactOccurred) tg.HapticFeedback.impactOccurred('light');
  });
  field.appendChild(star);
  setTimeout(()=>{ if(star.parentNode) star.remove(); },1400);
}
async function endGame(){
  game.active=false;
  clearInterval(game.timer); clearInterval(game.spawn);
  el('gameField').innerHTML='<div style="display:flex;height:100%;align-items:center;justify-content:center;color:var(--muted);font-size:14px">Игра окончена!</div>';
  try{
    const r=await api('/api/minigame',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({points:game.score,by_name:state.user.name})});
    const d=state.data; d.pet=r.pet; d.newAchievements=r.newAchievements; render(d); d.newAchievements=null;
    toast(`Поймано ${game.score} ⭐ → +${r.reward.coins}🪙 +${r.reward.xp}XP`);
  }catch(e){ toast('Награда не зачислена'); }
}

/* ---------- загрузка ---------- */
async function load(){
  try{
    const data=await api('/api/pet');
    render(data);
  }catch(e){
    console.error(e); toast('Не удалось загрузить дракона 😢');
  }
}
load();
setInterval(()=>{ if(!document.hidden) load(); },60000);