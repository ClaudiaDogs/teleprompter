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
- Per provare in locale con il service worker attivo: è cache-first, quindi dopo una modifica serve
  togliere la registrazione e svuotare la cache (o cambiare versione).
- Passi: 1 prompter di base ✔ · 2 import PDF + backup ✔ · 3 hosting HTTPS su GitHub Pages ✔
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
