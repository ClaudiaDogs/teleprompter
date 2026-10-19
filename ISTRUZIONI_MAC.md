# Come continuare sul Mac

## Cosa copiare
L'unico file da copiare è **`TELEPROMPTER_per_Mac.zip`**. Contiene:
- `Teleprompter.swiftpm`, il progetto dell'app;
- `CLAUDE.md`, il riepilogo della conversazione, che Claude legge da solo;
- `LEGGIMI.md`, l'elenco delle funzioni;
- queste istruzioni.

Passalo al Mac come preferisci: iCloud Drive, AirDrop, chiavetta o email.

## Passi
1. **Avvia subito il download di Xcode** dal Mac App Store, perché è grande. Al primo avvio accetta i componenti aggiuntivi e scarica la piattaforma **iOS**.
2. Scompatta lo zip in una cartella, per esempio `Documenti/TELEPROMPTER`.
3. Apri l'app **Claude**, vai nella scheda **Code** e scegli come cartella di lavoro `TELEPROMPTER`.
4. Come primo messaggio scrivi:
   > Leggi CLAUDE.md. Compila l'app per iPad con Xcode, correggi tutti gli errori e poi aiutami a installarla sul mio iPad collegato col cavo.
5. Mentre Claude lavora, prepara l'iPad:
   - collegalo al Mac col cavo, sbloccalo e tocca **Autorizza questo computer**;
   - in Xcode › Settings › Accounts aggiungi il tuo **Apple ID**;
   - sull'iPad attiva **Impostazioni › Privacy e sicurezza › Modalità sviluppatore**. L'opzione compare dopo il primo collegamento a Xcode e l'iPad si riavvia.
6. Al primo avvio dell'app vai in Impostazioni › Generali › **VPN e gestione dispositivi**, tocca il tuo Apple ID e scegli **Autorizza**.

## Per avere anche il telecomando sull'iPhone
Installa la stessa app anche sull'iPhone, con lo stesso procedimento. Poi:
1. sull'iPad apri uno script e tocca il pulsante **iPhone** nella barra dei comandi: compare un **PIN**;
2. sull'iPhone tocca **Telecomando**, inserisci il PIN e scegli l'iPad.

I due dispositivi devono avere Wi-Fi e Bluetooth attivi, anche senza internet. Al primo uso consenti l'accesso alla **rete locale**.

## Da sapere
- Con l'Apple ID gratuito l'app smette di aprirsi dopo **7 giorni**. Per rinnovarla ricolleghi il dispositivo e la reinstalli da Xcode.
- Con l'Apple Developer Program (99 €/anno) dura un anno e puoi distribuirla con TestFlight senza cavo.
