'use strict';

// Client REST minimale. Ogni chiamata fallisce in modo "morbido":
// il gioco resta giocabile anche se il backend non risponde.
window.AH_API = {
  async getPlayer() {
    try {
      const r = await fetch('api/player');
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch {
      return { nome: 'Giocatore' };
    }
  },

  async setPlayer(nome) {
    try {
      const r = await fetch('api/player', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome })
      });
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch {
      return null;
    }
  },

  async getLeaderboard() {
    try {
      const r = await fetch('api/leaderboard');
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch {
      return null; // null = errore di rete (diverso da [] = classifica vuota)
    }
  },

  async postScore(entry) {
    try {
      const r = await fetch('api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch {
      return null;
    }
  }
};
