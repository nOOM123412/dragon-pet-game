// ===== Telegram WebApp =====
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
let user = { id: null, name: 'гость' };

if (tg) {
  try {
    tg.ready();
    tg.expand();
    tg.setHeaderColor && tg.setHeaderColor('#140b2e');
    tg.setBackgroundColor && tg.setBackgroundColor('#0a0618');
    const u = tg.initDataUnsafe && tg.initDataUnsafe.user;
    if (u) {
      user.id = String(u.id);
      user.name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'маг';
    }
  } catch (e) { console.warn('tg init', e); }
}

document.getElementById('playerChip').textContent = user.name;

// ===== Элементы =====
const $ = (id) => document.getElementById(id);
const el = {
  stageName: $('stageName'), stageBadge: $('stageBadge'),
  xpFill: $('xpFill'), xpText: $('xpText'),
  valHunger: $('valHunger'), valFun: $('valFun'), valEnergy: $('valEnergy'),
  barHunger: $('barHunger'), barFun: $('barFun'), barEnergy: $('barEnergy'),
  dragon: $('dragon'), moodBubble: $('moodBubble'),
  log: $('log'), toast: $('toast'), sparkles: $('sparkles'),
  magicBtn: document.querySelector('.magic-btn')
};

const ACTION_VERB = {
  feed: 'покормил(а)',
  play: 'поиграл(а)',
  rest: 'уложил(а) спать',
  pet: 'погладил(а)',
  magic: 'сотворил(а) магию'
};

const ACTION_MSG = {
  feed: 'Ням-ням! Спасибо за вкусняшку 🍖',
  play: 'Ура! Давай ещё поиграем! 🎈',
  rest: 'Мурр... сладкий сон 😴',
  pet: 'Мне так тепло от твоих рук 💜',
  magic: 'Магический прилив сил! 🔮✨'
};

let busy = false;
let currentPet = null;
let magicCooldownUntil = 0;

// ===== Рендер =====
function setBar(bar, val) { bar.style.width = Math.max(0, Math.min(100, val)) + '%'; }

function moodText(p) {
  if (p.stage >= 5) return `Я ${p.stageName}! Спасибо, что растили меня вместе ✨`;
  if (p.hunger < 25) return 'Я голоден... покорми, пожалуйста 🥺';
  if (p.fun < 25) return 'Мне скучно, сыграем? 🎈';
  if (p.energy < 20) return 'Я совсем без сил, дай поспать 🌙';
  if (p.hunger > 70 && p.fun > 70 && p.energy > 60) return 'Я счастливейший дракон на свете! 🐉✨';
  return 'Я расту понемногу каждый день 🌱';
}

function render(p) {
  currentPet = p;
  el.stageName.textContent = p.stageName;
  el.stageBadge.textContent = 'ур. ' + (p.stage + 1);
  el.dragon.querySelector('.body');
  // эмодзи-стадия на мордочке через бейдж
  el.valHunger.textContent = p.hunger;
  el.valFun.textContent = p.fun;
  el.valEnergy.textContent = p.energy;
  setBar(el.barHunger, p.hunger);
  setBar(el.barFun, p.fun);
  setBar(el.barEnergy, p.energy);

  // XP
  const prevXp = p.stage > 0 ? null : 0;
  let base = 0;
  const thresholds = [0, 60, 180, 400, 750, 1300, Infinity];
  base = thresholds[p.stage] || 0;
  const next = p.nextStageXp != null ? p.nextStageXp : p.xp;
  let pct;
  if (p.nextStageXp == null) pct = 100;
  else pct = Math.max(0, Math.min(100, ((p.xp - base) / (next - base)) * 100));
  el.xpFill.style.width = pct + '%';
  el.xpText.textContent = p.nextStageXp != null
    ? `${p.xp} / ${p.nextStageXp} XP · далее «${p.nextStageName}»`
    : `${p.xp} XP · максимальная форма!`;

  el.moodBubble.textContent = moodText(p);

  // подсветка низких статов
  document.querySelector('[data-stat="hunger"]').classList.toggle('low', p.hunger < 25);
  document.querySelector('[data-stat="fun"]').classList.toggle('low', p.fun < 25);
  document.querySelector('[data-stat="energy"]').classList.toggle('low', p.energy < 20);

  updateMagicState();
}

function updateMagicState() {
  const now = Date.now();
  if (now < magicCooldownUntil) {
    el.magicBtn.disabled = true;
    el.magicBtn.classList.remove('ready');
    const sec = Math.ceil((magicCooldownUntil - now) / 1000);
    el.magicBtn.querySelector('.lbl').textContent = fmtCooldown(sec);
  } else {
    el.magicBtn.disabled = false;
    el.magicBtn.classList.add('ready');
    el.magicBtn.querySelector('.lbl').textContent = 'Магия';
  }
}
function fmtCooldown(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2,'0')}` : `${s}с`;
}
setInterval(() => { if (magicCooldownUntil) updateMagicState(); }, 1000);

// ===== Лог =====
function renderLog(recent) {
  if (!recent || !recent.length) {
    el.log.innerHTML = '<li class="log-empty">Пока тишина... начните заботиться о драконе!</li>';
    return;
  }
  el.log.innerHTML = recent.map(r => {
    const verb = ACTION_VERB[r.action] || r.action;
    return `<li><span class="dot"></span><span><span class="who">${esc(r.by_name || 'Кто-то')}</span> ${verb}</span><span class="time">${timeAgo(r.ts)}</span></li>`;
  }).join('');
}
function esc(s) { return String(s).replace(/[<>&"]/g, c => ({'<':'<','>':'>','&':'&','"':'"'}[c])); }
function timeAgo(ts) {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60) return 'только что';
  if (d < 3600) return Math.floor(d/60) + ' мин назад';
  if (d < 86400) return Math.floor(d/3600) + ' ч назад';
  return Math.floor(d/86400) + ' дн назад';
}

// ===== Анимации =====
function celebrate(action) {
  el.dragon.classList.remove('happy');
  void el.dragon.offsetWidth;
  el.dragon.classList.add('happy');
  setTimeout(() => el.dragon.classList.remove('happy'), 600);

  if (action === 'magic') {
    el.dragon.classList.add('breathing');
    setTimeout(() => el.dragon.classList.remove('breathing'), 1500);
  }

  // спарклы
  const colors = ['#b46cff', '#42e6ff', '#ff6ec7', '#ffe27a'];
  for (let i = 0; i < 14; i++) {
    const s = document.createElement('span');
    s.className = 'sparkle';
    const angle = Math.random() * Math.PI * 2;
    const dist = 40 + Math.random() * 90;
    s.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
    s.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
    s.style.left = '50%'; s.style.top = '45%';
    s.style.background = `radial-gradient(circle, #fff, ${colors[i % colors.length]} 60%, transparent 70%)`;
    el.sparkles.appendChild(s);
    setTimeout(() => s.remove(), 950);
  }
}

function showToast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.toast.classList.remove('show'), 2200);
}

// Моргание дракончика
setInterval(() => {
  el.dragon.classList.add('blink');
  setTimeout(() => el.dragon.classList.remove('blink'), 160);
}, 3800);

// ===== API =====
async function loadPet() {
  const res = await fetch('/api/pet');
  if (!res.ok) throw new Error('load failed');
  const data = await res.json();
  render(data.pet);
  renderLog(data.recent);
}

async function doCare(action) {
  if (busy) return;
  busy = true;
  try {
    const res = await fetch('/api/care', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, by_name: user.name, by_id: user.id })
    });
    const data = await res.json();

    if (res.status === 429 && data.error === 'cooldown') {
      magicCooldownUntil = Date.now() + data.retryInMs;
      render(data.pet);
      updateMagicState();
      showToast('Магия перезаряжается 🔮');
      return;
    }
    if (!res.ok) throw new Error(data.error || 'fail');

    render(data.pet);
    if (data.recent) renderLog(data.recent);
    celebrate(action);
    showToast(ACTION_MSG[action] || 'Готово!');
    if (action === 'magic') {
      magicCooldownUntil = Date.now() + 30 * 60 * 1000;
      updateMagicState();
    }
  } catch (e) {
    console.error(e);
    showToast('Ой, связь с драконом потерялась...');
  } finally {
    busy = false;
  }
}

// ===== События =====
document.querySelectorAll('.action-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const a = btn.dataset.action;
    if (a === 'magic' && btn.disabled) return;
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    doCare(a);
  });
});

// ===== Автообновление =====
loadPet().catch(e => { console.error(e); showToast('Не удалось загрузить дракона'); });
setInterval(() => loadPet().catch(()=>{}), 30000);