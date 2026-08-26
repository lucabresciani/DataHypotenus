# Decisioni architetturali

Formato: **decisione → motivazione → alternative considerate**. Servono a capire, fra un anno,
perché una cosa è fatta così, e a sapere quali strade erano già state valutate.

---

## D-01 · SQLite tramite il modulo `node:sqlite`

**Decisione.** Il database è SQLite, aperto con il modulo `node:sqlite` incluso in Node 24.

**Motivazione.** SQLite è un file: si copia, si ispeziona, si versiona, si legge senza questa
applicazione. Non c'è niente da installare o da tenere acceso. `node:sqlite` in più elimina
l'unica dipendenza nativa che il progetto avrebbe avuto: `npm install` non compila nulla,
quindi il trasferimento su un mini-PC Linux (magari ARM) non richiede una toolchain di
compilazione. Include già FTS5 per la ricerca e le API di backup.

**Alternative.**
- `better-sqlite3`: più maturo e diffuso, ma è un modulo nativo — serve un prebuild adatto
  all'architettura, o compilarlo. Resta il piano B: tutto l'accesso al database passa da
  `db/connection.ts`, sostituibile in poche decine di righe.
- PostgreSQL / MySQL: un servizio da installare, avviare e mantenere. Contro il requisito
  local-first, senza vantaggi a questa scala.
- File JSON: nessuna query, nessuna transazione, nessun indice. Non regge migliaia di record
  con filtri e ricerca.

**Conseguenza.** Serve Node ≥ 24. È scritto nei requisiti e verificato dal campo `engines`.

---

## D-02 · Nessuna compilazione del server

**Decisione.** Il server è TypeScript eseguito direttamente da Node (`node src/index.ts`).
TypeScript resta solo come strumento di controllo dei tipi (`tsc --noEmit`).

**Motivazione.** Node 24 rimuove le annotazioni di tipo a runtime. Il risultato: nessun passo
di build, nessuna cartella `dist` da tenere sincronizzata, nessun bundler, il codice sorgente
è ciò che gira. Per un progetto personale destinato a durare, meno passaggi significa meno
cose che si rompono.

**Alternative.**
- `tsc` con emissione in `dist/`: un passo di build in più, due copie del codice.
- `tsx`/`ts-node` a runtime: una dipendenza in più per fare ciò che Node fa da solo.

**Conseguenza.** Niente `enum` e niente parametri-proprietà nei costruttori (sintassi non
cancellabile). Il vincolo è imposto dal compilatore con `erasableSyntaxOnly`.

---

## D-03 · Il contenitore è una posizione, non un'entità separata

**Decisione.** Stanze, aree, mobili, ripiani e scatole vivono tutti nella tabella `locations`,
distinti dal campo `kind`.

**Motivazione.** Una scatola "Trasloco #01" ha esattamente le proprietà di una posizione: sta
dentro qualcosa (Garage → Scaffale 3), può contenere altre cose, contiene oggetti. Un'entità
separata avrebbe richiesto di duplicare la logica di albero, i percorsi, i conteggi e i
filtri, e avrebbe reso ambiguo il caso "scatola dentro scatola". Con una gerarchia sola,
"cosa c'è in questa scatola" e "in che scatola sta questo oggetto" sono la stessa query di
"cosa c'è in questa stanza".

**Alternative.**
- Tabella `containers` separata con FK verso `locations`: due alberi da tenere allineati,
  due insiemi di query, nessun vantaggio.
- Contenitore come attributo booleano sull'oggetto ("questo oggetto ne contiene altri"):
  confonde il contenitore con il suo contenuto e complica i conteggi di valore.

---

## D-04 · Categoria e posizione sono due gerarchie distinte

**Decisione.** Un oggetto ha una `category_id` (a cosa serve) e una `location_id` (dove sta),
indipendenti fra loro. Non esistono campi separati "stanza" e "sottocategoria".

**Motivazione.** Sono due domande diverse: le pentole sono in categoria "Cucina / Pentole"
anche quando stanno fisicamente in cantina dentro uno scatolone. Tenere "stanza" come campo
a parte dalla posizione avrebbe creato due fonti di verità destinate a divergere: la stanza si
ricava risalendo l'albero (la vista `location_paths` la calcola).

**Alternative.** Campi piatti `room` + `location` + `category` + `subcategory` come stringhe:
più semplici da scrivere all'inizio, ingestibili dopo cento oggetti (errori di battitura,
rinomine impossibili, nessun conteggio affidabile).

---

## D-05 · Allegati indirizzati dal contenuto, blob e collegamenti separati

**Decisione.** I file stanno sul filesystem in `attachments/<aa>/<bb>/<sha256>.<ext>`. La
tabella `files` descrive il blob, la tabella `attachments` lo collega a un'entità. Cancellare
un allegato non cancella il blob; i blob senza riferimenti si rimuovono con una garbage
collection esplicita.

**Motivazione.** Il requisito era esplicito: *la cancellazione di un record non deve causare
la perdita di file condivisi o referenziati altrove*. Separare il blob dal collegamento lo
garantisce per costruzione. In più: la stessa ricevuta caricata due volte occupa un file solo;
il nome sul disco non dipende da caratteri strani nel nome originale; l'integrità si verifica
ricalcolando l'hash.

**Alternative.**
- BLOB dentro SQLite: database enorme, backup lenti, nessuno streaming verso il browser.
- Una cartella per oggetto: duplicati inevitabili, rinomine fragili, e cancellare un oggetto
  cancellerebbe documenti condivisi.

---

## D-06 · La lista acquisti è un'entità separata dagli oggetti

**Decisione.** `shopping_items` è una tabella propria. Alla conversione ("l'ho comprato")
nasce un `item` e il legame resta registrato.

**Motivazione.** Un desiderio ha attributi che un oggetto non ha (priorità, prezzo *stimato*,
link al prodotto) e non deve entrare nei conteggi e nel valore dell'inventario. Tenendoli
separati, ogni query sull'inventario resta pulita e non deve ricordarsi di escludere i
desideri.

**Alternative.** Un semplice stato "da acquistare" sugli oggetti: mescola ciò che si possiede
con ciò che si vorrebbe in ogni elenco, ogni filtro e ogni statistica. Nota: lo stato esiste
comunque (`is_wishlist`), per chi preferisce quel flusso — le due strade convivono.

---

## D-07 · Il backup è una cartella, non un archivio

**Decisione.** Ogni backup è una directory con la copia del database (`VACUUM INTO`), la copia
degli allegati e un `manifest.json` con lo SHA-256 di ogni file.

**Motivazione.** Non serve nessuna libreria per creare zip. La verifica di integrità è
immediata (si ricalcolano gli hash). Soprattutto: un backup così è ispezionabile e
ripristinabile **a mano**, anche fra dieci anni e senza questa applicazione — che è il punto
di avere un backup. `VACUUM INTO` produce una copia consistente anche a server acceso.

**Alternative.**
- Archivio `.zip`/`.tar.gz`: serve una dipendenza, e un archivio corrotto si perde per intero.
- Copia del solo file `.db`: perderebbe gli allegati. È l'errore classico dei backup fatti a
  metà, ed è esplicitamente il caso da evitare.

---

## D-08 · Soft delete con cestino

**Decisione.** Eliminare un oggetto imposta `deleted_at`. La cancellazione definitiva è
un'azione separata, dal cestino.

**Motivazione.** In un archivio personale, un clic sbagliato non deve distruggere dati.
Il cestino costa una colonna e un filtro; la cronologia e gli allegati restano intatti nel
frattempo.

**Alternative.** `DELETE` immediato con conferma: la conferma si clicca per abitudine.

---

## D-09 · Gli stati sono dati, non codice

**Decisione.** Gli stati stanno in tabella, con due flag semantici (`counts_as_owned`,
`is_wishlist`) su cui ragiona l'applicazione.

**Motivazione.** Il requisito chiedeva stati configurabili. Se il codice controllasse
`status === 'Posseduto'`, rinominare l'etichetta romperebbe dashboard e statistiche in
silenzio. Con i flag, l'utente può rinominare e aggiungere stati liberamente; il significato
resta esplicito.

**Alternative.** Enum nel codice: semplice, ma non configurabile. Stringa libera sull'oggetto:
configurabile, ma senza alcun significato per il sistema.

---

## D-10 · Tailwind e shadcn/ui, con tutto in locale

**Decisione.** L'interfaccia usa Tailwind CSS v4 per lo stile e shadcn/ui (primitive Radix di
cui possediamo il codice) per i componenti. Il tema sta in un file solo, `web/src/styles/theme.css`,
in token OKLCH. Il carattere è Geist, servito dal pacchetto npm.

**Motivazione.** La prima versione usava CSS scritto a mano: leggibile, ma ogni componente
nuovo era una nuova regola e ogni comportamento (fuoco dentro un dialogo, frecce fra le
schede, elenco a discesa che non esce dal riquadro) era da riscrivere a mano, e qualche volta
sbagliato. Radix quei comportamenti li ha già risolti, e con shadcn il codice dei componenti
resta nel repository invece che dentro `node_modules`: si può leggere e modificare.

**Il vincolo offline resta intatto**: Tailwind gira in fase di build, non a runtime; i
componenti sono file `.tsx` del progetto; il carattere arriva da `@fontsource-variable/geist`
e finisce dentro `dist/assets` come `.woff2`. Nessuna richiesta di rete al primo avvio, nessun
CDN. Il costo è un bundle più grande (da 420 kB a circa 765 kB, 229 kB compressi) che su
`localhost` non si vede.

**Alternative.** Restare col CSS a mano: la versione che ne è uscita esiste ancora, sta nella
cartella `light/` del repository pubblico. Una libreria di componenti "chiavi in mano"
(Material, Carbon): l'aspetto da pannello amministrativo generico era esattamente ciò che il
requisito escludeva; con shadcn ogni componente è stato ritarato sul sistema (raggi, altezze,
peso del testo, e l'azione distruttiva che non è mai un bottone pieno).

---

## D-11 · I filtri dell'inventario vivono nell'indirizzo

**Decisione.** Ricerca, filtri e ordinamento sono parametri della query string.

**Motivazione.** Un elenco filtrato diventa un indirizzo: si può salvare fra i preferiti,
ricaricare la pagina senza perderlo, e la dashboard può linkare direttamente "gli oggetti
sotto scorta". Il pulsante Indietro funziona come ci si aspetta.

**Alternative.** Stato locale del componente: più semplice, ma ogni collegamento profondo
diventa impossibile.

---

## D-12 · Identificatore pubblico (`uid`) accanto alla chiave numerica

**Decisione.** Ogni oggetto ha un `uid` testuale ordinabile nel tempo, oltre all'`id`.

**Motivazione.** Serve per tre cose già previste: QR code sugli oggetti, import/export
idempotente (il merge avviene per `uid`, quindi reimportare lo stesso file non duplica nulla),
ed eventuale sincronizzazione futura fra dispositivi, dove gli id autoincrementali
collidono.

**Alternative.** Solo id numerico: collisioni certe in import e sync. UUIDv4: più lungo e non
ordinabile, quindi inutile come chiave temporale.

---

## Assunzioni prese su requisiti ambigui

| # | Ambiguità | Assunzione |
|---|---|---|
| A1 | "stanza" e "posizione" come campi distinti | Una sola gerarchia; la stanza è l'antenato di tipo `room`, calcolato |
| A2 | "categoria" e "sottocategoria" come campi distinti | Un solo `category_id` su albero multi-livello |
| A3 | Prezzo unitario o totale | **Unitario**; il totale è derivato (`prezzo × quantità`) |
| A4 | "Da acquistare": stato o lista separata? | Entrambi, con ruoli distinti (vedi D-06) |
| A5 | Multi-valuta | Valuta per record, **nessuna conversione di cambio**; gli aggregati assumono una valuta prevalente |
| A6 | Quantità frazionarie | `REAL` + unità di misura; visualizzate senza decimali quando intere |
| A7 | Garanzia in mesi o come data | Entrambi: la data di fine si calcola dalla durata, ma resta sovrascrivibile |
| A8 | Cosa succede eliminando una categoria con oggetti | Gli oggetti non si perdono: passano alla categoria superiore (o restano senza) |
