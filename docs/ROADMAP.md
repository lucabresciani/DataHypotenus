# Stato e sviluppi successivi

## Cosa c'è oggi (MVP completo)

### P0 · Fondamenta
- [x] Configurazione centralizzata (env + `.env`), percorsi in un punto solo
- [x] SQLite con WAL, chiavi esterne attive, statement preparati
- [x] Migrazioni versionate con checksum di controllo
- [x] Filesystem organizzato (database, allegati, backup, log, temporanei)
- [x] Logging su console e file con rotazione
- [x] Errori di dominio tradotti in messaggi comprensibili

### P1 · Inventario
- [x] Oggetti: creazione, modifica, duplicazione, cestino, ripristino, eliminazione definitiva
- [x] Categorie ad albero (creazione, rinomina, spostamento, eliminazione con risalita)
- [x] Posizioni ad albero con tipi (stanza, mobile, ripiano, contenitore…)
- [x] Quantità con unità di misura, consumabili con soglia minima
- [x] Stati configurabili con flag semantici
- [x] Tag N:N creati al volo
- [x] Negozi come entità riutilizzabile

### P2 · Uso quotidiano
- [x] Ricerca full-text (FTS5) estesa a categorie, posizioni, tag, negozi
- [x] Palette globale Ctrl+K, scorciatoie `/` e `N`
- [x] Filtri e ordinamenti nell'indirizzo, quindi condivisibili
- [x] Dashboard azionabile (da comprare, scorte, garanzie, scadenze, recenti, spesa)
- [x] Azioni rapide di riga e azioni multiple su selezione
- [x] Lista acquisti con priorità e conversione in oggetto
- [x] Riordino automatico dei consumabili sotto soglia

### P3 · Documentazione degli oggetti
- [x] Foto e documenti con trascinamento
- [x] Archivio indirizzato dal contenuto, con deduplicazione
- [x] Tipi di allegato (foto, ricevuta, fattura, manuale, garanzia)
- [x] Garanzie con calcolo automatico della scadenza
- [x] Scadenze generiche con avvisi

### P4 · Sicurezza dei dati
- [x] Backup completi (database + allegati + manifest)
- [x] Verifica di integrità con SHA-256
- [x] Ripristino con backup di sicurezza automatico e modalità simulazione
- [x] Rotazione dei backup
- [x] Export CSV e JSON, import con merge per `uid`
- [x] Garbage collection e verifica dell'archivio file

### P5 · Analisi
- [x] Valore dell'inventario, spesa per categoria, stanza, negozio, stato
- [x] Serie mensile della spesa
- [x] Oggetti di maggior valore

### Qualità
- [x] 98 test automatici sulle parti critiche
- [x] Controllo dei tipi su server e interfaccia
- [x] Interfaccia responsive, tema chiaro/scuro, movimento ridotto rispettato
- [x] Documentazione completa

## P6 · Sviluppi successivi

In ordine di utilità pratica.

### 1. Manutenzioni (schema già pronto)
La tabella `maintenance_records` esiste già: manca l'interfaccia. Serve una sezione nella
scheda dell'oggetto (intervento, data, costo, fornitore, prossima scadenza) e l'ingresso dei
"prossimi interventi" nella pagina Scadenze.
*Costo stimato: un modulo service + una scheda nell'interfaccia.*

### 2. Etichette QR per gli scatoloni
I dati ci sono già (`items.uid`, `locations.code`), e l'endpoint `/items/uid/:uid` risolve un
codice in una scheda. Manca una pagina di stampa (griglia di etichette con QR) e, per lo
scanner, l'accesso alla fotocamera — che richiede HTTPS o `localhost`.
*Nota: lo scanner ha senso soprattutto da telefono, quindi dopo il passaggio al server Linux.*

### 3. Valore attuale e ammortamento
`current_value` esiste ed è mostrato. Si potrebbe stimarlo automaticamente da
`expected_lifespan_months` per avere il valore residuo a fini assicurativi.

### 4. Prestiti
Lo stato "Prestato" c'è; manca *a chi* e *da quando*. Sono due colonne e un riquadro in
dashboard ("cose che non sono in casa").

### 5. Cronologia più visibile
Gli eventi vengono già registrati per ogni modifica. Manca una vista globale "cos'è cambiato
questa settimana" e i filtri per tipo di evento.

### 6. Notifiche
Oggi gli avvisi si vedono aprendo l'applicazione. Con il server sempre acceso avrebbe senso un
riepilogo settimanale (garanzie in scadenza, scorte finite) via email locale o Telegram.
*Attenzione: è la prima funzione che richiede un servizio esterno. Deve restare opzionale.*

### 7. Accesso dalla LAN e autenticazione
`DH_HOST=0.0.0.0` basta per la rete locale; per una password, la strada consigliata è un
reverse proxy (vedi [DEPLOY-LINUX.md](DEPLOY-LINUX.md)). Un'autenticazione applicativa serve
solo se l'accesso diventa multi-utente.

### 8. Sincronizzazione fra dispositivi
La più impegnativa, e l'unica che tocca le fondamenta. Gli elementi già pronti: `uid` stabili
su ogni oggetto, cronologia degli eventi, export/import idempotente. Prima di affrontarla vale
la pena chiedersi se non basti un unico server in casa raggiungibile da tutti i dispositivi —
che è la stessa cosa, con un decimo della complessità.

## Cosa resta deliberatamente fuori

Per non trasformare un archivio di casa in un gestionale:

- contabilità in partita doppia, fatturazione, ammortamenti fiscali;
- gestione di fornitori, ordini, magazzino multi-sede;
- integrazioni obbligatorie con servizi esterni;
- micro-servizi, code, orchestratori.
