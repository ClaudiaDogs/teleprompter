import SwiftUI
import UIKit

struct PrompterLaunch: Identifiable {
    let id: UUID
}

/// Schermo del teleprompter a tutto schermo, sempre su fondo nero.
struct PrompterView: View {
    let scriptID: UUID

    @Environment(ScriptStore.self) private var scripts
    @Environment(SettingsStore.self) private var settingsStore
    @Environment(\.dismiss) private var dismiss

    @State private var engine = PrompterEngine()
    @State private var follower = VoiceFollower()
    @State private var voiceActive = false
    @State private var paragraphs: [String] = []
    @State private var paragraphFrames: [Int: CGRect] = [:]
    @State private var textHeight: CGFloat = 0
    @State private var controlsVisible = true
    @State private var showSettings = false
    @State private var panelOnRight = true
    @State private var dragStartOffset: CGFloat?
    @State private var hideTask: Task<Void, Never>?
    @State private var toast: String?
    @State private var toastTask: Task<Void, Never>?

    private let session = PrompterSession.shared
    private let remote = RemoteHost.shared

    private var settings: PrompterSettings { settingsStore.settings }
    private var script: Script? { scripts.script(id: scriptID) }

    /// Con un monitor esterno collegato l'iPad può mostrare il testo dritto per l'operatore.
    private var operatorView: Bool { session.externalConnected && settings.operatorUnmirrored }
    private var mirrorH: Bool { settings.mirrorHorizontal && !operatorView }
    private var mirrorV: Bool { settings.mirrorVertical && !operatorView }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                stage(size: geo.size)

                if controlsVisible {
                    VStack {
                        Spacer()
                        ControlsBar(
                            engine: engine,
                            store: settingsStore,
                            speedText: speedText,
                            speedCaption: speedCaption,
                            onClose: close,
                            onRestart: restart,
                            onTogglePlay: togglePlay,
                            onSpeed: changeSpeed,
                            onSettings: { withAnimation { showSettings.toggle() } }
                        )
                    }
                    .transition(.opacity)
                }

                if showSettings {
                    settingsPanel(size: geo.size)
                }

                if let toast {
                    VStack {
                        Text(toast)
                            .font(.headline)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 18)
                            .padding(.vertical, 10)
                            .background(.ultraThinMaterial, in: Capsule())
                            .padding(.top, 30)
                        Spacer()
                    }
                    .allowsHitTesting(false)
                    .transition(.opacity)
                }
            }
        }
        .ignoresSafeArea()
        .background(Color.black)
        .background(KeyCaptureView(onKey: handleKey))
        .statusBarHidden(true)
        .persistentSystemOverlays(.hidden)
        .preferredColorScheme(.dark)
        .onAppear {
            loadParagraphs(script?.body ?? "")
            session.engine = engine
            remote.onCommand = { perform($0) }
            remote.start()
            UIApplication.shared.isIdleTimerDisabled = true
            syncEngine()
        }
        .onDisappear {
            stopVoice()
            engine.pause()
            session.engine = nil
            remote.onCommand = nil
            remote.stop()
            UIApplication.shared.isIdleTimerDisabled = false
        }
        .onChange(of: script?.body) { _, body in loadParagraphs(body ?? "") }
        .onChange(of: textHeight) { syncEngine() }
        .onChange(of: settings) {
            syncEngine()
            updateVoice()
        }
        .onChange(of: script?.effectiveDuration) { syncEngine() }
        .onChange(of: engine.phase) { _, phase in
            if phase == .paused { withAnimation { controlsVisible = true } }
            updateVoice()
        }
        .onChange(of: follower.currentWord) { _, word in
            if voiceActive { engine.followTarget = offset(forWord: word) }
        }
        .onChange(of: follower.status) { _, status in
            switch status {
            case .denied:
                showToast("Consenti microfono e riconoscimento vocale in Impostazioni › Teleprompter", seconds: 4)
            case .unavailable(let message):
                showToast(message, seconds: 4)
            default:
                break
            }
        }
        .task {
            // Stato per il telecomando, quattro volte al secondo.
            while !Task.isCancelled {
                sendRemoteStatus()
                try? await Task.sleep(for: .milliseconds(250))
            }
        }
    }

    // MARK: - Scena ribaltata

    private func stage(size: CGSize) -> some View {
        PrompterStage(
            paragraphs: paragraphs,
            store: settingsStore,
            engine: engine,
            size: size,
            editable: controlsVisible && engine.phase == .paused,
            mirrorH: mirrorH,
            mirrorV: mirrorV
        )
        .scaleEffect(x: mirrorH ? -1 : 1, y: mirrorV ? -1 : 1)
        .frame(width: size.width, height: size.height)
        .contentShape(Rectangle())
        .onTapGesture { togglePlay() }
        .gesture(scrollGesture)
        .onPreferenceChange(TextHeightKey.self) { textHeight = $0 }
        .onPreferenceChange(ParagraphFramesKey.self) { paragraphFrames = $0 }
    }

    /// Trascinando il testo ci si sposta avanti o indietro; il verso segue il dito anche a schermo ribaltato.
    private var scrollGesture: some Gesture {
        DragGesture(minimumDistance: 8)
            .onChanged { value in
                let start = dragStartOffset ?? engine.offset
                dragStartOffset = start
                engine.followTarget = nil
                let dy = value.translation.height * (mirrorV ? -1 : 1)
                engine.setOffset(start - dy)
            }
            .onEnded { _ in
                dragStartOffset = nil
                resyncVoice()
            }
    }

    // MARK: - Pannello impostazioni

    private func settingsPanel(size: CGSize) -> some View {
        HStack(spacing: 0) {
            if panelOnRight { Spacer(minLength: 0) }
            NavigationStack {
                SettingsPanel(
                    store: settingsStore,
                    duration: durationBinding,
                    estimatedDuration: script?.estimatedDuration,
                    scrollDistance: engine.maxOffset,
                    onClose: { withAnimation { showSettings = false } }
                )
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button {
                            withAnimation { panelOnRight.toggle() }
                        } label: {
                            Image(systemName: panelOnRight ? "sidebar.left" : "sidebar.right")
                        }
                        .accessibilityLabel("Sposta il pannello")
                    }
                }
            }
            .frame(width: min(400, size.width * 0.92))
            .clipShape(RoundedRectangle(cornerRadius: 18))
            .shadow(radius: 20)
            .padding(.vertical, 24)
            .padding(.horizontal, 16)
            if !panelOnRight { Spacer(minLength: 0) }
        }
        .transition(.move(edge: panelOnRight ? .trailing : .leading))
    }

    private var durationBinding: Binding<TimeInterval> {
        Binding(
            get: { script?.effectiveDuration ?? 60 },
            set: { value in
                guard var updated = script else { return }
                updated.targetDuration = value
                scripts.update(updated)
            }
        )
    }

    private var speedText: String {
        switch settings.speedMode {
        case .speed: "\(Int(settings.speed))"
        case .duration: String(format: "×%.2f", engine.speedFactor)
        case .voice: "Voce"
        }
    }

    private var speedCaption: String {
        switch settings.speedMode {
        case .speed: "velocità"
        case .duration: "durata \(formatTime(script?.effectiveDuration ?? 0))"
        case .voice: voiceActive ? "in ascolto" : "segue chi parla"
        }
    }

    // MARK: - Motore

    private func loadParagraphs(_ body: String) {
        paragraphs = ScriptTextView.paragraphs(from: body)
        follower.load(paragraphs: paragraphs)
        session.paragraphs = paragraphs
    }

    private func syncEngine() {
        engine.updateMaxOffset(textHeight)
        switch settings.speedMode {
        case .speed:
            engine.baseSpeed = settings.speed
        case .duration:
            engine.baseSpeed = max(1, textHeight) / max(1, script?.effectiveDuration ?? 60)
        case .voice:
            // Serve solo per stimare il tempo rimanente.
            engine.baseSpeed = max(1, textHeight) / max(1, script?.estimatedDuration ?? 60)
        }
    }

    // MARK: - Voce

    private func updateVoice() {
        let shouldListen = settings.speedMode == .voice && engine.phase == .playing
        if shouldListen && !voiceActive {
            voiceActive = true
            follower.reset(to: wordIndex(forOffset: engine.offset))
            engine.followTarget = engine.offset
            follower.start(localeID: settings.voiceLocale)
        } else if !shouldListen && voiceActive {
            stopVoice()
        }
    }

    private func stopVoice() {
        follower.stop()
        engine.followTarget = nil
        voiceActive = false
    }

    /// Dopo un salto manuale riparte ad ascoltare dal punto in cui si trova il testo.
    private func resyncVoice() {
        guard voiceActive else { return }
        follower.reset(to: wordIndex(forOffset: engine.offset))
        engine.followTarget = engine.offset
    }

    private func offset(forWord index: Int) -> CGFloat {
        guard follower.tokens.indices.contains(index) else { return engine.offset }
        let token = follower.tokens[index]
        guard let frame = paragraphFrames[token.paragraph] else { return engine.offset }
        return frame.minY + token.fraction * frame.height
    }

    private func wordIndex(forOffset offset: CGFloat) -> Int {
        var result = 0
        for (index, token) in follower.tokens.enumerated() {
            guard let frame = paragraphFrames[token.paragraph] else { continue }
            if frame.minY + token.fraction * frame.height <= offset + 1 {
                result = index
            } else {
                break
            }
        }
        return result
    }

    // MARK: - Azioni

    private func togglePlay() {
        if engine.phase == .paused {
            engine.play(countdown: settings.countdown, countdownOnResume: settings.countdownOnResume)
            scheduleHide()
        } else {
            engine.pause()
        }
    }

    private func restart() {
        engine.restart()
        follower.reset(to: 0)
        withAnimation { controlsVisible = true }
    }

    private func jump(_ direction: CGFloat) {
        let step = CGFloat(settings.fontSize * (1 + settings.lineSpacing)) * 3
        engine.jump(by: direction * step)
        resyncVoice()
    }

    private func scheduleHide() {
        hideTask?.cancel()
        hideTask = Task { @MainActor in
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled, engine.phase != .paused, !showSettings else { return }
            withAnimation { controlsVisible = false }
        }
    }

    private func changeSpeed(_ direction: Int) {
        switch settings.speedMode {
        case .speed:
            settingsStore.settings.speed = clamp(settings.speed + Double(direction) * 5, 5, 400)
            showToast("Velocità \(Int(settingsStore.settings.speed))")
        case .duration:
            engine.speedFactor = clamp(engine.speedFactor + Double(direction) * 0.05, 0.25, 3)
            showToast(String(format: "Velocità ×%.2f", engine.speedFactor))
        case .voice:
            showToast("In modalità voce il testo segue chi parla")
        }
    }

    private func showToast(_ text: String, seconds: Double = 1.2) {
        withAnimation { toast = text }
        toastTask?.cancel()
        toastTask = Task { @MainActor in
            try? await Task.sleep(for: .seconds(seconds))
            guard !Task.isCancelled else { return }
            withAnimation { toast = nil }
        }
    }

    private func close() {
        engine.pause()
        dismiss()
    }

    private func perform(_ command: RemoteCommand) {
        switch command {
        case .togglePlay: togglePlay()
        case .faster: changeSpeed(1)
        case .slower: changeSpeed(-1)
        case .back: jump(-1)
        case .forward: jump(1)
        case .restart: restart()
        case .mirrorH: settingsStore.settings.mirrorHorizontal.toggle()
        case .mirrorV: settingsStore.settings.mirrorVertical.toggle()
        }
    }

    private func handleKey(_ key: UIKeyboardHIDUsage) {
        switch key {
        case .keyboardSpacebar, .keyboardReturnOrEnter, .keypadEnter: perform(.togglePlay)
        case .keyboardUpArrow: perform(.faster)
        case .keyboardDownArrow: perform(.slower)
        case .keyboardLeftArrow, .keyboardPageUp: perform(.back)
        case .keyboardRightArrow, .keyboardPageDown: perform(.forward)
        case .keyboardR, .keyboardHome: perform(.restart)
        case .keyboardH: perform(.mirrorH)
        case .keyboardV: perform(.mirrorV)
        case .keyboardEscape: close()
        default: break
        }
    }

    private func sendRemoteStatus() {
        let speedLine: String = switch settings.speedMode {
        case .speed: "Velocità \(Int(settings.speed))"
        case .duration: "Durata \(formatTime(script?.effectiveDuration ?? 0)) · " + String(format: "×%.2f", engine.speedFactor)
        case .voice: "Segue la voce"
        }
        remote.send(RemoteStatus(
            title: script?.title ?? "",
            isPlaying: engine.phase != .paused,
            progress: engine.progress,
            elapsed: engine.elapsed,
            remaining: engine.remaining,
            speedText: speedLine
        ))
    }
}

/// Barra dei comandi per l'operatore (non ribaltata).
struct ControlsBar: View {
    let engine: PrompterEngine
    @Bindable var store: SettingsStore
    let speedText: String
    let speedCaption: String
    var onClose: () -> Void
    var onRestart: () -> Void
    var onTogglePlay: () -> Void
    var onSpeed: (Int) -> Void
    var onSettings: () -> Void

    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var showRemote = false
    private let remote = RemoteHost.shared

    var body: some View {
        let s = store.settings
        let layout = sizeClass == .compact
            ? AnyLayout(VStackLayout(spacing: 12))
            : AnyLayout(HStackLayout(spacing: 28))

        VStack(spacing: 14) {
            HStack(spacing: 12) {
                Text(formatTime(engine.elapsed))
                    .monospacedDigit()
                Slider(value: Binding(get: { engine.progress }, set: { engine.setProgress($0) }))
                Text("-" + formatTime(engine.remaining, roundUp: true))
                    .monospacedDigit()
            }
            .font(.subheadline)

            layout {
                HStack(spacing: 12) {
                    RoundButton(icon: "xmark", action: onClose)
                    RoundButton(icon: "backward.end.fill", action: onRestart)
                    RoundButton(icon: "arrow.left.and.right", active: s.mirrorHorizontal) {
                        store.settings.mirrorHorizontal.toggle()
                    }
                    RoundButton(icon: "arrow.up.and.down", active: s.mirrorVertical) {
                        store.settings.mirrorVertical.toggle()
                    }
                    RoundButton(icon: "iphone.radiowaves.left.and.right", active: !remote.connectedNames.isEmpty) {
                        showRemote = true
                    }
                    .popover(isPresented: $showRemote) {
                        RemoteInfoView()
                            .presentationCompactAdaptation(.popover)
                    }
                    RoundButton(icon: "slider.horizontal.3", action: onSettings)
                }
                HStack(spacing: 12) {
                    RoundButton(icon: "tortoise.fill") { onSpeed(-1) }
                    VStack(spacing: 2) {
                        Text(speedText)
                            .font(.headline)
                            .monospacedDigit()
                        Text(speedCaption)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    .frame(minWidth: 90)
                    RoundButton(icon: "hare.fill") { onSpeed(1) }
                    Button(action: onTogglePlay) {
                        Image(systemName: engine.phase == .paused ? "play.fill" : "pause.fill")
                            .font(.system(size: 28, weight: .bold))
                            .foregroundStyle(.black)
                            .frame(width: 64, height: 64)
                            .background(Circle().fill(Color.accentColor))
                    }
                    .accessibilityLabel(engine.phase == .paused ? "Play" : "Pausa")
                }
            }
        }
        .padding(16)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22))
        .frame(maxWidth: 960)
        .padding(.horizontal, 16)
        .padding(.bottom, 28)
    }
}

struct RoundButton: View {
    let icon: String
    var active = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(active ? Color.black : Color.white)
                .frame(width: 46, height: 46)
                .background(Circle().fill(active ? Color.accentColor : Color.white.opacity(0.14)))
        }
    }
}
