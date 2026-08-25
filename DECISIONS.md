# DECISIONS.md — Registro delle decisioni autonome

Log delle scelte tecniche e di design prese in autonomia durante lo sviluppo,
come richiesto dal brief.

## Stack e architettura

1. **Persistenza: JSON su disco invece di SQLite.** Il brief lasciava la scelta.
   Un unico `data/db.json` con scritture atomiche (file temporaneo + `rename`)
   è più semplice, senza dipendenze native da compilare nell'immagine Docker
   (better-sqlite3 richiede toolchain C++), e più che adeguato per top-10 +
   nome giocatore. Il file è limitato alle 100 migliori entry per non crescere
   all'infinito.
2. **Matter.js servito da `node_modules`** tramite la route `/vendor/matter.min.js`:
   nessuna CDN, il container è autosufficiente e funziona offline.
3. **Vanilla JS senza bundler**: 7 file script ordinari caricati in sequenza.
   Per questa dimensione di progetto un build step sarebbe over-engineering.
4. **`Cache-Control: no-cache` sui file statici** (con ETag): il browser rivalida
   ogni file e un aggiornamento dell'app non lascia mai i client con script
   vecchi in cache. Scoperto necessario durante i test end-to-end (Chrome usava
   la freshness euristica e serviva un `game.js` obsoleto).
5. **Stelle, badge e progressione in `localStorage`** (lato client). Il brief
   chiede persistenza server solo per classifica e nome giocatore; la
   progressione personale è per-browser. I livelli si sbloccano in sequenza
   (il livello N si apre completando l'N−1).

## Gameplay e fisica

6. **Nemici: i "Gatti Ladri"** (con maschera da ladro; il boss ha la corona).
   Antagonista naturale del criceto, coerente con il tema.
7. **Mondo logico fisso 1600×900** (terreno a y=840, fionda a x=220), scalato
   con letterbox sul canvas reale. I livelli sono definiti in coordinate
   stabili e il resize non altera la fisica.
8. **Modello di danno: energia cinetica.** `danno = massa_altro ×
   velocità_relativa² × 0.18`, ignorando urti sotto 3 px/tick (stabilità).
   Contro corpi statici (terreno) si usa la massa propria ridotta (fattore 0.4).
   **Nota tecnica importante**: `collisionStart` di Matter.js scatta *dopo* la
   risoluzione dell'urto, quindi le velocità lette lì sono già post-rimbalzo;
   il gioco salva uno snapshot delle velocità prima di ogni tick e calcola il
   danno sulle velocità di avvicinamento reali. Senza questo accorgimento il
   danno risultava sistematicamente sottostimato (bug trovato coi test e2e).
9. **HP dei materiali** (base, scalati con l'area del blocco ×0.5–2.2):
   vetro 34, legno 95, pietra 380. Gatto 60, Gatto Boss 350 (500 il Re Gatto
   del livello 10). Calibrati perché: un colpo diretto pulito di un criceto
   classico (~16-20 px/tick) elimini un gatto; il legno richieda 1-2 colpi; la
   pietra resista al classico ma ceda al Corazzato (~530 danni a piena
   velocità) o all'Esplosivo.
10. **Abilità** (click/tap/SPAZIO in volo, una volta sola):
    - *Piombata* (Corazzato): velocità verticale 30 verso il basso, danno ×2.5.
    - *Boom* (Esplosivo): raggio 200, danno 320 con falloff lineare + spinta
      radiale sui corpi. Esplode anche da solo ~1.1s dopo il primo contatto
      duro (miccia): è la modalità d'uso "naturale" per demolire dall'alto.
      (Raggio/danno alzati da 175/270 dopo i test: un criceto-bomba che esplode
      su un tetto deve poter eliminare il gatto sotto il tetto.)
    - *Scatto* (Veloce): velocità 34 nella direzione corrente, ×3 su vetro e
      legno per 1.3s (perforazione).
    - *Trio* (Divisore): 3 mini-criceti (raggio 13) a ventaglio ±12.6°, danno
      ×2.2 per compensare la massa ridotta.
11. **Fionda**: drag max 130 px → velocità max ~28 px/tick; guida a puntini
    che riproduce esattamente la balistica di Matter (gravità 0.278 px/tick²).
    Attrito dell'aria dei criceti 0.002 (ridotto da 0.004 dopo i test: i tiri
    a parabola perdevano troppa gittata).
12. **Fine criceto**: un criceto lanciato "svanisce" quando è fermo da 1.4s,
    esce dal mondo o dopo 12s di volo; poi viene caricato il successivo.
    La sconfitta scatta solo a scena calma (1.6s dopo l'ultimo criceto).
13. **Punteggi**: vetro 250 / legno 500 / pietra 750; gatto 3.000, boss 8.000;
    criceto risparmiato 2.000; bonus tempo 25/s sotto il par time. Le soglie
    2⭐/3⭐ sono per livello nei JSON, tarate sulle run di test.
14. **Premi speciali** (documentati anche nel README): Fulmine, Risparmiatore,
    Demolitore, Inarrestabile (streak ≥3, azzerata dalla sconfitta).

## Livelli e risolvibilità

15. **Verifica di risolvibilità automatizzata**: ogni livello è stato completato
    end-to-end in un browser automatizzato usando un "giocatore" che calcola le
    traiettorie con la stessa balistica del gioco (hook `AH_DEBUG.mira`) e
    attiva le abilità al momento opportuno. Esiti: L1 3 lanci/3, L2 3/4,
    L3 4/4, L4 4/4, L5 5/5, L6 3/3, L7 5/5, L8 3/4, L9 6/6, L10 4/6 con
    3 stelle. Un giocatore umano con l'anteprima di traiettoria ha margini
    maggiori del bot.
16. **Ritocchi al bilanciamento emersi dai test**: +1 criceto al livello 9;
    boss 450→350 hp (Re Gatto 600→500); esplosione potenziata (vedi §10);
    pietra 270→380 hp (con il fix del danno §8 il classico la sfondava).
17. **Difficoltà crescente**: L1-L2 tutorial (vetro/legno, bersagli esposti),
    L3-L6 introducono un criceto speciale ciascuno con strutture dedicate,
    L7-L10 fortezze di pietra, munizioni contate, boss e infine il castello
    del Re Gatto con quattro zone difese.

### Correzioni post-collaudo

25. **Strutture sospese a mezz'aria (bug segnalato dall'utente)**: con
    `enableSleeping: true`, Matter.js non sveglia i corpi addormentati quando
    il corpo che li sosteneva viene rimosso dal mondo (non è una collisione),
    quindi il piano superiore di una torre restava congelato in aria dopo la
    distruzione delle colonne. Fix: `_wakeAll()` sveglia tutti i corpi dinamici
    a ogni rimozione (blocco, gatto o criceto) e prima della spinta radiale
    delle esplosioni (`Body.setVelocity` non sveglia i corpi in sleep).
    Riprodotto e verificato con test e2e: ora le torri crollano e i gatti
    precipitano col crollo (subendo danno da caduta).
26. **Travi sovrapposte nel livello 8**: le due campate del tetto si
    sovrapponevano di 40 px alla stessa quota sulla colonna centrale (spawn
    compenetrato, deriva di ~23 px all'assestamento). Geometria corretta:
    campate separate (216 px + 196 px) con colonna centrale allargata a 40 px;
    deriva post-fix ≤ 1.1 px. Gli altri nove livelli sono stati ricontrollati
    quota per quota: nessuna altra sovrapposizione.
27. **Piattaforme invisibili nel livello 6 (bug segnalato dall'utente)**: le
    piattaforme statiche venivano aggiunte al mondo fisico ma mai registrate
    in una lista percorsa dal renderer, quindi gatti e barriere sembravano
    sospesi nel vuoto (la fisica era corretta: poggiavano su corpi invisibili).
    Fix: le piattaforme sono ora tracciate in `game.platforms` e disegnate
    come isole di terra con manto erboso, coerenti col tema e chiaramente
    riconoscibili come terreno indistruttibile. Il livello 6 è l'unico a
    usarle (verificato su tutti i JSON).
28. **Musica di sottofondo (richiesta dall'utente)**: loop chiptune procedurale
    WebAudio (nessun file audio): lead a onda quadra, basso a triangolo,
    charleston e cassa su un giro I–vi–IV–V in Do maggiore a 138 BPM,
    schedulato con lookahead sul clock dell'AudioContext. Parte al primo
    gesto utente (vincolo autoplay dei browser) e ha un interruttore dedicato
    nelle impostazioni, persistito in localStorage (`ah_music`) esattamente
    come gli effetti sonori (`ah_sound`), dai quali è indipendente.

## UI/UX

18. **Schermate come overlay DOM** sopra il canvas (menu, selezione livello,
    classifica, impostazioni, pausa, fine livello): testo nitido, layout
    responsive via CSS, canvas dedicato solo al gioco.
19. **Audio procedurale WebAudio** (oscillatori + rumore filtrato): lancio,
    impatti per materiale, esplosione, miagolio, jingle vittoria/sconfitta.
    Nessun file audio; disattivabile dalle impostazioni (persistito in
    localStorage). L'AudioContext si sblocca al primo gesto utente.
20. **Grafica interamente procedurale** su canvas (nessun asset esterno):
    criceti con dettagli per tipo (elmetto, miccia accesa, occhialoni, tre
    puntini), gatti con maschera da ladro, crepe progressive sui blocchi
    danneggiati, particelle, punteggi fluttuanti, nuvole in deriva.
21. **Nome giocatore**: default "Giocatore", sanitizzato lato server
    (rimozione `<>` e caratteri di controllo, max 20). I duplicati in
    classifica sono ammessi (da brief). Se il server non risponde, il gioco
    resta giocabile e le impostazioni lo segnalano con gentilezza.

## Testing

22. **Hook di test `window.AH_DEBUG`** esposto dal frontend (lancio
    programmatico con velocità esplicita, snapshot dello stato, calcolo
    balistico). Innocuo in produzione e prezioso per i test end-to-end;
    lasciato attivo deliberatamente.
23. **`npm test`**: avvia il server su porta/directory temporanee, esercita
    tutte le API (validazioni comprese) e simula un riavvio per verificare la
    persistenza. 11 assert, tutti verdi.
24. **Docker verificato davvero**: build, up, gioco dal container, punteggio
    salvato, `down`/`up`, dati presenti; classifica vuota al primo avvio con
    messaggio dedicato. La cartella `data/` viene consegnata vuota.
