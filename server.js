const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'dragon.db');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS pet (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL DEFAULT 'Игнис',
    hunger REAL NOT NULL DEFAULT 60,
    fun REAL NOT NULL DEFAULT 60,
    energy REAL NOT NULL DEFAULT 60,
    xp REAL NOT NULL DEFAULT 0,
    stage INTEGER NOT NULL DEFAULT 0,
    last_tick INTEGER NOT NULL,
    last_care INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS care (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    by_name TEXT,
    by_id TEXT,
    ts INTEGER NOT NULL
  );
`);

const HOUR = 3600 * 1000;
const MAX = 100;

const STAGES = [
  { xp: 0,    name: 'Дракончик',        emoji: '🐲' },
  { xp: 60,   name: 'Юный дракон',      emoji: '🐉' },
  { xp: 180,  name: 'Огненный дракон',  emoji: '🔥' },
  { xp: 400,  name: 'Ледяной дракон',   emoji: '❄️' },
  { xp: 750,  name: 'Древний дракон',   emoji: '🌟' },
  { xp: 1300, name: 'Мифический дракон',emoji: '✨' }
];

function now() { return Date.now(); }

function applyDecay(row) {
  const elapsedHours = (now() - row.last_tick) / HOUR;
  if (elapsedHours <= 0) return row;

  row.hunger = Math.max(0, row.hunger - elapsedHours * 4.5);
  row.fun    = Math.max(0, row.fun    - elapsedHours * 3.5);
  row.energy = Math.max(0, row.energy - elapsedHours * 2.0);

  if (row.hunger > 40 && row.fun > 40 && row.energy > 25) {
    row.xp += elapsedHours * 10;
  }
  if (row.hunger <= 0 || row.fun <= 0) {
    row.xp = Math.max(0, row.xp - elapsedHours * 5);
  }

  row.last_tick = now();
  row.stage = computeStage(row.xp);
  return row;
}

function computeStage(xp) {
  let stage = 0;
  for (let i = 0; i < STAGES.length; i++) {
    if (xp >= STAGES[i].xp) stage = i;
  }
  return stage;
}

function getOrCreatePet() {
  let row = db.prepare('SELECT * FROM pet WHERE id = 1').get();
  if (!row) {
    const t = now();
    db.prepare(`INSERT INTO pet (id, hunger, fun, energy, xp, stage, last_tick, last_care, created_at)
                VALUES (1, 60, 60, 60, 0, 0, ?, 0, ?)`).run(t, t);
    row = db.prepare('SELECT * FROM pet WHERE id = 1').get();
  }
  return row;
}

function savePet(row) {
  db.prepare(`UPDATE pet SET name=?, hunger=?, fun=?, energy=?, xp=?, stage=?, last_tick=?, last_care=? WHERE id=1`)
    .run(row.name, row.hunger, row.fun, row.energy, row.xp, row.stage, row.last_tick, row.last_care);
}

function petPublic(row) {
  const stageInfo = STAGES[row.stage] || STAGES[STAGES.length - 1];
  const nextStage = STAGES[row.stage + 1];
  return {
    name: row.name,
    hunger: Math.round(row.hunger),
    fun: Math.round(row.fun),
    energy: Math.round(row.energy),
    xp: Math.round(row.xp),
    stage: row.stage,
    stageName: stageInfo.name,
    stageEmoji: stageInfo.emoji,
    nextStageXp: nextStage ? nextStage.xp : null,
    nextStageName: nextStage ? nextStage.name : null,
    createdAt: row.created_at
  };
}

app.get('/api/pet', (req, res) => {
  try {
    let row = getOrCreatePet();
    row = applyDecay(row);
    savePet(row);
    const recent = db.prepare('SELECT action, by_name, ts FROM care ORDER BY id DESC LIMIT 12').all();
    res.json({ pet: petPublic(row), recent });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
});

const ACTIONS = {
  feed:  { hunger: +22, energy: +4,  xp: +6 },
  play:  { fun:    +24, energy: -12, xp: +8 },
  rest:  { energy: +30, fun:    +4,  xp: +4 },
  pet:   { fun:    +10, xp:     +4 },
  magic: { hunger: +8,  fun:    +8,  energy: +8, xp: +10 }
};

const ACTION_LABELS = {
  feed:  'покормил(а)',
  play:  'поиграл(а) с драконом',
  rest:  'уложил(а) спать',
  pet:   'погладил(а)',
  magic: 'сотворил(а) магию'
};

app.post('/api/care', (req, res) => {
  try {
    const { action, by_name, by_id } = req.body || {};
    if (!ACTIONS[action]) return res.status(400).json({ error: 'bad_action' });

    let row = getOrCreatePet();
    row = applyDecay(row);

    const a = ACTIONS[action];
    if (action === 'magic') {
      const sinceCare = now() - row.last_care;
      if (sinceCare < 30 * 60 * 1000) {
        savePet(row);
        return res.status(429).json({
          error: 'cooldown',
          pet: petPublic(row),
          retryInMs: 30 * 60 * 1000 - sinceCare
        });
      }
    }

    row.hunger = clamp(row.hunger + (a.hunger || 0));
    row.fun    = clamp(row.fun    + (a.fun    || 0));
    row.energy = clamp(row.energy + (a.energy || 0));
    row.xp     = Math.max(0, row.xp + (a.xp || 0));
    row.stage  = computeStage(row.xp);
    row.last_care = now();

    savePet(row);
    db.prepare('INSERT INTO care (action, by_name, by_id, ts) VALUES (?,?,?,?)')
      .run(action, by_name || 'Кто-то', by_id || null, now());

    const recent = db.prepare('SELECT action, by_name, ts FROM care ORDER BY id DESC LIMIT 12').all();
    res.json({ pet: petPublic(row), done: true, recent });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
});

function clamp(v) { return Math.max(0, Math.min(MAX, v)); }

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log('Dragon Pet server running on http://localhost:' + PORT);
});