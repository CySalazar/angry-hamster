'use strict';

const express = require('express');
const path = require('path');
const store = require('./db/store');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10kb' }));

// --- API ---

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/leaderboard', (_req, res) => {
  res.json(store.getLeaderboard());
});

app.post('/api/leaderboard', (req, res) => {
  const { nome, punteggio, livello, tempo } = req.body || {};
  if (typeof punteggio !== 'number' || !isFinite(punteggio) || punteggio < 0) {
    return res.status(400).json({ errore: 'Punteggio non valido' });
  }
  const entry = store.addScore({ nome, punteggio, livello, tempo });
  res.status(201).json(entry);
});

app.get('/api/player', (_req, res) => {
  res.json(store.getPlayer());
});

app.put('/api/player', (req, res) => {
  const { nome } = req.body || {};
  if (typeof nome !== 'string') {
    return res.status(400).json({ errore: 'Nome non valido' });
  }
  res.json(store.setPlayer(nome));
});

// --- Frontend statico ---

// Matter.js servito direttamente da node_modules: nessuna CDN esterna,
// il gioco funziona anche completamente offline dentro il container.
app.get('/vendor/matter.min.js', (_req, res) => {
  res.sendFile(require.resolve('matter-js/build/matter.min.js'));
});

// no-cache: il browser rivalida ogni file (304 se invariato). Evita che dopo
// un aggiornamento dell'app il client giochi con vecchi script in cache.
app.use(express.static(path.join(__dirname, '..', 'public'), {
  etag: true,
  lastModified: true,
  setHeaders: (res) => res.set('Cache-Control', 'no-cache')
}));

app.listen(PORT, () => {
  console.log(`Angry Hamster in ascolto su http://localhost:${PORT}`);
});
