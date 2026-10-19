import SwiftUI
import UIKit

struct LibraryView: View {
    @Environment(ScriptStore.self) private var store
    @Environment(SettingsStore.self) private var settings

    @State private var selection: UUID?
    @State private var search = ""
    @State private var showImporter = false
    @State private var showSettings = false
    @State private var showRemote = false
    @State private var launch: PrompterLaunch?
    @State private var alertMessage: String?

    private var filtered: [Script] {
        let sorted = store.scripts.sorted { $0.updatedAt > $1.updatedAt }
        guard !search.isEmpty else { return sorted }
        return sorted.filter {
            $0.title.localizedCaseInsensitiveContains(search) || $0.body.localizedCaseInsensitiveContains(search)
        }
    }

    var body: some View {
        NavigationSplitView {
            sidebar
        } detail: {
            if let id = selection, store.script(id: id) != nil {
                EditorView(scriptID: id) { launch = PrompterLaunch(id: $0) }
                    .id(id)
            } else {
                ContentUnavailableView(
                    "Nessuno script selezionato",
                    systemImage: "text.alignleft",
                    description: Text("Scegli uno script dalla libreria, creane uno nuovo o importalo da un file.")
                )
            }
        }
        .fullScreenCover(item: $launch) { item in
            PrompterView(scriptID: item.id)
                .environment(store)
                .environment(settings)
        }
        .fullScreenCover(isPresented: $showRemote) {
            RemoteControlView()
        }
        .sheet(isPresented: $showSettings) {
            NavigationStack {
                SettingsPanel(store: settings, onClose: { showSettings = false })
            }
        }
        .fileImporter(
            isPresented: $showImporter,
            allowedContentTypes: ScriptImporter.allowedTypes,
            allowsMultipleSelection: true,
            onCompletion: handleImport
        )
        .alert(
            "Importazione",
            isPresented: Binding(get: { alertMessage != nil }, set: { if !$0 { alertMessage = nil } })
        ) {
            Button("OK") {}
        } message: {
            Text(alertMessage ?? "")
        }
    }

    private var sidebar: some View {
        List(selection: $selection) {
            ForEach(filtered) { script in
                ScriptRow(script: script)
                    .tag(script.id)
                    .contextMenu {
                        Button { launch = PrompterLaunch(id: script.id) } label: {
                            Label("Avvia teleprompter", systemImage: "play.fill")
                        }
                        Button { selection = store.duplicate(id: script.id)?.id } label: {
                            Label("Duplica", systemImage: "plus.square.on.square")
                        }
                        Button(role: .destructive) { delete(script.id) } label: {
                            Label("Elimina", systemImage: "trash")
                        }
                    }
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) { delete(script.id) } label: {
                            Label("Elimina", systemImage: "trash")
                        }
                    }
                    .swipeActions(edge: .leading) {
                        Button { launch = PrompterLaunch(id: script.id) } label: {
                            Label("Avvia", systemImage: "play.fill")
                        }
                        .tint(.orange)
                    }
            }
        }
        .overlay {
            if store.scripts.isEmpty {
                ContentUnavailableView(
                    "Nessuno script",
                    systemImage: "doc.text",
                    description: Text("Tocca + per scriverne uno, incollarlo o importare dei file.")
                )
            } else if filtered.isEmpty {
                ContentUnavailableView.search(text: search)
            }
        }
        .searchable(text: $search, prompt: "Cerca negli script")
        .navigationTitle("Script")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button { showSettings = true } label: {
                    Image(systemName: "gearshape")
                }
                .accessibilityLabel("Impostazioni")
            }
            ToolbarItem(placement: .topBarLeading) {
                Button { showRemote = true } label: {
                    Label("Telecomando", systemImage: "iphone.radiowaves.left.and.right")
                }
            }
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button { newScript() } label: {
                        Label("Nuovo script", systemImage: "square.and.pencil")
                    }
                    Button { pasteScript() } label: {
                        Label("Incolla dagli appunti", systemImage: "doc.on.clipboard")
                    }
                    Button { showImporter = true } label: {
                        Label("Importa file…", systemImage: "square.and.arrow.down")
                    }
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("Aggiungi script")
            }
        }
    }

    private func newScript() {
        let script = Script(title: "Nuovo script", body: "")
        store.add(script)
        selection = script.id
    }

    private func pasteScript() {
        guard let text = UIPasteboard.general.string,
              !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            alertMessage = "Negli appunti non c'è testo da incollare."
            return
        }
        let firstLine = text.split(separator: "\n").first.map(String.init) ?? "Script incollato"
        let script = Script(title: String(firstLine.prefix(60)), body: text)
        store.add(script)
        selection = script.id
    }

    private func delete(_ id: UUID) {
        if selection == id { selection = nil }
        store.delete(id: id)
    }

    private func handleImport(_ result: Result<[URL], Error>) {
        switch result {
        case .failure(let error):
            alertMessage = error.localizedDescription
        case .success(let urls):
            var failures: [String] = []
            var lastID: UUID?
            for url in urls {
                do {
                    let script = try ScriptImporter.load(from: url)
                    store.add(script)
                    lastID = script.id
                } catch {
                    failures.append("\(url.lastPathComponent): \(error.localizedDescription)")
                }
            }
            if let lastID { selection = lastID }
            if !failures.isEmpty {
                alertMessage = "Alcuni file non sono stati importati:\n" + failures.joined(separator: "\n")
            }
        }
    }
}

struct ScriptRow: View {
    let script: Script

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(script.title.isEmpty ? "Senza titolo" : script.title)
                .font(.headline)
                .lineLimit(1)
            if !script.body.isEmpty {
                Text(script.body)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            Text("\(script.wordCount) parole · \(formatTime(script.effectiveDuration))")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 2)
    }
}
