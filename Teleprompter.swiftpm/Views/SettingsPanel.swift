import SwiftUI

struct SettingsPanel: View {
    @Bindable var store: SettingsStore
    /// Durata dello script aperto (nil quando le impostazioni sono aperte dalla libreria).
    var duration: Binding<TimeInterval>? = nil
    var estimatedDuration: TimeInterval? = nil
    /// Altezza del testo da far scorrere, per mostrare durata o velocità risultante.
    var scrollDistance: CGFloat? = nil
    var onClose: (() -> Void)? = nil

    @State private var confirmReset = false

    var body: some View {
        Form {
            textSection
            mirrorSection
            marginSection
            scrollSection
            guideSection
            timerSection
            externalSection
            shortcutsSection

            Section {
                Button("Ripristina impostazioni predefinite", role: .destructive) {
                    confirmReset = true
                }
            }
        }
        .navigationTitle("Impostazioni")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let onClose {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fine", action: onClose)
                }
            }
        }
        .confirmationDialog("Ripristinare tutte le impostazioni?", isPresented: $confirmReset, titleVisibility: .visible) {
            Button("Ripristina", role: .destructive) { store.settings = PrompterSettings() }
        }
    }

    private var textSection: some View {
        Section("Testo") {
            SliderRow(title: "Dimensione", value: $store.settings.fontSize, range: 20...200, step: 1) { "\(Int($0)) pt" }
            Picker("Carattere", selection: $store.settings.fontStyle) {
                ForEach(FontStyle.allCases) { Text($0.label).tag($0) }
            }
            Toggle("Grassetto", isOn: $store.settings.bold)
            SliderRow(title: "Interlinea", value: $store.settings.lineSpacing, range: 0...1.5, step: 0.05) { String(format: "%.2f", $0) }
            Picker("Colore", selection: $store.settings.textColor) {
                ForEach(TintColor.allCases) { Text($0.label).tag($0) }
            }
            Picker("Allineamento", selection: $store.settings.alignment) {
                ForEach(TextAlign.allCases) { Image(systemName: $0.icon).tag($0) }
            }
            .pickerStyle(.segmented)
        }
    }

    private var mirrorSection: some View {
        Section {
            Toggle("Ribalta in orizzontale", isOn: $store.settings.mirrorHorizontal)
            Toggle("Ribalta in verticale", isOn: $store.settings.mirrorVertical)
        } header: {
            Text("Specchio")
        } footer: {
            Text("Con un teleprompter a vetro di solito serve il ribaltamento orizzontale.")
        }
    }

    private var marginSection: some View {
        Section {
            SliderRow(title: "Sinistro", value: $store.settings.marginLeft, range: 0...0.4, format: percent)
            SliderRow(title: "Destro", value: $store.settings.marginRight, range: 0...0.4, format: percent)
            SliderRow(title: "Alto", value: $store.settings.marginTop, range: 0...0.4, format: percent)
            SliderRow(title: "Basso", value: $store.settings.marginBottom, range: 0...0.4, format: percent)
        } header: {
            Text("Margini")
        } footer: {
            Text("I margini sono indicati come li vede chi legge nello specchio.")
        }
    }

    @ViewBuilder
    private var scrollSection: some View {
        Section("Scorrimento") {
            Picker("Modalità", selection: $store.settings.speedMode) {
                Text("Velocità").tag(SpeedMode.speed)
                Text("Durata").tag(SpeedMode.duration)
                Text("Voce").tag(SpeedMode.voice)
            }
            .pickerStyle(.segmented)

            if store.settings.speedMode == .speed {
                SliderRow(title: "Velocità", value: $store.settings.speed, range: 5...400, step: 1) { "\(Int($0))" }
                if let distance = scrollDistance, distance > 1 {
                    LabeledContent("Durata risultante", value: formatTime(Double(distance) / store.settings.speed, roundUp: true))
                }
            } else if store.settings.speedMode == .voice {
                Picker("Lingua", selection: $store.settings.voiceLocale) {
                    ForEach(VoiceLanguage.allCases) { Text($0.label).tag($0.rawValue) }
                }
                Text("Il testo segue la voce di chi legge: premi play e inizia a parlare. Se salti delle parole o improvvisi, il testo aspetta e si riaggancia appena riconosce lo script. Il riconoscimento avviene sul dispositivo quando la lingua lo permette.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else if let duration {
                DurationEditor(duration: duration, estimate: estimatedDuration)
                if let distance = scrollDistance, distance > 1 {
                    LabeledContent("Velocità risultante", value: "\(Int(Double(distance) / max(1, duration.wrappedValue)))")
                }
            } else {
                Text("La durata si imposta per ogni script: nell'editor oppure dal pannello impostazioni durante la lettura.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Stepper(value: $store.settings.countdown, in: 0...10) {
                LabeledContent("Conto alla rovescia", value: store.settings.countdown == 0 ? "No" : "\(store.settings.countdown) s")
            }
            Toggle("Conto alla rovescia anche alla ripresa", isOn: $store.settings.countdownOnResume)
        }
    }

    private var guideSection: some View {
        Section {
            Toggle("Mostra linea guida", isOn: $store.settings.guideEnabled)
            Picker("Stile", selection: $store.settings.guideStyle) {
                ForEach(GuideStyle.allCases) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            Picker("Colore", selection: $store.settings.guideColor) {
                ForEach(TintColor.allCases) { Text($0.label).tag($0) }
            }
            SliderRow(title: "Posizione", value: $store.settings.guidePosition, range: 0.05...0.95, format: percent)
            SliderRow(title: "Opacità", value: $store.settings.guideOpacity, range: 0.05...1, format: percent)
        } header: {
            Text("Linea guida")
        } footer: {
            Text("Il testo parte dall'altezza della linea guida. In pausa puoi trascinarla direttamente sullo schermo.")
        }
    }

    private var timerSection: some View {
        Section {
            Toggle("Mostra timer", isOn: $store.settings.timerEnabled)
            Picker("Mostra", selection: $store.settings.timerMode) {
                ForEach(TimerMode.allCases) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            SliderRow(title: "Dimensione", value: $store.settings.timerSize, range: 14...140, step: 1) { "\(Int($0)) pt" }
            SliderRow(title: "Opacità", value: $store.settings.timerOpacity, range: 0.05...1, format: percent)
            SliderRow(title: "Posizione orizzontale", value: $store.settings.timerX, range: 0.03...0.97, format: percent)
            SliderRow(title: "Posizione verticale", value: $store.settings.timerY, range: 0.03...0.97, format: percent)
        } header: {
            Text("Timer")
        } footer: {
            Text("In pausa puoi trascinare il timer direttamente sullo schermo.")
        }
    }

    private var externalSection: some View {
        Section {
            Toggle("Su iPad mostra il testo dritto", isOn: $store.settings.operatorUnmirrored)
            SliderRow(title: "Dimensione testo sul monitor", value: $store.settings.externalFontScale, range: 0.5...3, step: 0.05) {
                String(format: "×%.2f", $0)
            }
        } header: {
            Text("Monitor esterno")
        } footer: {
            Text("Collega un monitor con un adattatore USB-C o Lightning/HDMI: il monitor mostra solo il testo con il ribaltamento impostato, l'iPad resta il pannello di controllo. Se è attivo Stage Manager, iPadOS usa il monitor come scrivania estesa: disattivalo nel Centro di Controllo.")
        }
    }

    private var shortcutsSection: some View {
        Section("Tastiera e telecomando Bluetooth") {
            LabeledContent("Play / pausa", value: "Spazio, Invio")
            LabeledContent("Più veloce / più lento", value: "↑  ↓")
            LabeledContent("Indietro / avanti", value: "←  →  Pag↑  Pag↓")
            LabeledContent("Ricomincia", value: "R")
            LabeledContent("Ribalta orizzontale / verticale", value: "H  V")
            LabeledContent("Chiudi", value: "Esc")
            Text("Telecomando iPhone: apri l'app sull'iPhone, tocca Telecomando e inserisci il PIN che trovi nel pulsante iPhone della barra dei comandi del prompter.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    private func percent(_ value: Double) -> String {
        "\(Int((value * 100).rounded()))%"
    }
}

struct SliderRow: View {
    let title: String
    @Binding var value: Double
    let range: ClosedRange<Double>
    var step: Double? = nil
    let format: (Double) -> String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(title)
                Spacer()
                Text(format(value))
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
            if let step {
                Slider(value: $value, in: range, step: step)
            } else {
                Slider(value: $value, in: range)
            }
        }
    }
}

struct DurationEditor: View {
    @Binding var duration: TimeInterval
    let estimate: TimeInterval?

    private var minutes: Binding<Int> {
        Binding(
            get: { Int(duration) / 60 },
            set: { duration = TimeInterval(max(5, $0 * 60 + Int(duration) % 60)) }
        )
    }

    private var seconds: Binding<Int> {
        Binding(
            get: { Int(duration) % 60 },
            set: { duration = TimeInterval(max(5, Int(duration) / 60 * 60 + $0)) }
        )
    }

    var body: some View {
        LabeledContent("Durata dello script", value: formatTime(duration))
        Stepper("Minuti: \(minutes.wrappedValue)", value: minutes, in: 0...300)
        Stepper("Secondi: \(seconds.wrappedValue)", value: seconds, in: 0...59)
        if let estimate {
            Button("Usa la stima dalle parole (\(formatTime(estimate)))") {
                duration = estimate
            }
        }
    }
}
