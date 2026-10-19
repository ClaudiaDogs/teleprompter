import SwiftUI
import UIKit
import Observation

/// Stato del prompter condiviso con il monitor esterno.
@Observable
final class PrompterSession {
    static let shared = PrompterSession()

    /// Motore del prompter aperto in questo momento (nil se nessuno).
    var engine: PrompterEngine?
    var paragraphs: [String] = []
    var externalConnected = false
}

/// Senza questa configurazione iPadOS duplicherebbe sul monitor l'intero schermo dell'iPad,
/// comandi compresi. Con questa il monitor riceve una scena tutta sua che mostra solo il testo.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: nil, sessionRole: connectingSceneSession.role)
        if connectingSceneSession.role == .windowExternalDisplayNonInteractive {
            configuration.delegateClass = ExternalDisplaySceneDelegate.self
        }
        return configuration
    }
}

final class ExternalDisplaySceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        let host = UIHostingController(rootView: ExternalPrompterView())
        host.view.backgroundColor = .black
        window.rootViewController = host
        window.isHidden = false
        self.window = window
        PrompterSession.shared.externalConnected = true
    }

    func sceneDidDisconnect(_ scene: UIScene) {
        PrompterSession.shared.externalConnected = false
        window = nil
    }
}

/// Il monitor esterno mostra solo ciò che vede chi legge, con il ribaltamento delle impostazioni.
/// Ha proporzioni diverse dall'iPad, quindi segue la percentuale di avanzamento e non i punti.
struct ExternalPrompterView: View {
    private let session = PrompterSession.shared
    private let store = SettingsStore.shared
    @State private var textHeight: CGFloat = 0

    var body: some View {
        GeometryReader { geo in
            if let engine = session.engine {
                let s = store.settings
                PrompterStage(
                    paragraphs: session.paragraphs,
                    store: store,
                    engine: engine,
                    size: geo.size,
                    editable: false,
                    mirrorH: s.mirrorHorizontal,
                    mirrorV: s.mirrorVertical,
                    fontScale: s.externalFontScale,
                    progressHeight: textHeight
                )
                .scaleEffect(x: s.mirrorHorizontal ? -1 : 1, y: s.mirrorVertical ? -1 : 1)
                .onPreferenceChange(TextHeightKey.self) { textHeight = $0 }
            } else {
                Color.black
                    .overlay {
                        Image(systemName: "text.alignleft")
                            .font(.system(size: 80))
                            .foregroundStyle(.white.opacity(0.15))
                    }
            }
        }
        .ignoresSafeArea()
        .background(Color.black)
        .preferredColorScheme(.dark)
    }
}
