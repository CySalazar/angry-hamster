'use strict';

// Store JSON su disco: un unico file data/db.json con scritture atomiche
// (write su file temporaneo + rename) per non corrompere i dati se il
// container viene fermato a metà scrittura.

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_DB = {
  player: { nome: 'Giocatore' },
  leaderboard: []
};

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      player: {
        nome: typeof parsed?.player?.nome === 'string' && parsed.player.nome.trim()
          ? parsed.player.nome
          : DEFAULT_DB.player.nome
      },
      leaderboard: Array.isArray(parsed?.leaderboard) ? parsed.leaderboard : []
    };
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('[store] db.json illeggibile, riparto dal default:', err.message);
    }
    return JSON.parse(JSON.stringify(DEFAULT_DB));
  }
}

function save(db) {
  ensureDataDir();
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

let db = load();

function sanitizeNome(nome) {
  if (typeof nome !== 'string') return null;
  const clean = nome.replace(/[\x00-\x1f<>]/g, "").trim().slice(0, 20);
  return clean || null;
}

module.exports = {
  getPlayer() {
    return { nome: db.player.nome };
  },

  setPlayer(nome) {
    const clean = sanitizeNome(nome);
    db.player.nome = clean || 'Giocatore';
    save(db);
    return { nome: db.player.nome };
  },

  getLeaderboard() {
    return [...db.leaderboard]
      .sort((a, b) => b.punteggio - a.punteggio)
      .slice(0, 10);
  },

  addScore({ nome, punteggio, livello, tempo }) {
    const entry = {
      nome: sanitizeNome(nome) || 'Giocatore',
      punteggio: Math.max(0, Math.floor(Number(punteggio) || 0)),
      livello: Math.min(10, Math.max(1, Math.floor(Number(livello) || 1))),
      tempo: Math.max(0, Math.round((Number(tempo) || 0) * 10) / 10),
      data: new Date().toISOString()
    };
    db.leaderboard.push(entry);
    // Conserva solo le 100 migliori per non far crescere il file all'infinito.
    db.leaderboard = db.leaderboard
      .sort((a, b) => b.punteggio - a.punteggio)
      .slice(0, 100);
    save(db);
    return entry;
  }
};
