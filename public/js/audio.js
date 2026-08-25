'use strict';

// Effetti sonori e musica di sottofondo procedurali via WebAudio:
// nessun file audio esterno. L'AudioContext viene creato/sbloccato al
// primo gesto utente (vincolo dei browser).
window.AH_AUDIO = (() => {
  let ctx = null;
  let enabled = localStorage.getItem('ah_sound') !== '0';

  function ensureCtx() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        enabled = false;
        musicEnabled = false;
      }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type = 'sine', vol = 0.2, when = 0, slideTo = null) {
    if (!enabled || !ensureCtx()) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol = 0.25, freq = 800, q = 1) {
    if (!enabled || !ensureCtx()) return;
    const t0 = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start(t0);
  }

  // ===== Musica di sottofondo (chiptune procedurale) =====
  // Loop a 138 BPM in Do maggiore, giro I–vi–IV–V: lead a onda quadra,
  // basso a triangolo, charleston di rumore e cassa. Schedulazione con
  // lookahead sul clock dell'AudioContext (pattern standard WebAudio).

  let musicEnabled = localStorage.getItem('ah_music') !== '0';
  let musicTimer = null;
  let musicStep = 0;
  let musicNext = 0;
  let hatBuffer = null;

  const MUSIC_STEP_SEC = 60 / 138 / 2; // ottavi
  // Melodia su 4 battute da 8 ottavi (0 = pausa), note MIDI
  const MELODIA = [
    72, 0, 76, 0, 79, 0, 76, 0,
    81, 0, 79, 0, 76, 74, 72, 0,
    69, 0, 72, 0, 77, 0, 76, 0,
    74, 76, 77, 79, 76, 74, 71, 0
  ];
  const BASSO = [48, 45, 41, 43]; // Do2, La1, Fa1, Sol1 — una per battuta

  const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);

  function notaAt(freq, t, dur, type, vol) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function hatAt(t) {
    if (!hatBuffer) {
      const len = Math.floor(ctx.sampleRate * 0.05);
      hatBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = hatBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = hatBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.02, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start(t);
  }

  function kickAt(t) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
    g.gain.setValueAtTime(0.09, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  function musicTick() {
    if (!ctx) return;
    while (musicNext < ctx.currentTime + 0.2) {
      const s = musicStep % MELODIA.length;
      const t = musicNext;
      if (MELODIA[s]) notaAt(midiHz(MELODIA[s]), t, MUSIC_STEP_SEC * 0.9, 'square', 0.035);
      if (s % 2 === 0) notaAt(midiHz(BASSO[Math.floor(s / 8)]), t, MUSIC_STEP_SEC * 0.85, 'triangle', 0.06);
      if (s % 4 === 2) hatAt(t);
      if (s % 8 === 0) kickAt(t);
      musicStep++;
      musicNext += MUSIC_STEP_SEC;
    }
  }

  function startMusic() {
    if (!musicEnabled || musicTimer || !ensureCtx()) return;
    musicStep = 0;
    musicNext = ctx.currentTime + 0.05;
    musicTimer = setInterval(musicTick, 60);
    musicTick();
  }

  function stopMusic() {
    if (musicTimer) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  return {
    get enabled() { return enabled; },
    setEnabled(v) {
      enabled = !!v;
      localStorage.setItem('ah_sound', v ? '1' : '0');
    },

    get musicEnabled() { return musicEnabled; },
    get musicPlaying() { return !!musicTimer; },
    setMusicEnabled(v) {
      musicEnabled = !!v;
      localStorage.setItem('ah_music', v ? '1' : '0');
      if (v) startMusic();
      else stopMusic();
    },

    // Da chiamare su un gesto utente reale: sblocca l'AudioContext e,
    // se abilitata, fa partire la musica di sottofondo.
    unlock() {
      if (enabled || musicEnabled) ensureCtx();
      if (musicEnabled) startMusic();
    },

    lancio()     { noise(0.25, 0.18, 1600, 0.7); tone(300, 0.2, 'sine', 0.12, 0, 700); },
    elastico()   { tone(140, 0.08, 'square', 0.05); },
    impatto(f)   { noise(0.12, Math.min(0.3, 0.1 + f * 0.15), 300, 1.2); },
    vetro()      { noise(0.2, 0.22, 3200, 0.8); tone(2400, 0.15, 'triangle', 0.08, 0, 1200); },
    legno()      { noise(0.15, 0.2, 700, 1.5); },
    pietra()     { noise(0.2, 0.24, 220, 1.6); },
    esplosione() { noise(0.5, 0.4, 120, 0.6); tone(90, 0.4, 'sine', 0.3, 0, 40); },
    scatto()     { tone(500, 0.25, 'sawtooth', 0.1, 0, 1600); },
    divisione()  { tone(600, 0.1, 'square', 0.1); tone(800, 0.1, 'square', 0.1, 0.07); tone(1000, 0.1, 'square', 0.1, 0.14); },
    gatto()      { tone(900, 0.25, 'sawtooth', 0.14, 0, 250); },
    poof()       { noise(0.15, 0.1, 1000, 0.8); },
    vittoria()   { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, 'triangle', 0.18, i * 0.14)); },
    sconfitta()  { tone(330, 0.3, 'triangle', 0.16); tone(247, 0.45, 'triangle', 0.16, 0.25); },
    stella()     { tone(1319, 0.2, 'triangle', 0.15); }
  };
})();
