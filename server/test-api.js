'use strict';

// Test automatico delle API: avvia il server su porta e directory dati
// temporanee, esercita gli endpoint e verifica la persistenza su disco
// simulando un riavvio (secondo processo sulla stessa DATA_DIR).

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 3199;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-test-'));

let failures = 0;
function check(name, cond) {
  console.log(`${cond ? '✔' : '✘'} ${name}`);
  if (!cond) failures++;
}

function startServer() {
  const proc = spawn(process.execPath, [path.join(__dirname, 'index.js')], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR },
    stdio: 'ignore'
  });
  return proc;
}

async function waitReady() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch { /* non ancora pronto */ }
    await new Promise(res => setTimeout(res, 100));
  }
  throw new Error('Server non partito');
}

(async () => {
  let proc = startServer();
  try {
    await waitReady();

    // Player di default
    let r = await (await fetch(`${BASE}/api/player`)).json();
    check('GET /api/player → default "Giocatore"', r.nome === 'Giocatore');

    // Aggiornamento nome (con sanitizzazione)
    r = await (await fetch(`${BASE}/api/player`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: '  Matteo<script>  ' })
    })).json();
    check('PUT /api/player sanitizza il nome', r.nome === 'Matteoscript');

    r = await fetch(`${BASE}/api/player`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: 42 })
    });
    check('PUT /api/player rifiuta nome non stringa (400)', r.status === 400);

    // Classifica vuota
    r = await (await fetch(`${BASE}/api/leaderboard`)).json();
    check('GET /api/leaderboard vuota all\'inizio', Array.isArray(r) && r.length === 0);

    // Inserimento punteggi (12, per verificare il taglio a top 10)
    for (let i = 1; i <= 12; i++) {
      await fetch(`${BASE}/api/leaderboard`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: `P${i}`, punteggio: i * 1000, livello: (i % 10) + 1, tempo: 30 + i })
      });
    }
    r = await fetch(`${BASE}/api/leaderboard`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: 'X', punteggio: 'non-un-numero' })
    });
    check('POST /api/leaderboard rifiuta punteggio non numerico (400)', r.status === 400);

    r = await (await fetch(`${BASE}/api/leaderboard`)).json();
    check('Classifica limitata a top 10', r.length === 10);
    check('Classifica ordinata per punteggio decrescente',
      r.every((e, i) => i === 0 || r[i - 1].punteggio >= e.punteggio));
    check('Il punteggio più alto è 12000', r[0].punteggio === 12000);
    check('Le entry hanno data ISO', typeof r[0].data === 'string' && !isNaN(Date.parse(r[0].data)));

    // "Riavvio": nuovo processo sulla stessa DATA_DIR
    proc.kill();
    await new Promise(res => setTimeout(res, 300));
    proc = startServer();
    await waitReady();

    r = await (await fetch(`${BASE}/api/player`)).json();
    check('Nome giocatore persistito dopo riavvio', r.nome === 'Matteoscript');
    r = await (await fetch(`${BASE}/api/leaderboard`)).json();
    check('Classifica persistita dopo riavvio', r.length === 10 && r[0].punteggio === 12000);

    console.log(failures ? `\n${failures} TEST FALLITI` : '\nTutti i test API superati ✔');
    process.exitCode = failures ? 1 : 0;
  } catch (e) {
    console.error('Errore nei test:', e);
    process.exitCode = 1;
  } finally {
    proc.kill();
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }
})();
