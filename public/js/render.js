'use strict';

// Renderer procedurale su canvas: nessun asset esterno, tutto disegnato
// con primitive vettoriali. Il mondo logico è fisso a 1600x900 unità e
// viene scalato (con letterbox) sulla dimensione reale del canvas.

const AH_WORLD = { W: 1600, H: 900, GROUND_Y: 840 };

const AH_MATERIALI = {
  vetro:  { colore: '#a8d8ef', bordo: '#6fb3d6', densita: 0.0004, attrito: 0.2, restituzione: 0.05, hp: 34,  punti: 250 },
  legno:  { colore: '#c68a4b', bordo: '#8a5a2b', densita: 0.0007, attrito: 0.5, restituzione: 0.12, hp: 95,  punti: 500 },
  pietra: { colore: '#9a9a9a', bordo: '#6b6b6b', densita: 0.0016, attrito: 0.8, restituzione: 0.05, hp: 380, punti: 750 }
};

class AHRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 1;
    this.offX = 0;
    this.offY = 0;
    this.renderScale = 1; // ridotto automaticamente se gli FPS calano
    this.particles = [];
    this.floaters = [];
    this.clouds = [
      { x: 200, y: 120, s: 1.1 }, { x: 640, y: 80, s: 0.8 },
      { x: 1050, y: 150, s: 1.3 }, { x: 1420, y: 90, s: 0.9 }
    ];
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.renderScale;
    const cw = this.canvas.clientWidth || window.innerWidth;
    const ch = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.max(1, Math.round(cw * dpr));
    this.canvas.height = Math.max(1, Math.round(ch * dpr));
    this.dpr = dpr;
    this.scale = Math.min(this.canvas.width / AH_WORLD.W, this.canvas.height / AH_WORLD.H);
    this.offX = (this.canvas.width - AH_WORLD.W * this.scale) / 2;
    this.offY = (this.canvas.height - AH_WORLD.H * this.scale) / 2;
  }

  // Coordinate schermo (CSS px) → mondo
  toWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * (this.canvas.width / rect.width);
    const py = (clientY - rect.top) * (this.canvas.height / rect.height);
    return {
      x: (px - this.offX) / this.scale,
      y: (py - this.offY) / this.scale
    };
  }

  // ---- Particelle ----

  spawn(x, y, opts = {}) {
    const n = opts.n || 8;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (opts.speed || 4) * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp + (opts.vx || 0),
        vy: Math.sin(a) * sp - 2 + (opts.vy || 0),
        r: (opts.r || 5) * (0.5 + Math.random()),
        col: Array.isArray(opts.col) ? opts.col[i % opts.col.length] : (opts.col || '#c9a56a'),
        life: 1,
        decay: opts.decay || 0.03,
        grav: opts.grav !== undefined ? opts.grav : 0.25
      });
    }
    if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
  }

  updateParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += p.grav;
      p.life -= p.decay;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  // ---- Disegno principale ----

  draw(game) {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#7db8d4';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.scale, 0, 0, this.scale, this.offX, this.offY);

    this.drawBackground(ctx);
    this.drawSlingshotBack(ctx, game);

    // Corpi di gioco
    for (const p of (game.platforms || [])) this.drawPlatform(ctx, p);
    for (const b of game.blocks) this.drawBlock(ctx, b);
    for (const c of game.cats) this.drawCat(ctx, c);
    for (const h of game.flying) this.drawHamster(ctx, h.body, h.tipo, h);
    if (game.loaded) this.drawHamster(ctx, null, game.loaded.tipo, null, game.pouchPos());

    this.drawSlingshotFront(ctx, game);
    if (game.dragging) this.drawTrajectory(ctx, game);

    // Coda di criceti in attesa, seduti accanto alla fionda
    let qx = game.slingX - 90;
    for (const tipo of game.queue) {
      this.drawHamsterIdle(ctx, tipo, qx, AH_WORLD.GROUND_Y - AH_HAMSTERS[tipo].raggio * 0.8);
      qx -= 52;
    }

    this.updateParticles();
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.col;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Punteggi fluttuanti
    ctx.font = 'bold 26px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.y -= 1.2;
      f.life -= 0.02;
      if (f.life <= 0) { this.floaters.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
      ctx.strokeStyle = '#3a2a18';
      ctx.lineWidth = 4;
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = '#ffd23e';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  floatText(x, y, text) {
    this.floaters.push({ x, y, text, life: 1.2 });
    if (this.floaters.length > 40) this.floaters.shift();
  }

  drawBackground(ctx) {
    const { W, H, GROUND_Y } = AH_WORLD;

    // Cielo
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    sky.addColorStop(0, '#8ed4ee');
    sky.addColorStop(1, '#d6f0f9');
    ctx.fillStyle = sky;
    ctx.fillRect(-400, -400, W + 800, GROUND_Y + 400);

    // Sole
    ctx.fillStyle = '#ffe27a';
    ctx.beginPath();
    ctx.arc(1450, 110, 55, 0, Math.PI * 2);
    ctx.fill();

    // Nuvole (lenta deriva)
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    for (const c of this.clouds) {
      c.x += 0.08 * c.s;
      if (c.x > W + 150) c.x = -150;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 28 * c.s, 0, Math.PI * 2);
      ctx.arc(c.x + 30 * c.s, c.y - 12 * c.s, 24 * c.s, 0, Math.PI * 2);
      ctx.arc(c.x + 58 * c.s, c.y, 26 * c.s, 0, Math.PI * 2);
      ctx.fill();
    }

    // Colline
    ctx.fillStyle = '#9fd97f';
    ctx.beginPath();
    ctx.moveTo(-400, GROUND_Y);
    ctx.quadraticCurveTo(300, GROUND_Y - 180, 800, GROUND_Y);
    ctx.quadraticCurveTo(1250, GROUND_Y - 140, 2000, GROUND_Y);
    ctx.fill();

    // Terreno
    ctx.fillStyle = '#6abe4f';
    ctx.fillRect(-400, GROUND_Y, W + 800, H - GROUND_Y + 400);
    ctx.fillStyle = '#4a9636';
    ctx.fillRect(-400, GROUND_Y, W + 800, 10);
    // Ciuffi d'erba
    ctx.strokeStyle = '#3d8a2c';
    ctx.lineWidth = 3;
    for (let x = 20; x < W; x += 90) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y + 4); ctx.lineTo(x - 5, GROUND_Y - 9);
      ctx.moveTo(x + 6, GROUND_Y + 4); ctx.lineTo(x + 9, GROUND_Y - 7);
      ctx.stroke();
    }
  }

  // ---- Fionda ----

  drawSlingshotBack(ctx, game) {
    const x = game.slingX, y = AH_WORLD.GROUND_Y;
    ctx.strokeStyle = '#7a4a20';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    // Ramo posteriore
    ctx.beginPath();
    ctx.moveTo(x, y - 10);
    ctx.quadraticCurveTo(x + 6, y - 70, x + 26, y - 128);
    ctx.stroke();
    // Elastico posteriore
    const p = game.pouchPos();
    if (game.loaded || game.dragging) {
      ctx.strokeStyle = '#5a3a1a';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x + 26, y - 128);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  }

  drawSlingshotFront(ctx, game) {
    const x = game.slingX, y = AH_WORLD.GROUND_Y;
    const p = game.pouchPos();
    // Elastico anteriore
    if (game.loaded || game.dragging) {
      ctx.strokeStyle = '#8a5a2b';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - 26, y - 124);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    // Tronco + ramo anteriore
    ctx.strokeStyle = '#8a5a2b';
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(x, y + 2);
    ctx.lineTo(x, y - 60);
    ctx.stroke();
    ctx.lineWidth = 13;
    ctx.beginPath();
    ctx.moveTo(x, y - 55);
    ctx.quadraticCurveTo(x - 8, y - 85, x - 26, y - 124);
    ctx.stroke();
  }

  drawTrajectory(ctx, game) {
    const v = game.launchVelocity();
    if (!v) return;
    let px = game.pouchPos().x, py = game.pouchPos().y;
    let vx = v.x, vy = v.y;
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    for (let i = 0; i < 28; i++) {
      px += vx; py += vy;
      vy += 0.278; // stessa gravità per tick usata da Matter.js
      if (i % 2 === 0) {
        ctx.beginPath();
        ctx.arc(px, py, Math.max(2, 5 - i * 0.12), 0, Math.PI * 2);
        ctx.fill();
      }
      if (py > AH_WORLD.GROUND_Y) break;
    }
  }

  // ---- Piattaforme statiche (isole di terra con manto erboso) ----

  drawPlatform(ctx, p) {
    const b = p.body;
    const w = p.w, h = p.h;
    ctx.save();
    ctx.translate(b.position.x, b.position.y);

    // Zolla di terra
    ctx.fillStyle = '#9c7648';
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = '#7a5a34';
    ctx.lineWidth = 3;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    // Sassolini nella terra
    ctx.fillStyle = 'rgba(0,0,0,.15)';
    for (let i = 0; i < Math.max(2, w / 40); i++) {
      const sx = (((i * 67) % 100) / 100 - 0.5) * (w - 16);
      ctx.beginPath();
      ctx.arc(sx, h * 0.1, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Manto erboso sopra
    ctx.fillStyle = '#6abe4f';
    ctx.fillRect(-w / 2 - 4, -h / 2 - 7, w + 8, 12);
    ctx.strokeStyle = '#4a9636';
    ctx.lineWidth = 2;
    ctx.strokeRect(-w / 2 - 4, -h / 2 - 7, w + 8, 12);
    // Ciuffi d'erba
    ctx.strokeStyle = '#3d8a2c';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let x = -w / 2 + 12; x < w / 2 - 6; x += 34) {
      ctx.moveTo(x, -h / 2 - 6); ctx.lineTo(x - 4, -h / 2 - 15);
      ctx.moveTo(x + 5, -h / 2 - 6); ctx.lineTo(x + 8, -h / 2 - 13);
    }
    ctx.stroke();

    ctx.restore();
  }

  // ---- Blocchi ----

  drawBlock(ctx, block) {
    const b = block.body;
    const mat = AH_MATERIALI[block.materiale];
    const ratio = block.hp / block.hpMax;
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);
    const w = block.w, h = block.h;

    if (block.materiale === 'vetro') ctx.globalAlpha = 0.75;
    ctx.fillStyle = mat.colore;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = mat.bordo;
    ctx.lineWidth = 3;
    ctx.strokeRect(-w / 2, -h / 2, w, h);

    // Texture per materiale
    ctx.strokeStyle = 'rgba(0,0,0,.14)';
    ctx.lineWidth = 2;
    if (block.materiale === 'legno') {
      const step = Math.max(18, Math.min(w, h) * 0.8);
      if (w >= h) {
        for (let x = -w / 2 + step; x < w / 2; x += step) {
          ctx.beginPath(); ctx.moveTo(x, -h / 2 + 3); ctx.lineTo(x, h / 2 - 3); ctx.stroke();
        }
      } else {
        for (let y = -h / 2 + step; y < h / 2; y += step) {
          ctx.beginPath(); ctx.moveTo(-w / 2 + 3, y); ctx.lineTo(w / 2 - 3, y); ctx.stroke();
        }
      }
    } else if (block.materiale === 'pietra') {
      ctx.fillStyle = 'rgba(255,255,255,.18)';
      ctx.fillRect(-w / 2 + 4, -h / 2 + 4, w - 8, Math.min(8, h * 0.2));
      ctx.fillStyle = 'rgba(0,0,0,.12)';
      for (let i = 0; i < Math.max(2, (w * h) / 3000); i++) {
        const sx = (((i * 73) % 100) / 100 - 0.5) * (w - 12);
        const sy = (((i * 37) % 100) / 100 - 0.5) * (h - 12);
        ctx.beginPath(); ctx.arc(sx, sy, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    } else if (block.materiale === 'vetro') {
      ctx.strokeStyle = 'rgba(255,255,255,.6)';
      ctx.beginPath();
      ctx.moveTo(-w / 2 + w * 0.2, -h / 2 + 4);
      ctx.lineTo(-w / 2 + w * 0.38, h / 2 - 4);
      ctx.stroke();
    }

    // Crepe da danno
    if (ratio < 0.66) {
      ctx.strokeStyle = 'rgba(30,20,10,.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-w * 0.3, -h * 0.35);
      ctx.lineTo(-w * 0.1, 0);
      ctx.lineTo(-w * 0.28, h * 0.3);
      ctx.stroke();
    }
    if (ratio < 0.33) {
      ctx.beginPath();
      ctx.moveTo(w * 0.32, -h * 0.3);
      ctx.lineTo(w * 0.08, 0.05 * h);
      ctx.lineTo(w * 0.3, h * 0.35);
      ctx.moveTo(w * 0.08, 0.05 * h);
      ctx.lineTo(-w * 0.15, h * 0.15);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---- Gatti Ladri ----

  drawCat(ctx, cat) {
    const b = cat.body;
    const r = cat.raggio;
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);

    // Orecchie
    ctx.fillStyle = cat.boss ? '#5a5a6e' : '#7d7d8f';
    ctx.beginPath();
    ctx.moveTo(-r * 0.75, -r * 0.55); ctx.lineTo(-r * 0.95, -r * 1.35); ctx.lineTo(-r * 0.25, -r * 0.9);
    ctx.moveTo(r * 0.75, -r * 0.55); ctx.lineTo(r * 0.95, -r * 1.35); ctx.lineTo(r * 0.25, -r * 0.9);
    ctx.fill();

    // Testa
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4b4b5c';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Maschera da ladro
    ctx.fillStyle = '#2e2e3a';
    ctx.fillRect(-r, -r * 0.5, r * 2, r * 0.55);

    // Occhi cattivi
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath();
    ctx.arc(-r * 0.4, -r * 0.22, r * 0.2, 0, Math.PI * 2);
    ctx.arc(r * 0.4, -r * 0.22, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(-r * 0.36, -r * 0.2, r * 0.09, 0, Math.PI * 2);
    ctx.arc(r * 0.44, -r * 0.2, r * 0.09, 0, Math.PI * 2);
    ctx.fill();

    // Muso
    ctx.fillStyle = '#e8a4b8';
    ctx.beginPath();
    ctx.moveTo(0, r * 0.15); ctx.lineTo(-r * 0.14, r * 0.32); ctx.lineTo(r * 0.14, r * 0.32);
    ctx.fill();
    ctx.strokeStyle = '#4b4b5c';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, r * 0.32); ctx.lineTo(0, r * 0.5);
    ctx.moveTo(0, r * 0.5); ctx.quadraticCurveTo(-r * 0.25, r * 0.65, -r * 0.4, r * 0.5);
    ctx.moveTo(0, r * 0.5); ctx.quadraticCurveTo(r * 0.25, r * 0.65, r * 0.4, r * 0.5);
    ctx.stroke();

    // Baffi
    ctx.beginPath();
    for (const s of [-1, 1]) {
      ctx.moveTo(s * r * 0.2, r * 0.35); ctx.lineTo(s * r * 1.1, r * 0.25);
      ctx.moveTo(s * r * 0.2, r * 0.42); ctx.lineTo(s * r * 1.05, r * 0.5);
    }
    ctx.stroke();

    // Corona per il boss
    if (cat.boss) {
      ctx.fillStyle = '#ffd23e';
      ctx.strokeStyle = '#c8961e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-r * 0.55, -r * 1.05);
      ctx.lineTo(-r * 0.55, -r * 1.45);
      ctx.lineTo(-r * 0.28, -r * 1.15);
      ctx.lineTo(0, -r * 1.5);
      ctx.lineTo(r * 0.28, -r * 1.15);
      ctx.lineTo(r * 0.55, -r * 1.45);
      ctx.lineTo(r * 0.55, -r * 1.05);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Barra vita (solo se danneggiato)
    if (cat.hp < cat.hpMax) {
      const ratio = Math.max(0, cat.hp / cat.hpMax);
      ctx.rotate(-b.angle);
      ctx.fillStyle = 'rgba(0,0,0,.4)';
      ctx.fillRect(-r, -r - 20, r * 2, 6);
      ctx.fillStyle = ratio > 0.5 ? '#6abe4f' : (ratio > 0.25 ? '#ffd23e' : '#e0533d');
      ctx.fillRect(-r, -r - 20, r * 2 * ratio, 6);
    }
    ctx.restore();
  }

  // ---- Criceti ----

  drawHamster(ctx, body, tipo, flyData, fixedPos) {
    const def = AH_HAMSTERS[tipo];
    const r = flyData && flyData.mini ? 13 : def.raggio;
    const pos = fixedPos || body.position;
    const ang = fixedPos ? 0 : body.angle;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(ang);
    this.paintHamsterShape(ctx, def, r, flyData);
    ctx.restore();

    // Scia del Criceto Veloce in scatto
    if (flyData && flyData.piercingUntil && performance.now() < flyData.piercingUntil && body) {
      this.spawn(pos.x, pos.y, { n: 2, col: '#bcdcf5', speed: 1, r: 4, decay: 0.08, grav: 0 });
    }
  }

  drawHamsterIdle(ctx, tipo, x, y) {
    const def = AH_HAMSTERS[tipo];
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(0.8, 0.8);
    this.paintHamsterShape(ctx, def, def.raggio, null);
    ctx.restore();
  }

  paintHamsterShape(ctx, def, r, flyData) {
    // Corpo
    ctx.fillStyle = def.colore;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,30,0,.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Orecchie tonde
    ctx.fillStyle = def.colore;
    ctx.beginPath();
    ctx.arc(-r * 0.55, -r * 0.8, r * 0.32, 0, Math.PI * 2);
    ctx.arc(r * 0.55, -r * 0.8, r * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = def.colorePancia;
    ctx.beginPath();
    ctx.arc(-r * 0.55, -r * 0.8, r * 0.16, 0, Math.PI * 2);
    ctx.arc(r * 0.55, -r * 0.8, r * 0.16, 0, Math.PI * 2);
    ctx.fill();

    // Pancia / muso
    ctx.fillStyle = def.colorePancia;
    ctx.beginPath();
    ctx.arc(0, r * 0.35, r * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Occhi arrabbiati
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-r * 0.35, -r * 0.15, r * 0.22, 0, Math.PI * 2);
    ctx.arc(r * 0.35, -r * 0.15, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(-r * 0.3, -r * 0.12, r * 0.1, 0, Math.PI * 2);
    ctx.arc(r * 0.4, -r * 0.12, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
    // Sopracciglia
    ctx.strokeStyle = '#3a2a18';
    ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.beginPath();
    ctx.moveTo(-r * 0.55, -r * 0.5); ctx.lineTo(-r * 0.15, -r * 0.32);
    ctx.moveTo(r * 0.55, -r * 0.5); ctx.lineTo(r * 0.15, -r * 0.32);
    ctx.stroke();

    // Nasino e dentini
    ctx.fillStyle = '#c05a6a';
    ctx.beginPath();
    ctx.arc(0, r * 0.12, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(-r * 0.12, r * 0.24, r * 0.11, r * 0.18);
    ctx.fillRect(r * 0.01, r * 0.24, r * 0.11, r * 0.18);

    // Dettagli per tipo
    if (def.abilita === 'piombata') {
      // Elmetto
      ctx.fillStyle = '#5f6e5a';
      ctx.beginPath();
      ctx.arc(0, -r * 0.25, r * 0.85, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = '#42503e';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (def.abilita === 'boom') {
      // Miccia accesa
      ctx.strokeStyle = '#3a2a18';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.quadraticCurveTo(r * 0.3, -r * 1.3, r * 0.5, -r * 1.25);
      ctx.stroke();
      const spark = (performance.now() / 90) % 2 > 1;
      ctx.fillStyle = spark ? '#ffd23e' : '#ff7a2e';
      ctx.beginPath();
      ctx.arc(r * 0.5, -r * 1.25, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
    } else if (def.abilita === 'scatto') {
      // Occhialoni
      ctx.strokeStyle = '#2a5e8c';
      ctx.lineWidth = Math.max(2, r * 0.14);
      ctx.beginPath();
      ctx.arc(-r * 0.35, -r * 0.15, r * 0.3, 0, Math.PI * 2);
      ctx.arc(r * 0.35, -r * 0.15, r * 0.3, 0, Math.PI * 2);
      ctx.stroke();
    } else if (def.abilita === 'trio') {
      // Tre puntini distintivi
      ctx.fillStyle = '#fff';
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.arc(i * r * 0.28, -r * 0.72, r * 0.09, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
