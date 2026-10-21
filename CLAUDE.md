# Teleprompter per iPad — contesto per Claude

## DIREZIONE ATTUALE (dal 19/10/2026): WEB APP (PWA) in `web/`
L'utente ha scelto una web app per Safari su iPad, installabile dalla schermata Home, offline, senza account Apple.
La versione Swift qui sotto (`Teleprompter.swiftpm`) resta solo come riferimento.

- JavaScript puro a moduli ES, nessuna build e nessuna dipendenza. File statici in `web/`.
- `web/js/`: `app.js` (viste), `library.js`, `editor.js`, `prompter.js` (motore rAF + comandi + pannello),
  `panel.js` (controlli da schema), `settings.js` (localStorage `tp.settings.v1`), `db.js` (IndexedDB `teleprompter`/`scripts`),
  `importers.js` (txt/md/rtf/html), `util.js`, `version.js`.
- `web/sw.js`: cache di tutta l'app. **A ogni pubblicazione** `node tools/bump-version.mjs X.Y.Z`
  e aggiungere a `ASSETS` ogni file nuovo.
- **Online: https://claudiadogs.github.io/teleprompter/** — repo `ClaudiaDogs/teleprompter` (pubblico), ramo `main`.
  Ogni push pubblica `web/` tramite `.github/workflows/pages.yml`. Commit firmati con l'email noreply di GitHub
  (configurata nel repo). Il primo accesso è stato fatto da Git Credential Manager nel pannello Terminale:
  se un push dalla shell non interattiva chiede le credenziali, lanciarlo nel Terminale dell'app.
- Prova in locale: `node tools/serve.mjs` → http://localhost:8080 (configurazione `teleprompter` in `.claude/launch.json`).
- `prompter.status()` / `onStatus()` / `command(name)` sono gli agganci previsti per telecomando e secondo schermo.
- `web/vendor/pdfjs/`: pdfjs-dist 4.10.38 build *legacy* (compatibile con Safari meno recenti), caricato solo all'import di un PDF.
  `importers.js` ricuce righe e sillabazione in paragrafi con misure prese su tutto il documento.
  `backup.js`: file .json con script + impostazioni; il ripristino unisce (tiene la versione più recente, non cancella).
  Su iPad l'esportazione passa da `navigator.share` (Salva su File / AirDrop).
- Service worker: cache-first online, ma su localhost/127.0.0.1 prende prima la rete (le modifiche si vedono subito).
- Su telefono: «Incolla» apre un riquadro dove si tiene premuto e si sceglie Incolla (la lettura automatica degli
  appunti viene rifiutata da molti browser). Lo schermo intero usa la Fullscreen API: su iPhone Safari non esiste,
  l'alternativa è l'app aggiunta alla schermata Home. Al primo avvio il carattere vale min(64, lato corto/12) px.
- Telecomando e secondo schermo (dalla 0.5.0): `link.js` + `mqtt.js` (client MQTT 3.1.1 minimo su WebSocket).
  I messaggi passano da broker MQTT pubblici gratuiti (wss://broker.emqx.io:8084, wss://test.mosquitto.org:8081,
  wss://broker.hivemq.com:8884 — quest'ultimo il 19/10/2026 non rispondeva), argomento
  `slimdogs-teleprompter/v1/<codice>/h` (iPad → telefoni) e `/c` (telefoni → iPad). Tutto cifrato AES-GCM con chiave
  PBKDF2(codice:PIN): un PIN sbagliato semplicemente non riceve risposta. L'iPad è collegato a tutti i broker insieme,
  il telefono al primo che risponde (passa al successivo se tace). Il telefono saluta (`hello`) e manda `ping` ogni 2,5 s;
  l'iPad lo considera uscito dopo 15 s. Stato al secondo schermo 10 volte/s, altrimenti ~3; dopo ogni comando subito.
  Prima (0.3–0.4) era PeerJS/WebRTC: non funzionava fra reti diverse o con Wi-Fi che isolano i dispositivi.
  Il secondo schermo usa `Prompter.open(script, {follow})`. Link d'invito: `…/#collega=<codice>`.
  Dalla 0.5.2 il telecomando mostra una copia fedele dello schermo del prompter, senza specchio (scelta
  dell'utente: chi tiene il telefono deve vedere esattamente cosa vede chi legge): riquadro con le proporzioni
  `stageW`×`stageH` dell'iPad, impostazioni dell'iPad (messaggio `settings`, ora mandato a tutti) riscalate
  sulla larghezza, linea guida (`.guide`, classe condivisa), timer e conto alla rovescia. Trascinare il testo
  sposta l'iPad; il tocco NON fa play/pausa (richiesta esplicita: solo dal tasto).
  Dalla 0.6.0 il telefono modifica tutte le impostazioni del prompter: `settings-schema.js` è l'elenco unico
  (iPad e telefono), `panel.js` lo disegna con uno «store» che sul telefono manda `cmd settings` (al massimo
  ogni 80 ms, l'iPad accetta solo chiavi di DEFAULTS col tipo giusto), `resetSettings` e `duration`
  (durata dello script aperto, `Prompter.setScriptDuration`).
- Dalla 0.6.1 (affidabilità):
  * I broker pubblici sono QoS 0: un messaggio può perdersi. L'iPad rimanda le impostazioni ogni 2 s; telefono e
    secondo schermo, se non hanno impostazioni o lo script giusto, risalutano (`hello`) e l'iPad rimanda tutto;
    il telefono tiene le proprie modifiche in `pending` finché l'iPad non le conferma e le rimanda dopo 1,5 s.
  * `hello`/`welcome` portano la versione dell'app: se diverse, avviso chiaro su entrambi i lati.
  * Aggiornamenti: `reg.update()` all'avvio, al ritorno in primo piano e ogni 15 min. Telefono e secondo schermo
    ricaricano subito e si ricollegano da soli (`sessionStorage` `tp.resume`); l'iPad aspetta la libreria.
    Causa del problema del 21/10: dispositivi rimasti su versioni vecchie.
  * Il secondo schermo segue anche lo specchio dell'iPad (non ha più ribaltamenti propri): richiesta dell'utente.
  * Chiudendo la pagina il client manda subito un `bye` già cifrato (`byeBytes`).
- Verifica della sintassi: `node --check` non ha segnalato un a capo dentro una stringa in `remote.js`;
  controllare caricando il modulo nel browser (`await import('/js/x.js?x=' + Date.now())`).
- Voce (`voice.js`, modalità di scorrimento `voice`): Web Speech API (`webkitSpeechRecognition`), continuo con
  riavvio automatico. `findMatch` allinea le ultime 5 parole sentite (LCS con parole «uguali» = identiche, prefisso
  o una lettera diversa; paroline pesano 0,5) a una finestra di 30 parole avanti (soglia 2) o 150 (soglia 3,5).
  Solo in avanti. Il prompter porta la riga dell'ultima parola agganciata sulla guida (`wordTop` via Range, anche
  ribaltato); dopo trascinamenti/salti si riaggancia dalla nuova posizione. Prova senza microfono: sostituire
  `window.webkitSpeechRecognition` con una classe finta che chiama `onresult` (il riconoscitore si legge al play).
- Prova di collegamento in locale: iPad su http://localhost:8080 e client su http://127.0.0.1:8080 (memorie separate).
- Passi: 1 prompter di base ✔ · 2 import PDF + backup ✔ · 3 hosting HTTPS su GitHub Pages ✔
  · 4 telecomando + secondo schermo ✔ (0.3) · ritocchi telefono ✔ (0.3.1) · 5 voce ✔ (0.4.0)
  Idee per il futuro: segnaposti/capitoli, note di regia, profili di impostazioni, .docx, modifica dal telefono.
  · 4 telecomando iPhone + secondo schermo (PeerJS/WebRTC proposto, PIN) · 5 scorrimento che segue la voce (webkitSpeechRecognition).

---
## Storia: versione nativa Swift (16/10/2026)

Riassume la conversazione del 16/10/2026 in cui l'app è stata progettata e scritta su Windows.

## Chi e cosa
- Utente: Giovanni, Slim Dogs Production (produzione video). Parla italiano: rispondi in italiano.
- Obiettivo: un'app teleprompter **semplice ma professionale** per usare un **iPad come schermo di un teleprompter a specchio (beam splitter)**, installata sull'iPad come app normale.
- Il codice è stato scritto su Windows, dove non si può compilare per iOS: **non è mai stato compilato**. Il primo compito sul Mac è farlo compilare, correggere gli errori e installarlo sull'iPad dell'utente.

## Richieste dell'utente (tutte implementate)
1. Ribaltamento del testo orizzontale e verticale.
2. Dimensione del carattere; allineamento a sinistra, al centro o a destra.
3. Margini laterali, alto e basso regolabili separatamente (implementati come 4 margini: sinistro, destro, alto e basso).
4. Velocità di scorrimento regolabile.
5. In alternativa alla velocità, una **durata dello script**: la velocità si calcola da sola. La durata vale per ogni script.
6. Importazione di script illimitati.
7. Linea guida da mostrare o nascondere, spostabile, con opacità regolabile.
8. Conto alla rovescia da 0 a 10 s alla pressione di play.
9. Timer da mostrare o nascondere, ingrandibile, con opacità regolabile e spostabile.
10. Niente fotocamera; fondo sempre nero.
11. Funzioni extra chieste dopo: **iPhone come telecomando**, **uscita su monitor esterno**, **scorrimento che segue la voce**.

Aggiunte proposte da Claude e accettate:
- tastiera e telecomandi Bluetooth;
- trascinamento col dito per spostarsi nel testo;
- barra di avanzamento;
- velocità correggibile durante la lettura;
- schermo che non si spegne;
- pannello delle impostazioni sopra il prompter;
- stima della durata a 150 parole al minuto;
- timer rosso negli ultimi 10 secondi.

Idee rimaste per il futuro, non richieste:
- segnaposti e capitoli;
- testo formattato e note di regia;
- profili di impostazioni;
- importazione .docx;
- sincronizzazione con iCloud;
- modifica del testo dall'iPhone.

## Struttura (`Teleprompter.swiftpm`, App playground SwiftUI, iOS 17, Swift 5 mode)
- `Package.swift`: prodotto `.iOSApplication` (AppleProductTypes), con le capability Local Network + Bonjour `_tlprompter._tcp/_udp`, microfono e riconoscimento vocale.
- `TeleprompterApp.swift`: entry point, con `@UIApplicationDelegateAdaptor(AppDelegate)` per il monitor esterno.
- `Models/`
  - `Script` (Codable, `targetDuration` per script);
  - `ScriptStore` (JSON in Documents, salvataggio ritardato);
  - `PrompterSettings` + `SettingsStore.shared` (UserDefaults, chiave `prompterSettings.v1`).
- `Engine/PrompterEngine.swift`: un CADisplayLink fino a 120 Hz fa avanzare `offset` in punti. Le fasi sono paused, countingDown e playing. `followTarget` serve alla modalità voce.
- `Views/PrompterStage.swift`: la scena vista da chi legge (testo diviso in paragrafi, linea guida, timer, countdown), disegnata dritta. Il ribaltamento si applica dall'esterno con `scaleEffect(-1)`. I trascinamenti di linea e timer leggono le coordinate `.global` e le invertono quando lo schermo è ribaltato. Il testo parte dall'altezza della linea guida.
- `Views/PrompterView.swift`: lo schermo a tutto schermo con la barra dei comandi, il pannello impostazioni sovrapposto, i tasti, il telecomando, la voce e il monitor esterno.
- `Views/KeyCaptureView.swift`: UIView first responder che riceve `pressesBegan` da tastiere e page turner Bluetooth.
- `Views/LibraryView.swift`, `EditorView.swift`, `SettingsPanel.swift`, `RemoteControlView.swift`.
- `Remote/`: MultipeerConnectivity. L'iPad (`RemoteHost`) si rende visibile solo mentre il prompter è aperto e accetta l'invito solo con il PIN a 4 cifre. L'iPhone (`RemoteClient`) manda `RemoteCommand` e riceve `RemoteStatus` quattro volte al secondo.
- `External/ExternalDisplay.swift`: `AppDelegate` assegna la scena con ruolo `.windowExternalDisplayNonInteractive` a `ExternalDisplaySceneDelegate`, che mostra `ExternalPrompterView`. Il monitor segue l'avanzamento in percentuale, perché ha proporzioni diverse. `PrompterSession.shared` condivide il motore e i paragrafi.
- `Voice/VoiceFollower.swift`: SFSpeechRecognizer (sul dispositivo se possibile) con AVAudioEngine. Confronta le ultime 4 parole sentite con una finestra dello script e fa avanzare solo in avanti. La posizione della parola deriva dai frame dei paragrafi (`ParagraphFramesKey`) più la frazione di caratteri.

## Punti da verificare per primi (scritti senza compilatore)
- I nomi esatti in AppleProductTypes: `.placeholder(icon: .tv)`, `.localNetwork(purposeString:bonjourServiceTypes:)`, `.microphone(purposeString:)`, `.speechRecognition(purposeString:)`.
- Compilare l'App playground da riga di comando (`xcodebuild` su una cartella `.swiftpm`) può non essere supportato. In quel caso, d'accordo con l'utente, convertire in un progetto Xcode normale (`.xcodeproj`, per esempio con XcodeGen) con gli stessi file e le chiavi Info.plist equivalenti: `NSLocalNetworkUsageDescription`, `NSBonjourServices`, `NSMicrophoneUsageDescription`, `NSSpeechRecognitionUsageDescription`.
- Il monitor esterno: se l'`AppDelegate` che restituisce `UISceneConfiguration(name: nil, sessionRole:)` disturba la scena principale di SwiftUI, gestire solo il ruolo esterno.
- `@Observable` su sottoclassi di NSObject (`RemoteHost`, `RemoteClient`): se dà problemi, separare il delegate.
- Le prestazioni con script molto lunghi, la fluidità a 120 Hz e la precisione dell'aggancio vocale in italiano.

## Firma e installazione
Team: Apple ID personale dell'utente ("Personal Team"); con l'account gratuito l'app scade dopo 7 giorni. Bundle ID `com.slimdogsproduction.teleprompter`: se è già occupato, cambiarlo. Sull'iPad servono la Modalità sviluppatore e l'autorizzazione dello sviluppatore in Impostazioni › Generali › VPN e gestione dispositivi.
