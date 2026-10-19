import SwiftUI
import UIKit

/// Schermata telecomando, pensata per l'iPhone (funziona anche su un secondo iPad).
struct RemoteControlView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var client = RemoteClient()
    @State private var pin = ""

    var body: some View {
        NavigationStack {
            Group {
                if client.state == .connected {
                    connectedView
                } else {
                    pairingView
                }
            }
            .navigationTitle("Telecomando")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Chiudi") { dismiss() }
                }
            }
        }
        .onAppear {
            client.start()
            UIApplication.shared.isIdleTimerDisabled = true
        }
        .onDisappear {
            client.stop()
            UIApplication.shared.isIdleTimerDisabled = false
        }
    }

    private var pairingView: some View {
        Form {
            Section {
                TextField("PIN a 4 cifre", text: $pin)
                    .keyboardType(.numberPad)
                    .font(.title2.monospacedDigit())
                    .onChange(of: pin) { _, value in
                        pin = String(value.filter(\.isNumber).prefix(4))
                    }
            } header: {
                Text("1. PIN")
            } footer: {
                Text("Sull'iPad apri uno script nel teleprompter e tocca il pulsante con l'iPhone nella barra dei comandi: lì trovi il PIN.")
            }

            Section("2. Scegli l'iPad") {
                if client.peers.isEmpty {
                    HStack(spacing: 12) {
                        ProgressView()
                        Text("Cerco un iPad con il teleprompter aperto…")
                            .foregroundStyle(.secondary)
                    }
                }
                ForEach(client.peers, id: \.self) { peer in
                    Button {
                        client.connect(to: peer, pin: pin)
                    } label: {
                        Label(peer.displayName, systemImage: "ipad.landscape")
                    }
                    .disabled(pin.count != 4 || client.state == .connecting)
                }
            }

            if client.state == .connecting {
                Section {
                    HStack(spacing: 12) {
                        ProgressView()
                        Text("Connessione…")
                    }
                }
            }

            if let message = client.errorMessage {
                Section {
                    Text(message).foregroundStyle(.red)
                }
            }
        }
    }

    private var connectedView: some View {
        let status = client.status
        let playing = status?.isPlaying ?? false

        return VStack(spacing: 22) {
            if let status {
                VStack(spacing: 8) {
                    Text(status.title)
                        .font(.headline)
                        .lineLimit(1)
                    ProgressView(value: status.progress)
                    HStack {
                        Text(formatTime(status.elapsed))
                        Spacer()
                        Text("-" + formatTime(status.remaining, roundUp: true))
                    }
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(.secondary)
                    Text(status.speedText)
                        .font(.title3.monospacedDigit())
                }
            } else {
                Text("Collegato. In attesa del teleprompter…")
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 0)

            Button {
                send(.togglePlay)
            } label: {
                Image(systemName: playing ? "pause.fill" : "play.fill")
                    .font(.system(size: 56, weight: .bold))
                    .foregroundStyle(.black)
                    .frame(width: 150, height: 150)
                    .background(Circle().fill(Color.accentColor))
            }
            .accessibilityLabel(playing ? "Pausa" : "Play")

            HStack(spacing: 16) {
                remoteButton("tortoise.fill", "Più lento", .slower)
                remoteButton("hare.fill", "Più veloce", .faster)
            }
            HStack(spacing: 16) {
                remoteButton("backward.fill", "Indietro", .back)
                remoteButton("backward.end.fill", "Inizio", .restart)
                remoteButton("forward.fill", "Avanti", .forward)
            }
            HStack(spacing: 16) {
                remoteButton("arrow.left.and.right", "Ribalta ↔", .mirrorH)
                remoteButton("arrow.up.and.down", "Ribalta ↕", .mirrorV)
            }

            Spacer(minLength: 0)

            Button("Disconnetti", role: .destructive) { client.disconnect() }
        }
        .padding(20)
    }

    private func remoteButton(_ icon: String, _ title: String, _ command: RemoteCommand) -> some View {
        Button {
            send(command)
        } label: {
            VStack(spacing: 6) {
                Image(systemName: icon).font(.title2)
                Text(title).font(.caption)
            }
            .frame(maxWidth: .infinity, minHeight: 70)
            .background(RoundedRectangle(cornerRadius: 14).fill(Color.white.opacity(0.1)))
        }
        .buttonStyle(.plain)
    }

    private func send(_ command: RemoteCommand) {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        client.send(command)
    }
}

/// Riquadro sull'iPad con il PIN da inserire sul telecomando.
struct RemoteInfoView: View {
    private let host = RemoteHost.shared

    var body: some View {
        VStack(spacing: 12) {
            Text("Telecomando iPhone")
                .font(.headline)
            Text("Sull'iPhone apri questa app, tocca Telecomando e inserisci il PIN:")
                .font(.footnote)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            Text(host.pin)
                .font(.system(size: 46, weight: .bold, design: .rounded).monospacedDigit())
            if host.connectedNames.isEmpty {
                Text("Nessun telecomando collegato")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(host.connectedNames, id: \.self) { name in
                    Label(name, systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                }
            }
        }
        .padding(20)
        .frame(width: 300)
    }
}
