# Teleprompter per iPad

App iOS/iPadOS in SwiftUI (iOS 17 o successivo), preparata come **App playground** (`Teleprompter.swiftpm`).
Si apre direttamente sull'iPad con **Swift Playgrounds**, l'app gratuita di Apple, quindi il Mac non serve.

## Come installarla
Segui [ISTRUZIONI_MAC.md](ISTRUZIONI_MAC.md): sul Mac Xcode installa l'app sull'iPad come app normale, senza bisogno di Swift Playgrounds.

## Funzioni

| Funzione | Dove |
|---|---|
| Ribalta il testo in orizzontale e in verticale | pulsanti ↔ ↕ nella barra, Impostazioni › Specchio, tasti H / V |
| Dimensione del carattere, tipo di carattere, grassetto, interlinea, colore | Impostazioni › Testo |
| Allineamento a sinistra, al centro o a destra | Impostazioni › Testo |
| Margini sinistro, destro, alto e basso, ognuno separato | Impostazioni › Margini |
| Velocità di scorrimento | pulsanti 🐢 🐇, frecce ↑ ↓, Impostazioni › Scorrimento |
| Modalità Durata: imposti minuti e secondi e la velocità si calcola da sola | Impostazioni › Scorrimento oppure “Durata” nell'editor. La durata vale per ogni singolo script. |
| Script illimitati: nuovi, incollati o importati da file (.txt, .md, .rtf, .rtfd, .html, .pdf, anche più file insieme) | pulsante + nella libreria |
| Linea guida da mostrare o nascondere, in tre stili (frecce, linea, fascia), con colore, posizione e opacità regolabili | Impostazioni › Linea guida. In pausa si trascina col dito. |
| Conto alla rovescia da 0 a 10 s quando premi play, con l'opzione di ripeterlo anche alla ripresa | Impostazioni › Scorrimento |
| Timer da mostrare o nascondere, con dimensione, opacità e posizione regolabili; mostra il tempo trascorso, il rimanente o entrambi | Impostazioni › Timer. In pausa si trascina col dito. |
| Fondo sempre nero, nessuna fotocamera | — |

Ho aggiunto anche:
- **telecomandi e tastiere Bluetooth** (page turner, pedali): Spazio/Invio = play/pausa, ↑↓ = velocità, ←→ e Pag↑/Pag↓ = indietro e avanti, R = ricomincia, H/V = ribalta, Esc = chiudi.
- **il trascinamento col dito** per tornare indietro o andare avanti nel testo, e una **barra di avanzamento** per saltare a un punto qualsiasi.
- **la correzione della velocità durante la lettura**, anche in modalità Durata (×0,25…×3).
- **lo schermo che non si spegne** mentre il prompter è aperto, con la barra di stato e l'indicatore Home nascosti.
- **il pannello delle impostazioni sopra il prompter**: vedi subito l'effetto di ogni regolazione e puoi spostare il pannello a sinistra o a destra.
- **la stima della durata** dalle parole (circa 150 al minuto), la ricerca negli script, la duplicazione e l'avvio rapido con uno swipe.
- **il timer che diventa rosso** negli ultimi 10 secondi quando mostra il tempo rimanente.

## Funzioni extra
- **iPhone come telecomando**: installa l'app anche sull'iPhone e tocca **Telecomando**. Il PIN si trova sull'iPad, nel pulsante iPhone della barra dei comandi. Dall'iPhone hai play/pausa, velocità, avanti/indietro, inizio, ribaltamenti, e vedi avanzamento e tempi. Funziona via Wi-Fi o Bluetooth, anche senza internet.
- **Uscita su monitor esterno**: collega un monitor via USB-C o HDMI. Il monitor mostra solo il testo, ribaltato, mentre l'iPad resta il pannello di controllo con il testo dritto (si può cambiare). La dimensione del testo sul monitor è regolabile a parte. Stage Manager va disattivato.
- **Scorrimento che segue la voce**: in Impostazioni › Scorrimento scegli **Voce** e la lingua. Premi play e parla: il testo avanza con te. Se salti o improvvisi, il testo aspetta e si riaggancia.

## Idee per il futuro
- Segnaposti e capitoli per saltare da una sezione all'altra.
- Testo formattato e note di regia che non si leggono.
- Profili di impostazioni salvati, ad esempio “Rig 12,9 pollici” o “Reel verticale”.
- Importazione .docx e sincronizzazione con iCloud.
- Modifica del testo dall'iPhone mentre scorre.

## Nota

Il codice è stato scritto su Windows, dove non si può compilare per iOS: va compilato e provato sul Mac (vedi CLAUDE.md).
