import SwiftUI

struct EditorView: View {
    let scriptID: UUID
    var onPlay: (UUID) -> Void

    @Environment(ScriptStore.self) private var store
    @State private var showDuration = false

    private var script: Binding<Script> {
        Binding(
            get: { store.script(id: scriptID) ?? Script(title: "", body: "") },
            set: { store.update($0) }
        )
    }

    var body: some View {
        let current = script.wrappedValue

        VStack(spacing: 0) {
            TextField("Titolo", text: script.title)
                .font(.title2.bold())
                .padding(.horizontal, 20)
                .padding(.vertical, 14)
            Divider()
            TextEditor(text: script.body)
                .font(.system(size: 20))
                .padding(.horizontal, 14)
            Divider()
            HStack {
                Text("\(current.wordCount) parole")
                Spacer()
                Button {
                    showDuration = true
                } label: {
                    Label(
                        "Durata \(formatTime(current.effectiveDuration))" + (current.targetDuration == nil ? " (stima)" : ""),
                        systemImage: "timer"
                    )
                }
                .popover(isPresented: $showDuration) {
                    durationPopover
                }
            }
            .font(.footnote)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    store.saveNow()
                    onPlay(scriptID)
                } label: {
                    Label("Avvia", systemImage: "play.fill")
                }
                .buttonStyle(.borderedProminent)
            }
        }
    }

    private var durationPopover: some View {
        let current = script.wrappedValue
        return NavigationStack {
            Form {
                Section {
                    DurationEditor(
                        duration: Binding(
                            get: { script.wrappedValue.effectiveDuration },
                            set: { script.wrappedValue.targetDuration = $0 }
                        ),
                        estimate: current.estimatedDuration
                    )
                } footer: {
                    Text("Usata quando lo scorrimento è in modalità Durata: la velocità si regola da sola perché lo script finisca in questo tempo.")
                }
            }
            .navigationTitle("Durata")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fine") { showDuration = false }
                }
            }
        }
        .frame(minWidth: 340, minHeight: 320)
        .presentationCompactAdaptation(.sheet)
    }
}
