import Foundation
import AVFoundation
import Speech
import Observation

/// Ascolta chi legge e trova nello script la parola appena pronunciata.
/// Usa il riconoscimento vocale sul dispositivo quando la lingua lo permette (niente internet).
@Observable
final class VoiceFollower {
    enum Status: Equatable {
        case idle, listening, denied
        case unavailable(String)
    }

    struct Token {
        let text: String
        let paragraph: Int
        /// Posizione della parola dentro il paragrafo, da 0 a 1.
        let fraction: CGFloat
    }

    private(set) var status: Status = .idle
    /// Indice in `tokens` dell'ultima parola riconosciuta.
    private(set) var currentWord = 0

    @ObservationIgnored private(set) var tokens: [Token] = []
    @ObservationIgnored private let audioEngine = AVAudioEngine()
    @ObservationIgnored private var recognizer: SFSpeechRecognizer?
    @ObservationIgnored private var request: SFSpeechAudioBufferRecognitionRequest?
    @ObservationIgnored private var task: SFSpeechRecognitionTask?
    @ObservationIgnored private var active = false

    func load(paragraphs: [String]) {
        tokens = Self.tokenize(paragraphs)
        currentWord = 0
    }

    func reset(to word: Int) {
        currentWord = clamp(word, 0, max(0, tokens.count - 1))
    }

    // MARK: - Avvio e arresto

    func start(localeID: String) {
        guard !active else { return }
        active = true
        SFSpeechRecognizer.requestAuthorization { authorization in
            DispatchQueue.main.async {
                guard self.active else { return }
                guard authorization == .authorized else { return self.fail(.denied) }
                AVAudioApplication.requestRecordPermission { granted in
                    DispatchQueue.main.async {
                        guard self.active else { return }
                        guard granted else { return self.fail(.denied) }
                        self.beginListening(localeID: localeID)
                    }
                }
            }
        }
    }

    func stop() {
        active = false
        task?.cancel()
        task = nil
        request?.endAudio()
        request = nil
        if audioEngine.isRunning { audioEngine.stop() }
        audioEngine.inputNode.removeTap(onBus: 0)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        if status == .listening { status = .idle }
    }

    private func fail(_ status: Status) {
        stop()
        self.status = status
    }

    private func beginListening(localeID: String) {
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeID)), recognizer.isAvailable else {
            return fail(.unavailable("Riconoscimento vocale non disponibile per questa lingua"))
        }
        self.recognizer = recognizer
        do {
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
            try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

            let input = audioEngine.inputNode
            input.removeTap(onBus: 0)
            input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { [weak self] buffer, _ in
                self?.request?.append(buffer)
            }
            audioEngine.prepare()
            try audioEngine.start()
            status = .listening
            startRecognition()
        } catch {
            fail(.unavailable("Microfono non disponibile: \(error.localizedDescription)"))
        }
    }

    /// Un riconoscimento termina da solo dopo una pausa o dopo circa un minuto: lo si riavvia
    /// finché l'ascolto è attivo. Per l'aggancio contano solo le ultime parole, quindi non si perde il punto.
    private func startRecognition() {
        guard active, let recognizer else { return }
        task?.cancel()
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.taskHint = .dictation
        if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
        self.request = request

        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            DispatchQueue.main.async {
                guard let self, self.active, request === self.request else { return }
                if let result { self.handle(result.bestTranscription.formattedString) }
                if error != nil || (result?.isFinal ?? false) {
                    request.endAudio()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { self.startRecognition() }
                }
            }
        }
    }

    // MARK: - Aggancio al testo

    private func handle(_ transcription: String) {
        let heard = Self.words(in: transcription)
        guard !heard.isEmpty, !tokens.isEmpty else { return }
        let tail = Array(heard.suffix(4))
        let lower = max(0, currentWord - 2)
        let upper = min(tokens.count - 1, currentWord + 40)
        guard lower <= upper else { return }

        // Per ogni possibile posizione confronta le ultime parole sentite con le parole dello
        // script che finiscono lì. L'ultima parola vale doppio. A parità vince la più vicina.
        var best: (index: Int, score: Int)?
        for end in lower...upper {
            var score = 0
            for k in 0..<tail.count {
                let scriptIndex = end - k
                guard scriptIndex >= 0 else { break }
                if Self.matches(tail[tail.count - 1 - k], tokens[scriptIndex].text) {
                    score += k == 0 ? 2 : 1
                }
            }
            if score > (best?.score ?? 0) { best = (end, score) }
        }

        guard let best else { return }
        let needed = tail.count >= 3 ? 3 : 2
        guard best.score >= needed, best.index >= currentWord else { return }
        // Un salto lungo richiede quasi tutte le parole in accordo.
        if best.index - currentWord > 15 && best.score < 4 { return }
        currentWord = best.index
    }

    static func matches(_ heard: String, _ written: String) -> Bool {
        if heard == written { return true }
        guard heard.count >= 4, written.count >= 4 else { return false }
        return heard.hasPrefix(written) || written.hasPrefix(heard)
    }

    static func normalize(_ word: String) -> String {
        word.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil).lowercased()
    }

    static func words(in text: String) -> [String] {
        text.split(whereSeparator: { !($0.isLetter || $0.isNumber) }).map { normalize(String($0)) }
    }

    static func tokenize(_ paragraphs: [String]) -> [Token] {
        var tokens: [Token] = []
        for (paragraph, text) in paragraphs.enumerated() {
            let length = CGFloat(max(1, text.count))
            var current = ""
            var start = 0
            for (index, character) in text.enumerated() {
                if character.isLetter || character.isNumber {
                    if current.isEmpty { start = index }
                    current.append(character)
                } else if !current.isEmpty {
                    tokens.append(Token(text: normalize(current), paragraph: paragraph, fraction: CGFloat(start) / length))
                    current = ""
                }
            }
            if !current.isEmpty {
                tokens.append(Token(text: normalize(current), paragraph: paragraph, fraction: CGFloat(start) / length))
            }
        }
        return tokens
    }
}
