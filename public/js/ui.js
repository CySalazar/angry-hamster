'use strict';

// Gestione schermate, HUD e progressione (stelle/badge in localStorage).

const AH_TOT_LIVELLI = 10;

class AHUI {
  constructor() {
    this.playerName = 'Giocatore';
    this.levelCache = {};
    this.currentLevel = null;
    this.lastResult = null;
    this.$ = (sel) => document.querySelector(sel);
    this._hintTimer = null;
  }

  async init(game, renderer) {
    this.game = game;
    this.renderer = renderer;

    const player = await AH_API.getPlayer();
    this.playerName = player.nome;
    this._refreshPlayerTag();

    this._bindMenu();
    this._bindGameButtons();
    window.addEventListener('resize', () => this.renderer.resize());
  }

  // ============ Progressione (localStorage) ============

  get stars() { return JSON.parse(localStorage.getItem('ah_stars') || '{}'); }
  set stars(v) { localStorage.setItem('ah_stars', JSON.stringify(v)); }
  get badges() { return JSON.parse(localStorage.getItem('ah_badges') || '{}'); }
  set badges(v) { localStorage.setItem('ah_badges', JSON.stringify(v)); }
  get streak() { return parseInt(localStorage.getItem('ah_streak') || '0', 10); }
  set streak(v) { localStorage.setItem('ah_streak', String(v)); }

  isUnlocked(n) {
    return n === 1 || this.stars[n - 1] !== undefined;
  }

  nextUncompleted() {
    for (let i = 1; i <= AH_TOT_LIVELLI; i++) {
      if (this.stars[i] === undefined) return this.isUnlocked(i) ? i : 1;
    }
    return 1;
  }

  // ============ Navigazione schermate ============

  show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    this.$(`#${id}`).classList.add('active');
  }

  _bindMenu() {
    this.$('#btn-new-game').addEventListener('click', () => this.startLevel(this.nextUncompleted()));
    this.$('#btn-levels').addEventListener('click', () => this.showLevels());
    this.$('#btn-board').addEventListener('click', () => this.showBoard());
    this.$('#btn-settings').addEventListener('click', () => this.showSettings());
    document.querySelectorAll('[data-back]').forEach(b =>
      b.addEventListener('click', () => this.show('screen-menu')));

    this.$('#btn-save-settings').addEventListener('click', async () => {
      const nome = this.$('#input-player-name').value.trim() || 'Giocatore';
      const saved = await AH_API.setPlayer(nome);
      this.playerName = saved ? saved.nome : nome;
      AH_AUDIO.setEnabled(this.$('#input-sound').checked);
      AH_AUDIO.setMusicEnabled(this.$('#input-music').checked);
      this._refreshPlayerTag();
      const fb = this.$('#settings-feedback');
      fb.textContent = saved ? '✔ Salvato!' : '⚠ Salvato solo in locale (server non raggiungibile)';
      setTimeout(() => { fb.textContent = ''; }, 2500);
    });
  }

  _refreshPlayerTag() {
    this.$('#menu-player-name').textContent = this.playerName;
  }

  // ============ Selezione livello ============

  async showLevels() {
    const grid = this.$('#levels-grid');
    grid.innerHTML = '';
    const stars = this.stars;
    for (let i = 1; i <= AH_TOT_LIVELLI; i++) {
      const unlocked = this.isUnlocked(i);
      const lv = await this._levelData(i).catch(() => null);
      const card = document.createElement('button');
      card.className = 'level-card' + (unlocked ? '' : ' locked');
      const s = stars[i];
      const starsTxt = s === undefined
        ? (unlocked ? '·' : '🔒')
        : '⭐'.repeat(s) + '☆'.repeat(3 - s);
      card.innerHTML = `
        <div class="num">${i}</div>
        <div class="name">${lv ? lv.nome : ''}</div>
        <div class="stars">${starsTxt}</div>`;
      if (unlocked) card.addEventListener('click', () => this.startLevel(i));
      grid.appendChild(card);
    }
    this.show('screen-levels');
  }

  // ============ Classifica ============

  async showBoard() {
    const box = this.$('#board-content');
    box.innerHTML = '<p class="empty">Caricamento…</p>';
    this.show('screen-board');
    const rows = await AH_API.getLeaderboard();
    if (rows === null) {
      box.innerHTML = '<p class="empty">⚠ Impossibile contattare il server.</p>';
      return;
    }
    if (!rows.length) {
      box.innerHTML = '<p class="empty">Nessun punteggio ancora registrato.<br>Gioca una partita e apri le danze! 🐹</p>';
      return;
    }
    const fmtData = iso => {
      try { return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' }); }
      catch { return ''; }
    };
    box.innerHTML = `<table>
      <thead><tr><th></th><th style="text-align:left">Nome</th><th>Punti</th><th>Liv.</th><th>Tempo</th><th>Data</th></tr></thead>
      <tbody>${rows.map((r, i) => `
        <tr class="${i === 0 ? 'top1' : ''}">
          <td class="pos">${['🥇', '🥈', '🥉'][i] || (i + 1)}</td>
          <td style="text-align:left">${this._esc(r.nome)}</td>
          <td class="pts">${r.punteggio.toLocaleString('it-IT')}</td>
          <td>${r.livello}</td>
          <td>${r.tempo}s</td>
          <td>${fmtData(r.data)}</td>
        </tr>`).join('')}
      </tbody></table>`;
  }

  _esc(s) {
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  // ============ Impostazioni ============

  showSettings() {
    this.$('#input-player-name').value = this.playerName;
    this.$('#input-sound').checked = AH_AUDIO.enabled;
    this.$('#input-music').checked = AH_AUDIO.musicEnabled;
    this.show('screen-settings');
  }

  // ============ Gioco ============

  async _levelData(n) {
    if (!this.levelCache[n]) {
      const r = await fetch(`levels/level${String(n).padStart(2, '0')}.json`);
      if (!r.ok) throw new Error(`Livello ${n} non trovato`);
      this.levelCache[n] = await r.json();
    }
    return this.levelCache[n];
  }

  async startLevel(n) {
    let data;
    try {
      data = await this._levelData(n);
    } catch (e) {
      alert('Errore nel caricamento del livello: ' + e.message);
      return;
    }
    this.currentLevel = n;
    this.show('screen-game');
    this.$('#screen-end').classList.remove('active');
    this.$('#screen-pause').classList.remove('active');
    this.renderer.resize();
    this.game.loadLevel(data);
    this.hint(`Livello ${n}: ${data.nome} — Elimina tutti i Gatti Ladri!`);
  }

  _bindGameButtons() {
    this.$('#btn-pause').addEventListener('click', () => {
      if (this.game.status !== 'playing') return;
      this.game.pause();
      this.$('#screen-pause').classList.add('active');
    });
    this.$('#btn-resume').addEventListener('click', () => {
      this.$('#screen-pause').classList.remove('active');
      this.game.resume();
    });
    this.$('#btn-restart').addEventListener('click', () => this.startLevel(this.currentLevel));
    this.$('#btn-pause-restart').addEventListener('click', () => this.startLevel(this.currentLevel));
    this.$('#btn-pause-menu').addEventListener('click', () => {
      this.game.destroy();
      this.show('screen-menu');
    });

    this.$('#btn-end-retry').addEventListener('click', () => this.startLevel(this.currentLevel));
    this.$('#btn-end-next').addEventListener('click', () => {
      if (this.currentLevel < AH_TOT_LIVELLI) this.startLevel(this.currentLevel + 1);
    });
    this.$('#btn-end-menu').addEventListener('click', () => {
      this.game.destroy();
      this.show('screen-menu');
    });

    window.addEventListener('keydown', e => {
      if (e.code === 'Escape' && this.$('#screen-game').classList.contains('active')) {
        if (this.game.status === 'playing') {
          this.game.pause();
          this.$('#screen-pause').classList.add('active');
        } else if (this.game.status === 'paused') {
          this.$('#screen-pause').classList.remove('active');
          this.game.resume();
        }
      }
    });
  }

  // ============ Callback HUD dal gioco ============

  onHud({ score, queue, loaded, level, levelName }) {
    this.$('#hud-score').textContent = score.toLocaleString('it-IT');
    this.$('#hud-level').textContent = `Liv. ${level} — ${levelName}`;
    const active = this.$('#hud-active');
    if (loaded) {
      const def = AH_HAMSTERS[loaded.tipo];
      active.textContent = `${def.emoji} ${def.nome}`;
      active.style.display = '';
    } else {
      active.style.display = 'none';
    }
    const q = this.$('#hud-queue');
    q.innerHTML = queue.map(t =>
      `<div class="q-ham" title="${AH_HAMSTERS[t].nome}">${AH_HAMSTERS[t].emoji}</div>`).join('');
  }

  onHudTime(ms) {
    const s = Math.floor(ms / 1000);
    this.$('#hud-time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  hint(text) {
    const el = this.$('#hud-hint');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => el.classList.remove('show'), 4500);
  }

  // ============ Fine livello ============

  async onEnd(result) {
    this.lastResult = result;
    const n = result.livello;

    if (result.vinto) {
      this.streak = this.streak + 1;
      if (this.streak >= 3) {
        result.badges.push({ icona: '🔥', nome: 'Inarrestabile', desc: `${this.streak} vittorie di fila` });
      }
      // Salva stelle (tiene il massimo) e badge (unione)
      const stars = this.stars;
      stars[n] = Math.max(stars[n] || 0, result.stelle);
      this.stars = stars;
      const badges = this.badges;
      badges[n] = [...new Set([...(badges[n] || []), ...result.badges.map(b => b.nome)])];
      this.badges = badges;
      // Punteggio in classifica
      AH_API.postScore({
        nome: this.playerName,
        punteggio: result.totale,
        livello: n,
        tempo: result.tempoSec
      });
    } else {
      this.streak = 0;
    }

    // Composizione schermata
    this.$('#end-title').textContent = result.vinto
      ? (n === AH_TOT_LIVELLI ? '👑 Hai battuto il Re Gatto!' : '🎉 Vittoria!')
      : '😿 Livello fallito…';

    const starsEl = this.$('#end-stars');
    if (result.vinto) {
      starsEl.innerHTML = [1, 2, 3].map(i =>
        `<span class="star ${i <= result.stelle ? 'won' : ''}">⭐</span>`).join('');
      starsEl.style.display = '';
    } else {
      starsEl.style.display = 'none';
    }

    const bd = this.$('#end-breakdown');
    if (result.vinto) {
      bd.innerHTML = `<table>
        <tr><td>Distruzione e gatti</td><td>${result.punteggioBase.toLocaleString('it-IT')}</td></tr>
        <tr><td>Criceti risparmiati (${result.salvati} × 2.000)</td><td>${result.bonusSalvati.toLocaleString('it-IT')}</td></tr>
        <tr><td>Bonus tempo (${result.tempoSec}s)</td><td>${result.bonusTempo.toLocaleString('it-IT')}</td></tr>
        <tr class="total"><td>Totale</td><td>${result.totale.toLocaleString('it-IT')}</td></tr>
      </table>`;
    } else {
      bd.innerHTML = `<p>Restavano <strong>${result.gattiRimasti}</strong> Gatti Ladri.<br>Punteggio non salvato: riprova!</p>`;
    }

    this.$('#end-badges').innerHTML = result.vinto
      ? result.badges.map(b => `<span class="badge" title="${b.desc}">${b.icona} ${b.nome}</span>`).join('')
      : '';

    const next = this.$('#btn-end-next');
    next.disabled = !result.vinto || n >= AH_TOT_LIVELLI;
    next.style.display = (result.vinto && n < AH_TOT_LIVELLI) ? '' : 'none';

    this.$('#screen-end').classList.add('active');
  }
}
