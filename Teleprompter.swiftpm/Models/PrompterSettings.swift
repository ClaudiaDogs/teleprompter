import SwiftUI
import Observation

enum TextAlign: String, Codable, CaseIterable, Identifiable {
    case left, center, right
    var id: Self { self }

    var label: String {
        switch self {
        case .left: "Sinistra"
        case .center: "Centro"
        case .right: "Destra"
        }
    }
    var icon: String {
        switch self {
        case .left: "text.alignleft"
        case .center: "text.aligncenter"
        case .right: "text.alignright"
        }
    }
    var textAlignment: TextAlignment {
        switch self {
        case .left: .leading
        case .center: .center
        case .right: .trailing
        }
    }
    var frameAlignment: Alignment {
        switch self {
        case .left: .leading
        case .center: .center
        case .right: .trailing
        }
    }
    var horizontal: HorizontalAlignment {
        switch self {
        case .left: .leading
        case .center: .center
        case .right: .trailing
        }
    }
}

enum FontStyle: String, Codable, CaseIterable, Identifiable {
    case system, serif, rounded, mono
    var id: Self { self }

    var label: String {
        switch self {
        case .system: "Standard"
        case .serif: "Con grazie"
        case .rounded: "Arrotondato"
        case .mono: "Monospaziato"
        }
    }
    var design: Font.Design {
        switch self {
        case .system: .default
        case .serif: .serif
        case .rounded: .rounded
        case .mono: .monospaced
        }
    }
}

enum TintColor: String, Codable, CaseIterable, Identifiable {
    case white, yellow, green, cyan, red
    var id: Self { self }

    var label: String {
        switch self {
        case .white: "Bianco"
        case .yellow: "Giallo"
        case .green: "Verde"
        case .cyan: "Azzurro"
        case .red: "Rosso"
        }
    }
    var color: Color {
        switch self {
        case .white: .white
        case .yellow: Color(red: 1, green: 0.88, blue: 0.3)
        case .green: Color(red: 0.4, green: 1, blue: 0.5)
        case .cyan: Color(red: 0.4, green: 0.9, blue: 1)
        case .red: Color(red: 1, green: 0.25, blue: 0.2)
        }
    }
}

enum SpeedMode: String, Codable {
    case speed, duration, voice
}

enum VoiceLanguage: String, CaseIterable, Identifiable {
    case italian = "it-IT", english = "en-US", british = "en-GB", spanish = "es-ES", french = "fr-FR", german = "de-DE"
    var id: Self { self }

    var label: String {
        switch self {
        case .italian: "Italiano"
        case .english: "Inglese (USA)"
        case .british: "Inglese (UK)"
        case .spanish: "Spagnolo"
        case .french: "Francese"
        case .german: "Tedesco"
        }
    }
}

enum GuideStyle: String, Codable, CaseIterable, Identifiable {
    case arrows, line, band
    var id: Self { self }

    var label: String {
        switch self {
        case .arrows: "Frecce"
        case .line: "Linea"
        case .band: "Fascia"
        }
    }
}

enum TimerMode: String, Codable, CaseIterable, Identifiable {
    case elapsed, remaining, both
    var id: Self { self }

    var label: String {
        switch self {
        case .elapsed: "Trascorso"
        case .remaining: "Rimanente"
        case .both: "Entrambi"
        }
    }
}

/// Tutte le regolazioni del teleprompter. Posizioni e margini sono espressi
/// come frazioni dello schermo, "come li vede chi legge" nello specchio.
struct PrompterSettings: Codable, Equatable {
    // Testo
    var fontSize: Double = 64
    var fontStyle: FontStyle = .system
    var bold = false
    var lineSpacing: Double = 0.25          // frazione della dimensione del carattere
    var textColor: TintColor = .white
    var alignment: TextAlign = .left

    // Specchio
    var mirrorHorizontal = false
    var mirrorVertical = false

    // Margini
    var marginLeft: Double = 0.08
    var marginRight: Double = 0.08
    var marginTop: Double = 0.04
    var marginBottom: Double = 0.04

    // Scorrimento
    var speedMode: SpeedMode = .speed
    var speed: Double = 60                  // punti al secondo
    var countdown = 3                       // secondi, 0-10
    var countdownOnResume = false
    var voiceLocale = "it-IT"               // lingua dello scorrimento a voce

    // Linea guida (è anche la riga da cui parte il testo)
    var guideEnabled = true
    var guideStyle: GuideStyle = .arrows
    var guideColor: TintColor = .red
    var guidePosition: Double = 0.4
    var guideOpacity: Double = 0.7

    // Timer
    var timerEnabled = true
    var timerMode: TimerMode = .elapsed
    var timerSize: Double = 36
    var timerOpacity: Double = 0.8
    var timerX: Double = 0.88
    var timerY: Double = 0.07

    // Monitor esterno
    var operatorUnmirrored = true           // con monitor collegato, l'iPad mostra il testo dritto
    var externalFontScale: Double = 1.5

    var font: Font {
        .system(size: fontSize, weight: bold ? .bold : .regular, design: fontStyle.design)
    }
}

@Observable
final class SettingsStore {
    static let shared = SettingsStore()
    private static let key = "prompterSettings.v1"

    var settings: PrompterSettings {
        didSet { save() }
    }

    init() {
        if let data = UserDefaults.standard.data(forKey: Self.key),
           let decoded = try? JSONDecoder().decode(PrompterSettings.self, from: data) {
            settings = decoded
        } else {
            settings = PrompterSettings()
        }
    }

    private func save() {
        if let data = try? JSONEncoder().encode(settings) {
            UserDefaults.standard.set(data, forKey: Self.key)
        }
    }
}
