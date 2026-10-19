import Foundation
import Observation

/// Libreria degli script, salvata in un file JSON nella cartella Documenti dell'app.
@Observable
final class ScriptStore {
    private(set) var scripts: [Script] = []

    @ObservationIgnored private var saveTask: Task<Void, Never>?
    @ObservationIgnored private let fileURL: URL

    init() {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        fileURL = dir.appendingPathComponent("scripts.json")
        if let data = try? Data(contentsOf: fileURL),
           let decoded = try? JSONDecoder().decode([Script].self, from: data) {
            scripts = decoded
        } else {
            scripts = [Script.sample]
        }
    }

    func script(id: UUID) -> Script? {
        scripts.first { $0.id == id }
    }

    func add(_ script: Script) {
        scripts.insert(script, at: 0)
        scheduleSave()
    }

    func update(_ script: Script) {
        guard let index = scripts.firstIndex(where: { $0.id == script.id }),
              scripts[index] != script else { return }
        var updated = script
        updated.updatedAt = Date()
        scripts[index] = updated
        scheduleSave()
    }

    func delete(id: UUID) {
        scripts.removeAll { $0.id == id }
        scheduleSave()
    }

    @discardableResult
    func duplicate(id: UUID) -> Script? {
        guard var copy = script(id: id) else { return nil }
        copy.id = UUID()
        copy.title += " (copia)"
        copy.createdAt = Date()
        copy.updatedAt = Date()
        add(copy)
        return copy
    }

    func saveNow() {
        saveTask?.cancel()
        Self.write(scripts, to: fileURL)
    }

    /// Salvataggio ritardato: durante la scrittura nell'editor non riscrive il file a ogni lettera.
    private func scheduleSave() {
        saveTask?.cancel()
        let snapshot = scripts
        let url = fileURL
        saveTask = Task {
            try? await Task.sleep(for: .milliseconds(500))
            guard !Task.isCancelled else { return }
            Self.write(snapshot, to: url)
        }
    }

    private static func write(_ scripts: [Script], to url: URL) {
        do {
            let data = try JSONEncoder().encode(scripts)
            try data.write(to: url, options: .atomic)
        } catch {
            print("Salvataggio script non riuscito: \(error)")
        }
    }
}
