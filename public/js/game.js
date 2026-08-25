'use strict';

// Engine di gioco: mondo Matter.js + fionda + danni + abilità criceti.
//
// Unità: il mondo logico è 1600x900 (vedi render.js). Le velocità Matter
// sono espresse in px per tick da 16.666ms. Il danno da impatto è
// proporzionale a massa * velocità_relativa² (energia cinetica).

const AH_TUNING = {
  POWER: 0.215,          // vettore fionda → velocità di lancio
  MAX_DRAG: 130,         // raggio massimo di trascinamento della fionda
  MIN_DRAG: 14,          // sotto questa distanza il lancio è annullato
  DMG_K: 0.18,           // costante del danno da impatto
  MIN_IMPACT_SPEED: 3,   // sotto questa velocità relativa nessun danno
  STATIC_FACTOR: 0.4,    // il terreno/piattaforme danneggiano con massa propria ridotta
  CAT_HP: 60,
  CAT_BOSS_HP: 350,
  MINI_DMG_MULT: 2.2,    // i mini-criceti del Divisore colpiscono più forte della loro massa
  PIOMBATA_MULT: 2.5,
  SCATTO_MULT: 3.0,      // moltiplicatore su vetro/legno durante lo scatto
  EXPLOSION_RADIUS: 200,
  EXPLOSION_DMG: 320,
  PUNTI_GATTO: 3000,
  PUNTI_BOSS: 8000,
  PUNTI_CRICETO_SALVO: 2000,
  PUNTI_SEC_BONUS: 25,
  SPENT_STILL_MS: 1400,  // criceto fermo per questo tempo → esaurito
  MAX_FLIGHT_MS: 12000
};

class AHGame {
  constructor(canvas, renderer, cb) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.cb = cb; // { onHud, onEnd, onHint }
    this.slingX = 220;
    this.anchor = { x: 220, y: AH_WORLD.GROUND_Y - 126 };
    this.status = 'idle';
    this._raf = null;
    this._boundLoop = (t) => this._loop(t);
    this._bindInput();
    // Monitor FPS per la degradazione controllata della risoluzione
    this._fps = { frames: 0, since: performance.now(), lastCheck: performance.now() };
  }

  // ================= Caricamento livello =================

  loadLevel(levelData) {
    this._teardownWorld();

    this.level = levelData;
    this.engine = Matter.Engine.create({ enableSleeping: true });
    this.engine.gravity.y = 1;
    this.world = this.engine.world;

    this.blocks = [];
    this.cats = [];
    this.flying = [];
    this.platforms = [];
    this.queue = [...levelData.criceti];
    this.loaded = null;
    this.dragging = false;
    this.dragPos = null;
    this.score = 0;
    this.elapsedMs = 0;
    this.status = 'playing';
    this.stats = {
      blocksTotal: levelData.blocchi.length,
      blocksDestroyed: 0,
      catsTotal: levelData.gatti.length,
      hamstersTotal: levelData.criceti.length,
      hamstersUsed: 0
    };
    this._endScheduled = false;
    this._loadNextAt = performance.now() + 400;
    this._lastSounds = {};
    this._accumulator = 0;
    this._lastT = null;

    // Terreno (spesso, per evitare tunneling ad alte velocità)
    const ground = Matter.Bodies.rectangle(
      AH_WORLD.W / 2, AH_WORLD.GROUND_Y + 80, AH_WORLD.W + 1200, 160,
      { isStatic: true, friction: 0.9, restitution: 0.05, label: 'ground' }
    );
    Matter.Composite.add(this.world, ground);

    // Piattaforme statiche del livello
    for (const p of (levelData.piattaforme || [])) {
      const body = Matter.Bodies.rectangle(p.x, p.y, p.w, p.h,
        { isStatic: true, friction: 0.8, restitution: 0.05, label: 'platform' });
      body.ahRef = { kind: 'platform', w: p.w, h: p.h };
      this.platforms.push({ body, w: p.w, h: p.h });
      Matter.Composite.add(this.world, body);
    }

    // Blocchi distruttibili
    for (const bDef of levelData.blocchi) {
      const mat = AH_MATERIALI[bDef.materiale];
      const body = Matter.Bodies.rectangle(bDef.x, bDef.y, bDef.w, bDef.h, {
        density: mat.densita,
        friction: mat.attrito,
        restitution: mat.restituzione,
        angle: (bDef.angolo || 0) * Math.PI / 180,
        label: 'block'
      });
      const areaFactor = Math.min(2.2, Math.max(0.5, (bDef.w * bDef.h) / 6000));
      const block = {
        body,
        materiale: bDef.materiale,
        w: bDef.w, h: bDef.h,
        hpMax: mat.hp * areaFactor,
        hp: mat.hp * areaFactor
      };
      body.ahRef = { kind: 'block', obj: block };
      this.blocks.push(block);
      Matter.Composite.add(this.world, body);
    }

    // Gatti Ladri
    for (const cDef of levelData.gatti) {
      const boss = cDef.tipo === 'boss';
      const raggio = boss ? 42 : 26;
      const hp = cDef.hp || (boss ? AH_TUNING.CAT_BOSS_HP : AH_TUNING.CAT_HP);
      const body = Matter.Bodies.circle(cDef.x, cDef.y, raggio, {
        density: 0.0009, friction: 0.5, restitution: 0.1, label: 'cat'
      });
      const cat = { body, raggio, boss, hp, hpMax: hp };
      body.ahRef = { kind: 'cat', obj: cat };
      this.cats.push(cat);
      Matter.Composite.add(this.world, body);
    }

    Matter.Events.on(this.engine, 'collisionStart', (ev) => this._onCollisions(ev));

    this.renderer.particles.length = 0;
    this._hud();
    if (!this._raf) this._raf = requestAnimationFrame(this._boundLoop);
  }

  _teardownWorld() {
    if (this.engine) {
      Matter.Events.off(this.engine);
      Matter.World.clear(this.world, false);
      Matter.Engine.clear(this.engine);
      this.engine = null;
    }
  }

  destroy() {
    this.status = 'idle';
    this._teardownWorld();
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
  }

  pause() { if (this.status === 'playing') { this.status = 'paused'; } }
  resume() { if (this.status === 'paused') { this.status = 'playing'; this._lastT = null; } }

  // ================= Fionda =================

  pouchPos() {
    if (this.dragging && this.dragPos) return this.dragPos;
    return { x: this.anchor.x, y: this.anchor.y };
  }

  launchVelocity() {
    if (!this.dragging || !this.dragPos) return null;
    const dx = this.anchor.x - this.dragPos.x;
    const dy = this.anchor.y - this.dragPos.y;
    if (Math.hypot(dx, dy) < AH_TUNING.MIN_DRAG) return null;
    return { x: dx * AH_TUNING.POWER, y: dy * AH_TUNING.POWER };
  }

  _launch() {
    const v = this.launchVelocity();
    this.dragging = false;
    if (!v || !this.loaded) { this.dragPos = null; return; }

    const tipo = this.loaded.tipo;
    const def = AH_HAMSTERS[tipo];
    const p = this.pouchPos();
    const body = Matter.Bodies.circle(this.dragPos.x, this.dragPos.y, def.raggio, {
      density: def.densita,
      friction: def.attrito,
      restitution: def.restituzione,
      frictionAir: 0.002,
      label: 'hamster'
    });
    const ham = {
      body, tipo, mini: false,
      abilityUsed: !def.abilita,
      dmgMult: 1,
      piercingUntil: 0,
      firstContactAt: 0,
      launchedAt: performance.now(),
      stillMs: 0
    };
    body.ahRef = { kind: 'hamster', obj: ham };
    Matter.Composite.add(this.world, body);
    Matter.Body.setVelocity(body, v);
    this.flying.push(ham);

    this.loaded = null;
    this.dragPos = null;
    this.stats.hamstersUsed++;
    AH_AUDIO.lancio();
    this._hud();
    if (def.abilita) this.cb.onHint(def.hint + ' (click o SPAZIO)');
  }

  _loadNext() {
    if (!this.queue.length || this.loaded) return;
    const tipo = this.queue.shift();
    this.loaded = { tipo };
    const def = AH_HAMSTERS[tipo];
    this.cb.onHint(`${def.nome}: trascina dalla fionda per mirare. ${def.hint}`);
    AH_AUDIO.elastico();
    this._hud();
  }

  // ================= Abilità =================

  _activateAbility() {
    for (const ham of this.flying) {
      if (ham.abilityUsed) continue;
      const def = AH_HAMSTERS[ham.tipo];
      ham.abilityUsed = true;
      switch (def.abilita) {
        case 'piombata': {
          const v = ham.body.velocity;
          Matter.Body.setVelocity(ham.body, { x: v.x * 0.25, y: Math.max(v.y, 30) });
          ham.dmgMult = AH_TUNING.PIOMBATA_MULT;
          this.renderer.spawn(ham.body.position.x, ham.body.position.y,
            { n: 10, col: '#9a7b52', speed: 3, r: 4 });
          AH_AUDIO.scatto();
          break;
        }
        case 'boom':
          this._explode(ham);
          break;
        case 'scatto': {
          const v = ham.body.velocity;
          const sp = Math.hypot(v.x, v.y);
          const dir = sp > 0.5 ? { x: v.x / sp, y: v.y / sp } : { x: 1, y: 0 };
          Matter.Body.setVelocity(ham.body, { x: dir.x * 34, y: dir.y * 34 });
          ham.piercingUntil = performance.now() + 1300;
          ham.body.frictionAir = 0.001;
          AH_AUDIO.scatto();
          break;
        }
        case 'trio': {
          const pos = { ...ham.body.position };
          const v = ham.body.velocity;
          const sp = Math.max(6, Math.hypot(v.x, v.y));
          const baseAng = Math.atan2(v.y, v.x);
          this._removeFlying(ham, false);
          for (const off of [-0.22, 0, 0.22]) {
            const a = baseAng + off;
            const body = Matter.Bodies.circle(pos.x, pos.y + (off * 26), 13, {
              density: AH_HAMSTERS.divisore.densita,
              friction: 0.4, restitution: 0.3, frictionAir: 0.002,
              label: 'hamster'
            });
            const mini = {
              body, tipo: 'divisore', mini: true,
              abilityUsed: true,
              dmgMult: AH_TUNING.MINI_DMG_MULT,
              piercingUntil: 0, firstContactAt: 0,
              launchedAt: performance.now(), stillMs: 0
            };
            body.ahRef = { kind: 'hamster', obj: mini };
            Matter.Composite.add(this.world, body);
            Matter.Body.setVelocity(body, { x: Math.cos(a) * sp * 0.95, y: Math.sin(a) * sp * 0.95 });
            this.flying.push(mini);
          }
          this.renderer.spawn(pos.x, pos.y, { n: 12, col: '#8e6bbf', speed: 4, r: 4 });
          AH_AUDIO.divisione();
          break;
        }
      }
    }
  }

  _explode(ham) {
    const p = { ...ham.body.position };
    this._removeFlying(ham, false);
    const R = AH_TUNING.EXPLOSION_RADIUS;

    const targets = [
      ...this.blocks.map(b => ({ e: b, kind: 'block' })),
      ...this.cats.map(c => ({ e: c, kind: 'cat' }))
    ];
    for (const { e, kind } of targets) {
      const d = Math.hypot(e.body.position.x - p.x, e.body.position.y - p.y);
      if (d > R + 40) continue;
      const fall = Math.max(0.15, 1 - d / R);
      this._applyDamage(e, kind, AH_TUNING.EXPLOSION_DMG * fall, e.body.position);
    }
    // Spinta radiale su tutti i corpi dinamici vicini
    for (const body of Matter.Composite.allBodies(this.world)) {
      if (body.isStatic) continue;
      const dx = body.position.x - p.x, dy = body.position.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > R * 1.4) continue;
      const kick = 15 * Math.max(0, 1 - d / (R * 1.4));
      Matter.Sleeping.set(body, false); // setVelocity non sveglia i corpi in sleep
      Matter.Body.setVelocity(body, {
        x: body.velocity.x + (dx / d) * kick,
        y: body.velocity.y + (dy / d) * kick - 2
      });
    }
    this.renderer.spawn(p.x, p.y, { n: 26, col: ['#ff7a2e', '#ffd23e', '#c8402e', '#555'], speed: 9, r: 8, decay: 0.025 });
    AH_AUDIO.esplosione();
  }

  // Sveglia tutti i corpi dinamici addormentati. Necessario a ogni rimozione
  // di un corpo dal mondo: Matter.js non sveglia i corpi in sleep quando il
  // loro supporto sparisce (non è una collisione), e le strutture sopra
  // resterebbero congelate a mezz'aria.
  _wakeAll() {
    for (const b of Matter.Composite.allBodies(this.world)) {
      if (!b.isStatic && b.isSleeping) Matter.Sleeping.set(b, false);
    }
  }

  // ================= Collisioni e danni =================

  _onCollisions(ev) {
    if (this.status !== 'playing') return;
    for (const pair of ev.pairs) {
      const { bodyA, bodyB } = pair;
      const vA = bodyA.ahPrevVel || bodyA.velocity;
      const vB = bodyB.ahPrevVel || bodyB.velocity;
      const relSpeed = Math.hypot(vA.x - vB.x, vA.y - vB.y);
      if (relSpeed < AH_TUNING.MIN_IMPACT_SPEED) continue;

      this._impactBetween(bodyA, bodyB, relSpeed);
      this._impactBetween(bodyB, bodyA, relSpeed);

      // Suono d'impatto generico (con throttling)
      if (relSpeed > 5) this._sound('impatto', () => AH_AUDIO.impatto(Math.min(1, relSpeed / 20)));

      // La miccia dell'esplosivo si accende al primo contatto duro
      for (const b of [bodyA, bodyB]) {
        const ref = b.ahRef;
        if (ref && ref.kind === 'hamster' && ref.obj.tipo === 'esplosivo' &&
            !ref.obj.abilityUsed && !ref.obj.firstContactAt && relSpeed > 5) {
          ref.obj.firstContactAt = performance.now();
        }
      }
    }
  }

  // Danno che `other` infligge a `victim`
  _impactBetween(victim, other, relSpeed) {
    const ref = victim.ahRef;
    if (!ref || (ref.kind !== 'block' && ref.kind !== 'cat')) return;

    const otherMass = other.isStatic
      ? victim.mass * AH_TUNING.STATIC_FACTOR
      : other.mass;
    let dmg = otherMass * relSpeed * relSpeed * AH_TUNING.DMG_K;

    const oRef = other.ahRef;
    if (oRef && oRef.kind === 'hamster') {
      const ham = oRef.obj;
      dmg *= ham.dmgMult;
      if (ham.piercingUntil > performance.now() && ref.kind === 'block' &&
          (ref.obj.materiale === 'vetro' || ref.obj.materiale === 'legno')) {
        dmg *= AH_TUNING.SCATTO_MULT;
      }
    }

    if (dmg < 2) return;
    this._applyDamage(ref.obj, ref.kind, dmg, victim.position);
  }

  _applyDamage(entity, kind, dmg, pos) {
    if (entity.hp <= 0) return;
    entity.hp -= dmg;
    if (entity.hp > 0) {
      if (dmg > 8) {
        const col = kind === 'cat' ? '#7d7d8f' : AH_MATERIALI[entity.materiale].bordo;
        this.renderer.spawn(pos.x, pos.y, { n: 3, col, speed: 2.5, r: 3 });
      }
      return;
    }

    // Distrutto!
    if (kind === 'block') {
      const mat = AH_MATERIALI[entity.materiale];
      this._addScore(mat.punti, pos);
      this.stats.blocksDestroyed++;
      this.blocks = this.blocks.filter(b => b !== entity);
      Matter.Composite.remove(this.world, entity.body);
      this._wakeAll();
      this.renderer.spawn(pos.x, pos.y, { n: 12, col: [mat.colore, mat.bordo], speed: 5, r: 5 });
      this._sound(entity.materiale, () => AH_AUDIO[entity.materiale]());
    } else if (kind === 'cat') {
      this._addScore(entity.boss ? AH_TUNING.PUNTI_BOSS : AH_TUNING.PUNTI_GATTO, pos);
      this.cats = this.cats.filter(c => c !== entity);
      Matter.Composite.remove(this.world, entity.body);
      this._wakeAll();
      this.renderer.spawn(pos.x, pos.y, { n: 16, col: ['#7d7d8f', '#fff', '#ffd23e'], speed: 6, r: 6 });
      AH_AUDIO.gatto();
      if (!this.cats.length) this._scheduleWin();
    }
  }

  _addScore(points, pos) {
    this.score += points;
    if (pos) this.renderer.floatText(pos.x, pos.y - 20, `+${points}`);
    this._hud();
  }

  _sound(key, fn) {
    const now = performance.now();
    if (this._lastSounds[key] && now - this._lastSounds[key] < 90) return;
    this._lastSounds[key] = now;
    fn();
  }

  // ================= Ciclo di gioco =================

  _loop(t) {
    this._raf = requestAnimationFrame(this._boundLoop);

    if (this.status === 'playing') {
      if (this._lastT === null) this._lastT = t;
      let dt = Math.min(100, t - this._lastT);
      this._lastT = t;
      this.elapsedMs += dt;
      this._accumulator += dt;
      while (this._accumulator >= 16.666) {
        // Snapshot delle velocità PRE-tick: collisionStart di Matter scatta
        // dopo la risoluzione, quindi lì le velocità sono già post-rimbalzo.
        // Il danno da impatto va calcolato sulle velocità di avvicinamento.
        for (const b of Matter.Composite.allBodies(this.world)) {
          if (!b.isStatic) b.ahPrevVel = { x: b.velocity.x, y: b.velocity.y };
        }
        Matter.Engine.update(this.engine, 16.666);
        this._accumulator -= 16.666;
      }
      this._update(t);
    } else {
      this._lastT = t;
    }

    this.renderer.draw(this);
    this._fpsCheck(t);
  }

  _update(now) {
    // Miccia automatica dell'esplosivo
    for (const ham of [...this.flying]) {
      if (ham.tipo === 'esplosivo' && !ham.abilityUsed &&
          ham.firstContactAt && now - ham.firstContactAt > 1100) {
        ham.abilityUsed = true;
        this._explode(ham);
      }
    }

    // Criceti esauriti (fermi, fuori campo o troppo vecchi)
    for (const ham of [...this.flying]) {
      const b = ham.body;
      const out = b.position.x < -150 || b.position.x > AH_WORLD.W + 150 || b.position.y > AH_WORLD.H + 100;
      const speed = Math.hypot(b.velocity.x, b.velocity.y);
      if (speed < 0.4 && Math.abs(b.angularVelocity) < 0.05) {
        ham.stillMs += 16.7;
      } else {
        ham.stillMs = 0;
      }
      if (out || ham.stillMs > AH_TUNING.SPENT_STILL_MS || now - ham.launchedAt > AH_TUNING.MAX_FLIGHT_MS) {
        this._removeFlying(ham, !out);
      }
    }

    // Carica il prossimo criceto quando la scena è libera
    if (!this.flying.length && !this.loaded && this.queue.length && now > this._loadNextAt) {
      this._loadNext();
    }

    // Sconfitta: niente più criceti e restano gatti
    if (!this.flying.length && !this.loaded && !this.queue.length &&
        this.cats.length && !this._endScheduled) {
      this._endScheduled = true;
      setTimeout(() => {
        if (this.status === 'playing' && this.cats.length) this._lose();
        else this._endScheduled = false;
      }, 1600);
    }

    this._hudTime();
  }

  _removeFlying(ham, poof) {
    if (!this.flying.includes(ham)) return;
    this.flying = this.flying.filter(h => h !== ham);
    Matter.Composite.remove(this.world, ham.body);
    this._wakeAll();
    if (poof) {
      this.renderer.spawn(ham.body.position.x, ham.body.position.y,
        { n: 8, col: '#fff', speed: 2, r: 5, grav: -0.05, decay: 0.05 });
      AH_AUDIO.poof();
    }
    this._loadNextAt = performance.now() + 700;
    this._hud();
  }

  _scheduleWin() {
    if (this._endScheduled) return;
    this._endScheduled = true;
    setTimeout(() => { if (this.status === 'playing') this._win(); }, 1300);
  }

  _win() {
    this.status = 'won';
    const elapsedSec = this.elapsedMs / 1000;
    const saved = this.queue.length + (this.loaded ? 1 : 0);
    const bonusSalvati = saved * AH_TUNING.PUNTI_CRICETO_SALVO;
    const bonusTempo = Math.max(0, Math.round((this.level.parTime - elapsedSec) * AH_TUNING.PUNTI_SEC_BONUS));
    const totale = this.score + bonusSalvati + bonusTempo;

    const stelle = totale >= this.level.stelle.tre ? 3 : (totale >= this.level.stelle.due ? 2 : 1);

    const badges = [];
    if (elapsedSec < this.level.parTime / 2) badges.push({ icona: '⚡', nome: 'Fulmine', desc: 'Completato in metà del tempo' });
    if (saved >= 2) badges.push({ icona: '🛡', nome: 'Risparmiatore', desc: `${saved} criceti risparmiati` });
    if (this.stats.blocksTotal > 0 && this.stats.blocksDestroyed / this.stats.blocksTotal >= 0.8) {
      badges.push({ icona: '💥', nome: 'Demolitore', desc: '80%+ dei blocchi distrutti' });
    }

    AH_AUDIO.vittoria();
    this.cb.onEnd({
      vinto: true,
      livello: this.level.id,
      punteggioBase: this.score,
      bonusSalvati, salvati: saved,
      bonusTempo,
      totale,
      stelle,
      badges,
      tempoSec: Math.round(elapsedSec * 10) / 10
    });
  }

  _lose() {
    this.status = 'lost';
    AH_AUDIO.sconfitta();
    this.cb.onEnd({
      vinto: false,
      livello: this.level.id,
      totale: this.score,
      gattiRimasti: this.cats.length,
      tempoSec: Math.round(this.elapsedMs / 100) / 10
    });
  }

  // ================= HUD & FPS =================

  _hud() {
    this.cb.onHud({
      score: this.score,
      queue: this.queue,
      loaded: this.loaded,
      level: this.level ? this.level.id : 0,
      levelName: this.level ? this.level.nome : ''
    });
  }

  _hudTime() {
    this.cb.onHudTime(this.elapsedMs);
  }

  _fpsCheck(t) {
    const f = this._fps;
    f.frames++;
    if (t - f.since >= 2000) {
      const fps = f.frames / ((t - f.since) / 1000);
      f.frames = 0;
      f.since = t;
      if (fps < 45 && this.renderer.renderScale > 0.55) {
        this.renderer.renderScale = Math.max(0.5, this.renderer.renderScale - 0.25);
        this.renderer.resize();
      }
    }
  }

  // ================= Input =================

  _bindInput() {
    const c = this.canvas;

    const down = (x, y) => {
      if (this.status !== 'playing') return;
      const w = this.renderer.toWorld(x, y);
      AH_AUDIO.unlock();
      if (this.loaded &&
          Math.hypot(w.x - this.anchor.x, w.y - this.anchor.y) < 170) {
        this.dragging = true;
        this.dragPos = this._clampDrag(w);
      } else if (this.flying.some(h => !h.abilityUsed)) {
        this._activateAbility();
      }
    };
    const move = (x, y) => {
      if (!this.dragging) return;
      this.dragPos = this._clampDrag(this.renderer.toWorld(x, y));
    };
    const up = () => {
      if (this.dragging) this._launch();
    };

    c.addEventListener('mousedown', e => { e.preventDefault(); down(e.clientX, e.clientY); });
    window.addEventListener('mousemove', e => move(e.clientX, e.clientY));
    window.addEventListener('mouseup', up);
    c.addEventListener('touchstart', e => {
      e.preventDefault();
      const t = e.touches[0];
      down(t.clientX, t.clientY);
    }, { passive: false });
    window.addEventListener('touchmove', e => {
      if (this.dragging) e.preventDefault();
      const t = e.touches[0];
      if (t) move(t.clientX, t.clientY);
    }, { passive: false });
    window.addEventListener('touchend', up);

    window.addEventListener('keydown', e => {
      if (e.code === 'Space' && this.status === 'playing') {
        e.preventDefault();
        if (this.flying.some(h => !h.abilityUsed)) this._activateAbility();
      }
    });
  }

  _clampDrag(w) {
    let dx = w.x - this.anchor.x;
    let dy = w.y - this.anchor.y;
    const d = Math.hypot(dx, dy);
    if (d > AH_TUNING.MAX_DRAG) {
      dx = dx / d * AH_TUNING.MAX_DRAG;
      dy = dy / d * AH_TUNING.MAX_DRAG;
    }
    let x = this.anchor.x + dx;
    let y = Math.min(this.anchor.y + dy, AH_WORLD.GROUND_Y - 20);
    return { x, y };
  }

  // ================= Hook di debug/test =================

  // Lancia il criceto caricato con una velocità esplicita (usato dai test e2e)
  debugLaunch(vx, vy) {
    if (!this.loaded || this.status !== 'playing') return false;
    this.dragging = true;
    this.dragPos = {
      x: this.anchor.x - vx / AH_TUNING.POWER,
      y: this.anchor.y - vy / AH_TUNING.POWER
    };
    // bypassa il clamp del drag: costruisce la velocità direttamente
    const def = AH_HAMSTERS[this.loaded.tipo];
    const body = Matter.Bodies.circle(this.anchor.x, this.anchor.y, def.raggio, {
      density: def.densita, friction: def.attrito, restitution: def.restituzione,
      frictionAir: 0.002, label: 'hamster'
    });
    const ham = {
      body, tipo: this.loaded.tipo, mini: false,
      abilityUsed: !def.abilita, dmgMult: 1,
      piercingUntil: 0, firstContactAt: 0,
      launchedAt: performance.now(), stillMs: 0
    };
    body.ahRef = { kind: 'hamster', obj: ham };
    Matter.Composite.add(this.world, body);
    Matter.Body.setVelocity(body, { x: vx, y: vy });
    this.flying.push(ham);
    this.loaded = null;
    this.dragging = false;
    this.dragPos = null;
    this.stats.hamstersUsed++;
    this._hud();
    return true;
  }

  stateSnapshot() {
    return {
      status: this.status,
      score: this.score,
      cats: this.cats.length,
      blocks: this.blocks.length,
      queue: this.queue.length,
      loaded: this.loaded ? this.loaded.tipo : null,
      flying: this.flying.length,
      elapsedSec: Math.round(this.elapsedMs / 100) / 10
    };
  }
}
