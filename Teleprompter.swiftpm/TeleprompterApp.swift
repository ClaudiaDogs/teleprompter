import SwiftUI

@main
struct TeleprompterApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var scripts = ScriptStore()
    @State private var settings = SettingsStore.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            LibraryView()
                .environment(scripts)
                .environment(settings)
                .preferredColorScheme(.dark)
                .tint(.orange)
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { scripts.saveNow() }
        }
    }
}
