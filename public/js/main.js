'use strict';

// Bootstrap dell'applicazione.
window.addEventListener('DOMContentLoaded', async () => {
  const canvas = document.getElementById('game-canvas');
  const renderer = new AHRenderer(canvas);
  const ui = new AHUI();

  const game = new AHGame(canvas, renderer, {
    onHud: (h) => ui.onHud(h),
    onHudTime: (ms) => ui.onHudTime(ms),
    onHint: (t) => ui.hint(t),
    onEnd: (r) => ui.onEnd(r)
  });

  await ui.init(game, renderer);

  // La musica parte al primo gesto utente (vincolo autoplay dei browser);
  // unlock() è idempotente, quindi basta un listener one-shot per tipo.
  const primoGesto = () => AH_AUDIO.unlock();
  window.addEventListener('pointerdown', primoGesto, { once: true });
  window.addEventListener('keydown', primoGesto, { once: true });

  // Hook di debug/test end-to-end (documentato in DECISIONS.md)

  // Ricerca balistica: simula la traiettoria con la stessa fisica del gioco
  // (gravità per tick + attrito aria) e trova (vx, vy) per colpire (tx, ty).
  // Simula il volo e restituisce la x esatta (interpolata) al passaggio
  // discendente per la quota ty; null se la quota non viene mai raggiunta.
  function simXaQuota(vx0, vy0, ty) {
    let x = 220, y = 714, vx = vx0, vy = vy0;
    for (let t = 0; t < 500; t++) {
      const py = y;
      vy += 0.278;
      vx *= 0.998; vy *= 0.998;
      x += vx; y += vy;
      if (vy > 0 && py <= ty && y >= ty) {
        const f = (ty - py) / (y - py);
        return x - vx + vx * f;
      }
      if (y > 920) break;
    }
    return null;
  }

  function mira(tx, ty, stile = 'lob') {
    const vys = stile === 'flat'
      ? [-1, -3, -6, -9, -12, -14, -16, -18]
      : [-16, -18, -14, -12, -9, -6, -3, -1];
    let best = null;
    for (const vy0 of vys) {
      // fase 1: ricerca grossolana
      let coarse = null;
      for (let vx0 = 4; vx0 <= 28; vx0 += 0.5) {
        const hx = simXaQuota(vx0, vy0, ty);
        if (hx === null) continue;
        const err = Math.abs(hx - tx);
        if (!coarse || err < coarse.err) coarse = { vx: vx0, err };
      }
      if (!coarse) continue;
      // fase 2: raffinamento fine attorno al candidato
      for (let vx0 = Math.max(4, coarse.vx - 0.6); vx0 <= Math.min(28, coarse.vx + 0.6); vx0 += 0.05) {
        const hx = simXaQuota(vx0, vy0, ty);
        if (hx === null) continue;
        const err = Math.abs(hx - tx);
        if (!best || err < best.err) best = { vx: vx0, vy: vy0, err };
      }
      if (best && best.err < 4) return best;
    }
    return best;
  }

  // Attiva l'abilità del criceto in volo secondo la regola indicata:
  // numero → distanza euclidea da un gatto; {sopra:true} → quando è sopra
  // la verticale di un gatto (per la piombata); {mai:true} → mai.
  function autoAbilita(regola = 150) {
    const opts = typeof regola === 'number' ? { dist: regola } : (regola || {});
    if (opts.mai) return Promise.resolve(false);
    return new Promise(resolve => {
      const t0 = performance.now();
      const timer = setInterval(() => {
        const ham = game.flying.find(h => !h.abilityUsed);
        if (!ham || performance.now() - t0 > 7000) {
          clearInterval(timer);
          resolve(false);
          return;
        }
        const p = ham.body.position;
        const ok = opts.sopra
          ? (opts.tx !== undefined
              ? Math.abs(p.x - opts.tx) < 40
              : game.cats.some(c =>
                  Math.abs(c.body.position.x - p.x) < 30 && p.y < c.body.position.y - 60))
          : game.cats.some(c =>
              Math.hypot(c.body.position.x - p.x, c.body.position.y - p.y) < (opts.dist || 150));
        if (ok) {
          game._activateAbility();
          clearInterval(timer);
          resolve(true);
        }
      }, 40);
    });
  }

  window.AH_DEBUG = {
    game,
    ui,
    renderer,
    lancia: (vx, vy) => game.debugLaunch(vx, vy),
    stato: () => game.stateSnapshot(),
    mira,
    autoAbilita
  };
});
