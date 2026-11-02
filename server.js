const express = require('express');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || process.env.APP_PORT || 3000;

const DATA_DIR = process.env.DATA_DIR || '/app/data';
let DB_PATH = process.env.DB_PATH;
if (!DB_PATH) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    DB_PATH = path.join(DATA_DIR, 'dragon.db');
  } catch (e) {
    DB_PATH = path.join(__dirname, 'dragon.db');
  }
} else {
  try { fs.mkdirSync(path.dirname(DB_PATH), { recursive: true }); } catch (e) {}
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

/* ----------------------------- СХЕМА БД ----------------------------- */
db.exec(`
  CREATE TABLE IF NOT EXISTS pet (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL DEFAULT 'Игнис',
    hunger REAL NOT NULL DEFAULT 60,
    fun REAL NOT NULL DEFAULT 60,
    energy REAL NOT NULL DEFAULT 60,
    xp REAL NOT NULL DEFAULT 0,
    stage INTEGER NOT NULL DEFAULT 0,
    coins INTEGER NOT NULL DEFAULT 100,
    gems INTEGER NOT NULL DEFAULT 5,
    skin TEXT NOT NULL DEFAULT 'fire',
    last_tick INTEGER NOT NULL,
    last_care INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    day_count INTEGER NOT NULL DEFAULT 1,
    streak INTEGER NOT NULL DEFAULT 0,
    last_login_day INTEGER NOT NULL DEFAULT 0,
    freezes INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS care (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    detail TEXT,
    by_name TEXT,
    by_id TEXT,
    ts INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS inventory (
    item_id TEXT PRIMARY KEY,
    qty INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS owned_skins (
    skin_id TEXT PRIMARY KEY,
    ts INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS daily (
    day INTEGER PRIMARY KEY,
    quest_progress TEXT NOT NULL DEFAULT '{}',
    quest_rewards TEXT NOT NULL DEFAULT '[]'
  );
  CREATE TABLE IF NOT EXISTS achievements (
    id TEXT PRIMARY KEY,
    ts INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS stats (
    k TEXT PRIMARY KEY,
    v INTEGER NOT NULL DEFAULT 0
  );
`);

/* ----------------------------- КАТАЛОГИ ----------------------------- */
const STAGES = [
  { xp: 0,     name: 'Дракончик',         emoji: '🐲' },
  { xp: 60,    name: 'Юный дракон',       emoji: '🐉' },
  { xp: 180,   name: 'Огненный дракон',   emoji: '🔥' },
  { xp: 400,   name: 'Ледяной дракон',    emoji: '❄️' },
  { xp: 750,   name: 'Древний дракон',    emoji: '🌟' },
  { xp: 1300,  name: 'Мифический дракон', emoji: '✨' },
  { xp: 2100,  name: 'Небесный дракон',   emoji: '☁️' },
  { xp: 3200,  name: 'Космический дракон',emoji: '🌌' },
  { xp: 5000,  name: 'Божественный дракон',emoji: '👑' }
];
function computeStage(xp){ let s=0; for(let i=0;i<STAGES.length;i++){ if(xp>=STAGES[i].xp) s=i; } return s; }

// Скины дракона (модели)
const SKINS = {
  fire:    { name:'Огненный',   emoji:'🔥', price:0,   c1:'#ff7a2f', c2:'#ff3d6e', aura:'#ffb36b', desc:'Классический огненный дракон.' },
  ice:     { name:'Ледяной',    emoji:'❄️', price:350, c1:'#4fd1ff', c2:'#7a8cff', aura:'#bfe9ff', desc:'Дышит морозом и вьюгой.' },
  forest:  { name:'Лесной',     emoji:'🌿', price:400, c1:'#57d977', c2:'#2fa86b', aura:'#c9ffd8', desc:'Хранитель древних чащ.' },
  storm:   { name:'Грозовой',   emoji:'⚡', price:500, c1:'#a06bff', c2:'#5b7bff', aura:'#d9c9ff', desc:'Рождает гром и молнии.' },
  shadow:  { name:'Теневой',    emoji:'🌑', price:650, c1:'#5a4a7a', c2:'#251b3d', aura:'#8a6bd6', desc:'Скользит между сумерками.' },
  celestial:{name:'Небесный',   emoji:'🌟', price:800, c1:'#ffe27a', c2:'#ffb84d', aura:'#fff2c2', desc:'Светится золотым светом.' },
  cosmic:  { name:'Космический',emoji:'🌌', price:1200,c1:'#c46bff', c2:'#3d5bff', aura:'#e3c9ff', desc:'В его чешуе сияют звёзды.' }
};

// Предметы магазина
const ITEMS = {
  // еда
  fish:   { name:'Рыбка',        emoji:'🐟', price:15,  cat:'food', effect:{hunger:+12},      xp:4 },
  meat:   { name:'Сочное мясо',  emoji:'🍖', price:30,  cat:'food', effect:{hunger:+22},      xp:7 },
  cake:   { name:'Волшебный торт',emoji:'🍰',price:55,  cat:'food', effect:{hunger:+30,fun:+15}, xp:12 },
  potion: { name:'Эликсир сил',  emoji:'🧪', price:70,  cat:'food', effect:{energy:+50},      xp:10 },
  // игрушки
  ball:   { name:'Мяч',          emoji:'⚽', price:25,  cat:'toy',  effect:{fun:+25},         xp:8 },
  balloon:{ name:'Воздушный шарик',emoji:'🎈',price:20, cat:'toy',  effect:{fun:+18},         xp:6 },
  kite:   { name:'Космический змей',emoji:'🪁',price:60,cat:'toy',  effect:{fun:+35,energy:+10}, xp:14 },
  // зелья/усилитель
  star:   { name:'Звезда силы',  emoji:'⭐', price:90,  cat:'boost',effect:{xp:+40},          xp:0 }
};

const DAILY_QUESTS = [
  { id:'feed3',  text:'Покормить дракона 3 раза',      goal:3, stat:'feed',  reward:{coins:40, gems:1, xp:15} },
  { id:'play3',  text:'Поиграть 3 раза',               goal:3, stat:'play',  reward:{coins:35, gems:1, xp:12} },
  { id:'rest2',  text:'Уложить спать 2 раза',          goal:2, stat:'rest',  reward:{coins:25, xp:10} },
  { id:'pet5',   text:'Погладить 5 раз',               goal:5, stat:'pet',   reward:{coins:20, gems:1, xp:8} },
  { id:'care10', text:'Сделать 10 действий заботы',    goal:10,stat:'care',  reward:{coins:60, gems:2, xp:25} },
  { id:'magic1', text:'Использовать магию 1 раз',      goal:1, stat:'magic', reward:{coins:30, xp:20} }
];

const ACHIEVEMENTS = {
  first_care: { name:'Первый шаг',      desc:'Позаботиться о драконе', emoji:'🌱', gem:1 },
  day3:       { name:'Три дня вместе',  desc:'Играть 3 дня подряд',    emoji:'📅', gem:2 },
  day7:       { name:'Неделя заботы',   desc:'Играть 7 дней подряд',   emoji:'🗓️', gem:3 },
  stage2:     { name:'Пламя растёт',    desc:'Достичь дракона-огня',   emoji:'🔥', gem:2 },
  stage4:     { name:'Древний друг',    desc:'Достичь древнего дракона',emoji:'🌟', gem:4 },
  collector:  { name:'Коллекционер',    desc:'Собрать 3 скина',        emoji:'🎨', gem:3 },
  rich:       { name:'Богач',           desc:'Накопить 500 золота',    emoji:'💰', gem:2 },
  player:     { name:'Геймер',          desc:'Сыграть в мини-игру 10 раз', emoji:'🎮', gem:2 }
};

const MAX=100, HOUR=3600*1000, DAY=24*HOUR;
function now(){ return Date.now(); }
function clamp(v){ return Math.max(0,Math.min(MAX,v)); }
function dayIndex(){ return Math.floor(now()/DAY); }
function todayKey(){ return dayIndex(); }

function bumpStat(k,n=1){
  db.prepare('INSERT INTO stats (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=v+excluded.v').run(k,n);
}
function getStat(k){ const r=db.prepare('SELECT v FROM stats WHERE k=?').get(k); return r?r.v:0; }

/* ----------------------------- ПИТОМЕЦ ----------------------------- */
function applyDecay(row){
  const elapsedHours=(now()-row.last_tick)/HOUR;
  if(elapsedHours<=0) return row;
  row.hunger=Math.max(0,row.hunger-elapsedHours*4.5);
  row.fun   =Math.max(0,row.fun   -elapsedHours*3.5);
  row.energy=Math.max(0,row.energy-elapsedHours*2.0);
  if(row.hunger>40&&row.fun>40&&row.energy>25) row.xp+=elapsedHours*10;
  if(row.hunger<=0||row.fun<=0) row.xp=Math.max(0,row.xp-elapsedHours*5);
  row.last_tick=now();
  row.stage=computeStage(row.xp);
  // счётчик дней жизни
  const days=Math.floor((now()-row.created_at)/DAY)+1;
  if(days>row.day_count) row.day_count=days;
  return row;
}

function getOrCreatePet(){
  let row=db.prepare('SELECT * FROM pet WHERE id=1').get();
  if(!row){
    const t=now();
    db.prepare(`INSERT INTO pet (id,hunger,fun,energy,xp,stage,coins,gems,skin,last_tick,last_care,created_at,day_count,streak,last_login_day,freezes)
      VALUES (1,60,60,60,0,0,100,5,'fire',?,0,?,1,0,0,1)`).run(t,t);
    row=db.prepare('SELECT * FROM pet WHERE id=1').get();
  }
  return row;
}

function savePet(row){
  db.prepare(`UPDATE pet SET name=?,hunger=?,fun=?,energy=?,xp=?,stage=?,coins=?,gems=?,skin=?,last_tick=?,last_care=?,day_count=?,streak=?,last_login_day=?,freezes=? WHERE id=1`)
    .run(row.name,row.hunger,row.fun,row.energy,row.xp,row.stage,row.coins,row.gems,row.skin,row.last_tick,row.last_care,row.day_count,row.streak,row.last_login_day,row.freezes);
}

function petPublic(row){
  const st=STAGES[row.stage]||STAGES[STAGES.length-1];
  const nx=STAGES[row.stage+1];
  return {
    name:row.name, hunger:Math.round(row.hunger), fun:Math.round(row.fun), energy:Math.round(row.energy),
    xp:Math.round(row.xp), stage:row.stage, stageName:st.name, stageEmoji:st.emoji,
    nextStageXp:nx?nx.xp:null, nextStageName:nx?nx.name:null,
    coins:row.coins, gems:row.gems, skin:row.skin,
    dayCount:row.day_count, streak:row.streak, freezes:row.freezes,
    createdAt:row.created_at
  };
}

/* ----------------------------- ЕЖЕДНЕВНОЕ ----------------------------- */
function getDaily(day){
  let r=db.prepare('SELECT * FROM daily WHERE day=?').get(day);
  if(!r){
    db.prepare('INSERT INTO daily (day,quest_progress,quest_rewards) VALUES (?,?,?)').run(day,'{}','[]');
    r=db.prepare('SELECT * FROM daily WHERE day=?').get(day);
  }
  return r;
}
function dailyPublic(day){
  const r=getDaily(day);
  const prog=JSON.parse(r.quest_progress||'{}');
  const claimed=JSON.parse(r.quest_rewards||'[]');
  const quests=DAILY_QUESTS.map(q=>({...q, progress:prog[q.id]||0, claimed:claimed.includes(q.id), done:(prog[q.id]||0)>=q.goal}));
  return { day, quests };
}
function addQuestProgress(statKey,n=1){
  const day=todayKey(); const r=getDaily(day);
  const prog=JSON.parse(r.quest_progress||'{}');
  const affected=DAILY_QUESTS.filter(q=>q.stat===statKey||q.stat==='care');
  for(const q of affected){ prog[q.id]=(prog[q.id]||0)+n; }
  db.prepare('UPDATE daily SET quest_progress=? WHERE day=?').run(JSON.stringify(prog),day);
}

/* ----------------------------- ДОСТИЖЕНИЯ ----------------------------- */
function unlockAch(id){
  const exists=db.prepare('SELECT 1 FROM achievements WHERE id=?').get(id);
  if(exists) return null;
  const a=ACHIEVEMENTS[id]; if(!a) return null;
  db.prepare('INSERT INTO achievements (id,ts) VALUES (?,?)').run(id,now());
  const pet=getOrCreatePet();
  pet.gems+=a.gem; savePet(pet);
  return a;
}
function checkAch(pet){
  const out=[];
  const ownedSkins=db.prepare('SELECT COUNT(*) c FROM owned_skins').get().c;
  const checks={
    day3: pet.streak>=3, day7: pet.streak>=7,
    stage2: pet.stage>=2, stage4: pet.stage>=4,
    collector: ownedSkins>=3, rich: pet.coins>=500,
    player: getStat('minigame')>=10
  };
  for(const [id,ok] of Object.entries(checks)){ if(ok){ const a=unlockAch(id); if(a) out.push({id,...a}); } }
  return out;
}

/* ----------------------------- ВЫДАЧА ЛОГИНА/СЕРИИ ----------------------------- */
function processLogin(pet){
  const today=dayIndex();
  const msgs=[];
  if(pet.last_login_day===today) return {pet, msgs};
  if(pet.last_login_day===0){
    pet.streak=1;
  } else if(today-pet.last_login_day===1){
    pet.streak+=1;
  } else if(today-pet.last_login_day>1){
    // используем заморозку если пропущен ровно 1 день
    if(today-pet.last_login_day===2 && pet.freezes>0){ pet.freezes-=1; pet.streak+=1; msgs.push('Заморозка сохранена — серия не прервалась ❄️'); }
    else { pet.streak=1; }
  }
  pet.last_login_day=today;
  // ежедневная награда за вход
  const reward={coins:20+pet.streak*5, gems: pet.streak%3===0?1:0, xp:10+pet.streak*2};
  pet.coins+=reward.coins; pet.gems+=reward.gems; pet.xp+=reward.xp; pet.stage=computeStage(pet.xp);
  msgs.unshift(`День ${pet.day_count} · серия ${pet.streak} 🔥 +${reward.coins}🪙 +${reward.xp}XP${reward.gems?` +${reward.gems}💎`:''}`);
  return {pet, msgs, reward};
}

/* ----------------------------- API ----------------------------- */
app.get('/api/pet',(req,res)=>{
  try{
    let row=getOrCreatePet();
    row=applyDecay(row);
    const login=processLogin(row);
    row=login.pet;
    savePet(row);
    const recent=db.prepare('SELECT action,detail,by_name,ts FROM care ORDER BY id DESC LIMIT 15').all();
    const inventory=db.prepare('SELECT item_id,qty FROM inventory WHERE qty>0').all();
    const ownedSkins=db.prepare('SELECT skin_id FROM owned_skins').all().map(r=>r.skin_id);
    if(!ownedSkins.includes('fire')) ownedSkins.push('fire');
    const achievements=db.prepare('SELECT id FROM achievements').all().map(r=>r.id);
    res.json({
      pet:petPublic(row),
      recent,
      daily:dailyPublic(todayKey()),
      inventory,
      ownedSkins,
      achievements,
      loginMsgs:login.msgs||[],
      catalog:{ skins:SKINS, items:ITEMS }
    });
  }catch(e){ console.error(e); res.status(500).json({error:'server_error'}); }
});

// Действие заботы
const ACTIONS={
  feed:{hunger:+22,energy:+4,xp:+6},
  play:{fun:+24,energy:-12,xp:+8},
  rest:{energy:+30,fun:+4,xp:+4},
  pet:{fun:+10,xp:+4},
  magic:{hunger:+8,fun:+8,energy:+8,xp:+10}
};
const ACTION_LABEL={feed:'покормил(а)',play:'поиграл(а)',rest:'уложил(а) спать',pet:'погладил(а)',magic:'сотворил(а) магию'};

app.post('/api/care',(req,res)=>{
  try{
    const {action,by_name,by_id}=req.body||{};
    if(!ACTIONS[action]) return res.status(400).json({error:'bad_action'});
    let row=getOrCreatePet(); row=applyDecay(row);
    if(action==='magic'){
      const since=now()-row.last_care;
      if(since<30*60*1000){ savePet(row); return res.status(429).json({error:'cooldown',pet:petPublic(row),retryInMs:30*60*1000-since}); }
    }
    const a=ACTIONS[action];
    row.hunger=clamp(row.hunger+(a.hunger||0));
    row.fun=clamp(row.fun+(a.fun||0));
    row.energy=clamp(row.energy+(a.energy||0));
    row.xp=Math.max(0,row.xp+(a.xp||0));
    row.stage=computeStage(row.xp);
    row.last_care=now();
    row.coins+=2; // небольшая награда
    savePet(row);
    db.prepare('INSERT INTO care (action,detail,by_name,by_id,ts) VALUES (?,?,?,?,?)').run(action,null,by_name||'Кто-то',by_id||null,now());
    bumpStat('care'); addQuestProgress(action); addQuestProgress('care');
    if(getStat('care')===1) unlockAch('first_care');
    const ach=checkAch(row);
    const recent=db.prepare('SELECT action,detail,by_name,ts FROM care ORDER BY id DESC LIMIT 15').all();
    const daily=dailyPublic(todayKey());
    res.json({pet:petPublic(row),done:true,recent,daily,newAchievements:ach});
  }catch(e){ console.error(e); res.status(500).json({error:'server_error'}); }
});

// Использовать предмет из инвентаря
app.post('/api/use',(req,res)=>{
  try{
    const {item_id,by_name}=req.body||{};
    const item=ITEMS[item_id]; if(!item) return res.status(400).json({error:'bad_item'});
    const inv=db.prepare('SELECT qty FROM inventory WHERE item_id=?').get(item_id);
    if(!inv||inv.qty<=0) return res.status(400).json({error:'no_item'});
    let row=getOrCreatePet(); row=applyDecay(row);
    const e=item.effect||{};
    row.hunger=clamp(row.hunger+(e.hunger||0));
    row.fun=clamp(row.fun+(e.fun||0));
    row.energy=clamp(row.energy+(e.energy||0));
    row.xp=Math.max(0,row.xp+(e.xp||0)+(item.xp||0));
    row.stage=computeStage(row.xp);
    row.coins+=1;
    savePet(row);
    db.prepare('UPDATE inventory SET qty=qty-1 WHERE item_id=?').run(item_id);
    db.prepare('INSERT INTO care (action,detail,by_name,by_id,ts) VALUES (?,?,?,?,?)').run('use',item.emoji+' '+item.name,by_name||'Кто-то',null,now());
    addQuestProgress('care');
    const ach=checkAch(row);
    const recent=db.prepare('SELECT action,detail,by_name,ts FROM care ORDER BY id DESC LIMIT 15').all();
    res.json({pet:petPublic(row),done:true,recent,newAchievements:ach});
  }catch(e){ console.error(e); res.status(500).json({error:'server_error'}); }
});

// Купить предмет/скин
app.post('/api/buy',(req,res)=>{
  try{
    const {kind,id}=req.body||{};
    let row=getOrCreatePet();
    if(kind==='item'){
      const item=ITEMS[id]; if(!item) return res.status(400).json({error:'bad_item'});
      if(row.coins<item.price) return res.status(400).json({error:'no_coins',pet:petPublic(row)});
      row.coins-=item.price; savePet(row);
      db.prepare('INSERT INTO inventory (item_id,qty) VALUES (?,1) ON CONFLICT(item_id) DO UPDATE SET qty=qty+1').run(id);
    } else if(kind==='skin'){
      const skin=SKINS[id]; if(!skin) return res.status(400).json({error:'bad_skin'});
      const owned=db.prepare('SELECT 1 FROM owned_skins WHERE skin_id=?').get(id);
      if(owned) return res.status(400).json({error:'already_owned'});
      if(row.coins<skin.price) return res.status(400).json({error:'no_coins',pet:petPublic(row)});
      row.coins-=skin.price; savePet(row);
      db.prepare('INSERT INTO owned_skins (skin_id,ts) VALUES (?,?)').run(id,now());
    } else return res.status(400).json({error:'bad_kind'});
    const inv=db.prepare('SELECT item_id,qty FROM inventory WHERE qty>0').all();
    const ownedSkins=db.prepare('SELECT skin_id FROM owned_skins').all().map(r=>r.skin_id);
    if(!ownedSkins.includes('fire')) ownedSkins.push('fire');
    const ach=checkAch(row);
    res.json({pet:petPublic(row),inventory:inv,ownedSkins,newAchievements:ach});
  }catch(e){ console.error(e); res.status(500).json({error:'server_error'}); }
});

// Сменить скин
app.post('/api/skin',(req,res)=>{
  try{
    const {skin}=req.body||{};
    if(!SKINS[skin]) return res.status(400).json({error:'bad_skin'});
    const owned=db.prepare('SELECT 1 FROM owned_skins WHERE skin_id=?').get(skin);
    if(skin!=='fire'&&!owned) return res.status(400).json({error:'not_owned'});
    let row=getOrCreatePet(); row.skin=skin; savePet(row);
    res.json({pet:petPublic(row)});
  }catch(e){ console.error(e); res.status(500).json({error:'server_error'}); }
});

// Забрать награду за квест
app.post('/api/quest/claim',(req,res)=>{
  try{
    const {quest_id}=req.body||{};
    const q=DAILY_QUESTS.find(x=>x.id===quest_id); if(!q) return res.status(400).json({error:'bad_quest'});
    const day=todayKey(); const r=getDaily(day);
    const prog=JSON.parse(r.quest_progress||'{}'); const claimed=JSON.parse(r.quest_rewards||'[]');
    if((prog[q.id]||0)<q.goal) return res.status(400).json({error:'not_done'});
    if(claimed.includes(q.id)) return res.status(400).json({error:'already_claimed'});
    claimed.push(q.id);
    db.prepare('UPDATE daily SET quest_rewards=? WHERE day=?').run(JSON.stringify(claimed),day);
    let row=getOrCreatePet();
    row.coins+=q.reward.coins||0; row.gems+=q.reward.gems||0; row.xp+=q.reward.xp||0; row.stage=computeStage(row.xp);
    savePet(row);
    const ach=checkAch(row);
    res.json({pet:petPublic(row),daily:dailyPublic(day),newAchievements:ach});
  }catch(e){ console.error(e); res.status(500).json({error:'server_error'}); }
});

// Мини-игра: награда за очки (макс 30)
app.post('/api/minigame',(req,res)=>{
  try{
    let pts=Math.max(0,Math.min(30,parseInt(req.body&&req.body.points)||0));
    let row=getOrCreatePet(); row=applyDecay(row);
    const coins=pts*3, xp=Math.round(pts*1.5);
    row.coins+=coins; row.xp+=xp; row.stage=computeStage(row.xp);
    savePet(row);
    bumpStat('minigame');
    db.prepare('INSERT INTO care (action,detail,by_name,by_id,ts) VALUES (?,?,?,?,?)').run('minigame',`+${coins}🪙 +${xp}XP`,req.body.by_name||'Кто-то',null,now());
    const ach=checkAch(row);
    res.json({pet:petPublic(row),reward:{coins,xp},newAchievements:ach});
  }catch(e){ console.error(e); res.status(500).json({error:'server_error'}); }
});

app.get('/api/health',(req,res)=>res.json({ok:true}));

module.exports=app;

/* ----------------------------- ЗАПУСК (обход wrapper Bothost) ----------------------------- */
const {exec}=require('child_process');
function startServer(){
  const server=app.listen(PORT,'0.0.0.0',()=>console.log('Dragon Pet server listening on 0.0.0.0:'+PORT));
  server.on('error',(err)=>{
    if(err&&err.code==='EADDRINUSE'){
      console.log('Port '+PORT+' busy (wrapper). Killing wrapper and retrying...');
      exec("pkill -f 'bothost/http-wrapper.js' || true",()=>{
        setTimeout(()=>{
          const s2=app.listen(PORT,'0.0.0.0',()=>console.log('Dragon Pet server listening on 0.0.0.0:'+PORT+' (after freeing)'));
          s2.on('error',(e2)=>console.error('Still cannot bind '+PORT+':',e2&&e2.code));
        },800);
      });
    } else console.error('Listen error:',err);
  });
}
startServer();

/* ----------------------------- TELEGRAM BOT ----------------------------- */
const TG_TOKEN=process.env.BOT_TOKEN||'9251615143:AAHxLwJtFtM8SJ6mfhJZEWzkhdc7enrgJCs';
const WEBAPP_URL=process.env.WEBAPP_URL||'https://bot-1793598505-9002-noom.bothost.tech/';
function tg(method,payload){
  return fetch(`https://api.telegram.org/bot${TG_TOKEN}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload||{})}).then(r=>r.json()).catch(e=>{console.error('tg',method,e.message);return null;});
}
let tgOffset=0;
async function pollTelegram(){
  try{
    const r=await fetch(`https://api.telegram.org/bot${TG_TOKEN}/getUpdates?timeout=25&offset=${tgOffset}`,{signal:AbortSignal.timeout(30000)});
    const data=await r.json();
    if(data&&data.ok){
      for(const u of data.result){
        tgOffset=u.update_id+1;
        const msg=u.message; if(!msg) continue;
        const text=(msg.text||'').trim();
        if(text.startsWith('/start')||text.startsWith('/играть')){
          await tg('sendMessage',{chat_id:msg.chat.id,text:'🐲 Наш дракончик скучает! Заходи и ухаживай за ним 💛',reply_markup:{inline_keyboard:[[{text:'🐲 Открыть игру',web_app:{url:WEBAPP_URL}}]]}});
        }
      }
    }
  }catch(e){}
  setTimeout(pollTelegram,1500);
}
pollTelegram();