# 🐹 Angry Hamster

Gioco fisico-arcade 2D in stile *Angry Birds*: i **Gatti Ladri** hanno rubato le
scorte di semi e i criceti si vendicano… a colpi di fionda! Motore fisico
realistico (Matter.js), 10 livelli a difficoltà crescente, 5 criceti speciali,
classifica persistente. Interfaccia interamente in italiano.

## Avvio rapido

```bash
docker compose up
```

Poi apri **http://localhost:3000**. Nessun altro passo richiesto.

I dati persistenti (classifica e nome giocatore) vivono in `./data/db.json`,
montato come volume: sopravvivono a `docker compose down && docker compose up`.

### Avvio senza Docker (sviluppo)

```bash
npm install
npm start          # server su http://localhost:3000
npm test           # test automatici delle API (porta e dati temporanei)
```

## Come si gioca

- **Trascina** dalla fionda per mirare (una guida a puntini mostra la traiettoria) e rilascia per lanciare.
- **Click / tap / SPAZIO** mentre il criceto è in volo → attiva l'abilità speciale.
- Elimina **tutti i Gatti Ladri** del livello prima di esaurire i criceti.
- **ESC** o ⏸ per la pausa, ↺ per riavviare il livello.
- Dalle **Impostazioni** puoi attivare/disattivare separatamente **effetti sonori** e **musica di sottofondo** (chiptune arcade generata proceduralmente; parte al primo click, come richiesto dai browser).

### I criceti

| Criceto | Abilità (click in volo) |
|---|---|
| 🐹 **Classico** | Nessuna: equilibrato e affidabile |
| 🪖 **Corazzato** | *Piombata*: piomba giù in verticale con danno ×2.5 — demolisce pietra e tetti |
| 💣 **Esplosivo** | *Boom*: esplode ad area (o da solo ~1s dopo il primo impatto) |
| ⚡ **Veloce** | *Scatto*: accelera a 34 px/tick e perfora vetro e legno (danno ×3) |
| 🎯 **Divisore** | *Trio*: si divide in 3 mini-criceti a ventaglio (danno maggiorato ×2.2) |

### Materiali

| Materiale | Resistenza | Note |
|---|---|---|
| Vetro | fragile (34 hp base) | si frantuma facilmente, trasparente |
| Legno | media (95 hp base) | perforabile dal Veloce |
| Pietra | alta (380 hp base) | serve il Corazzato o l'Esplosivo |

Gli HP effettivi scalano con l'area del blocco (fattore 0.5–2.2 rispetto a un'area
di riferimento di 6000 px²). Il danno da impatto è proporzionale a
`massa × velocità_relativa² × 0.18` — la fisica decide tutto.

### Punteggio e premi

- Blocco distrutto: vetro **250**, legno **500**, pietra **750**
- Gatto eliminato: **3.000** — Gatto Boss: **8.000**
- Criceto risparmiato: **2.000** a fine livello
- Bonus tempo: **25 punti/secondo** sotto il *par time* del livello
- **Stelle**: 1⭐ vittoria, 2⭐/3⭐ al superamento delle soglie punteggio del livello (nel JSON del livello)
- **Badge**: ⚡ *Fulmine* (vittoria in metà del par time), 🛡 *Risparmiatore* (≥2 criceti risparmiati), 💥 *Demolitore* (≥80% dei blocchi distrutti), 🔥 *Inarrestabile* (3+ vittorie consecutive)

## Architettura

```
├── docker-compose.yml     # unico servizio, porta 3000, volume ./data
├── Dockerfile             # node:20-alpine, npm ci --omit=dev
├── server/
│   ├── index.js           # Express: API REST + frontend statico + matter.js da node_modules
│   ├── test-api.js        # test automatici API (con riavvio simulato)
│   └── db/store.js        # store JSON su disco con scritture atomiche (tmp+rename)
├── public/
│   ├── index.html         # tutte le schermate (menu, livelli, classifica, impostazioni, gioco)
│   ├── css/style.css      # stile flat/cartoon, responsive
│   ├── js/
│   │   ├── api.js         # client REST con degradazione morbida se il server non risponde
│   │   ├── audio.js       # effetti sonori + musica chiptune procedurali WebAudio (nessun asset esterno)
│   │   ├── hamsters.js    # definizione dei 5 tipi di criceto
│   │   ├── render.js      # renderer canvas procedurale + materiali + particelle
│   │   ├── game.js        # engine: mondo Matter.js, fionda, danni, abilità, punteggio
│   │   ├── ui.js          # schermate, HUD, progressione (stelle/badge in localStorage)
│   │   └── main.js        # bootstrap + hook di test AH_DEBUG
│   └── levels/            # 10 livelli in JSON (blocchi, gatti, criceti, soglie stelle)
└── data/                  # volume persistente (db.json creato al primo avvio)
```

### API REST

| Endpoint | Descrizione |
|---|---|
| `GET /api/leaderboard` | Top 10 punteggi (ordinati per punteggio decrescente) |
| `POST /api/leaderboard` | Salva `{nome, punteggio, livello, tempo}` (data aggiunta dal server) |
| `GET /api/player` | Nome giocatore corrente |
| `PUT /api/player` | Aggiorna il nome (sanitizzato, max 20 caratteri) |
| `GET /api/health` | Health check |

### Formato livello (JSON)

```json
{
  "id": 1, "nome": "…", "parTime": 60,
  "stelle": { "due": 6500, "tre": 9000 },
  "criceti": ["classico", "esplosivo", "…"],
  "blocchi": [{ "materiale": "vetro|legno|pietra", "x": 0, "y": 0, "w": 0, "h": 0, "angolo": 0 }],
  "gatti":   [{ "x": 0, "y": 0, "tipo": "boss (opz.)", "hp": "override (opz.)" }],
  "piattaforme": [{ "x": 0, "y": 0, "w": 0, "h": 0 }]
}
```

Il mondo logico è 1600×900 con il terreno a y=840; la fionda è a x=220.

## Requisiti non funzionali

- **60 fps target** con timestep fisico fisso (16.666 ms, accumulatore); se gli FPS
  medi scendono sotto 45, la risoluzione di rendering del canvas viene ridotta
  automaticamente a gradini (1 → 0.75 → 0.5) senza toccare la fisica.
- **Resize**: il canvas si adatta alla finestra (scala + letterbox) senza perdere
  lo stato della partita; il mondo logico resta 1600×900.
- **Stabilità fisica**: sleeping abilitato sui corpi Matter.js; il danno da
  impatto sotto una velocità relativa di 3 px/tick è ignorato (niente
  "vibrazioni" che demoliscono le strutture da ferme).
- **Nessuna CDN**: Matter.js è servito dal server (`/vendor/matter.min.js` da
  `node_modules`); il gioco funziona completamente offline.

## Test eseguiti

- `npm test`: 11 assert sulle API, inclusa la persistenza su riavvio del processo.
- Campagna end-to-end via browser automatizzato: **tutti i 10 livelli completati**
  con i criceti assegnati (verifica di risolvibilità), flussi di vittoria,
  sconfitta, stelle, badge, classifica, cambio nome, pausa, resize.
- Ciclo Docker completo: build → up → gioco → punteggio → `down` → `up` →
  dati ancora presenti; classifica vuota al primo avvio con messaggio dedicato.

Le assunzioni e le decisioni prese in autonomia sono documentate in
[DECISIONS.md](DECISIONS.md).
