'use strict';

// Definizione dei tipi di criceto: proprietà fisiche, aspetto e abilità.
// Le abilità si attivano con click/tap/Spazio mentre il criceto è in volo.
window.AH_HAMSTERS = {
  classico: {
    nome: 'Criceto Classico',
    emoji: '🐹',
    raggio: 22,
    densita: 0.0011,
    attrito: 0.4,
    restituzione: 0.35,
    colore: '#d9913e',
    colorePancia: '#f7c98b',
    abilita: null,
    hint: 'Equilibrato e affidabile. Nessuna abilità speciale.'
  },

  corazzato: {
    nome: 'Criceto Corazzato',
    emoji: '🪖',
    raggio: 24,
    densita: 0.0024,
    attrito: 0.6,
    restituzione: 0.15,
    colore: '#9a7b52',
    colorePancia: '#c9ab7e',
    abilita: 'piombata',
    hint: 'Pesantissimo! Click in volo: piomba giù con danno x2.5.'
  },

  esplosivo: {
    nome: 'Criceto Esplosivo',
    emoji: '💣',
    raggio: 21,
    densita: 0.0011,
    attrito: 0.4,
    restituzione: 0.3,
    colore: '#c8402e',
    colorePancia: '#f0a08e',
    abilita: 'boom',
    hint: 'Click in volo (o al contatto): BOOM ad area!'
  },

  veloce: {
    nome: 'Criceto Veloce',
    emoji: '⚡',
    raggio: 18,
    densita: 0.0010,
    attrito: 0.2,
    restituzione: 0.25,
    colore: '#4a9de0',
    colorePancia: '#bcdcf5',
    abilita: 'scatto',
    hint: 'Click in volo: scatto fulmineo che perfora vetro e legno.'
  },

  divisore: {
    nome: 'Criceto Divisore',
    emoji: '🎯',
    raggio: 22,
    densita: 0.0011,
    attrito: 0.4,
    restituzione: 0.3,
    colore: '#8e6bbf',
    colorePancia: '#d3c2ec',
    abilita: 'trio',
    hint: 'Click in volo: si divide in 3 mini-criceti a ventaglio.'
  }
};
