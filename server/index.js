'use strict';

const express = require('express');
const path = require('path');
const store = require('./db/store');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10kb' }));

// Tutte le route (API + frontend) vivono in un router montato sia su "/"
// che su "/angry-hamster": il gioco funziona in locale alla radice e in
// produzione dietro il prefisso https://games.cysalazar.com/angry-hamster.
// Il frontend usa solo URL relativi, quindi non distingue i due casi.
const router = express.Router();

// --- API ---

router.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

router.get('/api/leaderboard', (_req, res) => {
  res.json(store.getLeaderboard());
});

router.post('/api/leaderboard', (req, res) => {
  const { nome, punteggio, livello, tempo } = req.body || {};
  if (typeof punteggio !== 'number' || !isFinite(punteggio) || punteggio < 0) {
    return res.status(400).json({ errore: 'Punteggio non valido' });
  }
  const entry = store.addScore({ nome, punteggio, livello, tempo });
  res.status(201).json(entry);
});

router.get('/api/player', (_req, res) => {
  res.json(store.getPlayer());
});

router.put('/api/player', (req, res) => {
  const { nome } = req.body || {};
  if (typeof nome !== 'string') {
    return res.status(400).json({ errore: 'Nome non valido' });
  }
  res.json(store.setPlayer(nome));
});

// --- Frontend statico ---

// Matter.js servito direttamente da node_modules: nessuna CDN esterna,
// il gioco funziona anche completamente offline dentro il container.
router.get('/vendor/matter.min.js', (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(require.resolve('matter-js/build/matter.min.js'));
});

// no-cache: il browser rivalida ogni file (304 se invariato). Evita che dopo
// un aggiornamento dell'app il client giochi con vecchi script in cache.
router.use(express.static(path.join(__dirname, '..', 'public'), {
  etag: true,
  lastModified: true,
  setHeaders: (res) => res.set('Cache-Control', 'no-cache')
}));

app.use('/angry-hamster', router);
app.use('/', router);

app.listen(PORT, () => {
  console.log(`Angry Hamster in ascolto su http://localhost:${PORT}`);
});
