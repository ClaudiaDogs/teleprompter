import UIKit
import Observation

/// Motore di scorrimento: avanza il testo a ogni fotogramma dello schermo (fino a 120 Hz)
/// e gestisce conto alla rovescia e tempo trascorso.
@Observable
final class PrompterEngine {
    enum Phase: Equatable {
        case paused, countingDown, playing
    }

    var phase: Phase = .paused
    /// Quanti punti di testo sono già passati sopra la linea guida.
    var offset: CGFloat = 0
    /// Altezza totale del testo: a questo punto l'ultima riga ha superato la linea guida.
    private(set) var maxOffset: CGFloat = 1
    var elapsed: TimeInterval = 0
    var countdownRemaining = 0
    /// Velocità base in punti al secondo (dalle impostazioni o calcolata dalla durata).
    var baseSpeed: CGFloat = 60
    /// Correzione al volo in modalità durata (frecce su/giù o pulsanti +/-).
    var speedFactor: Double = 1
    /// Modalità voce: posizione verso cui il testo scorre dolcemente al posto della velocità fissa.
    @ObservationIgnored var followTarget: CGFloat?

    var effectiveSpeed: CGFloat { baseSpeed * speedFactor }
    var progress: Double { maxOffset > 0 ? Double(offset / maxOffset) : 0 }
    var remaining: TimeInterval {
        effectiveSpeed > 0 ? Double((maxOffset - offset) / effectiveSpeed) : 0
    }
    var isAtEnd: Bool { offset >= maxOffset - 0.5 }

    @ObservationIgnored private var link: CADisplayLink?
    @ObservationIgnored private var lastTimestamp: CFTimeInterval?
    @ObservationIgnored private var countdownEnd: CFTimeInterval = 0
    @ObservationIgnored private var hasStarted = false

    deinit {
        link?.invalidate()
    }

    func play(countdown: Int, countdownOnResume: Bool) {
        guard phase == .paused else { return }
        if isAtEnd { restart() }
        let useCountdown = countdown > 0 && (!hasStarted || countdownOnResume)
        hasStarted = true
        if useCountdown {
            countdownEnd = CACurrentMediaTime() + Double(countdown)
            countdownRemaining = countdown
            phase = .countingDown
        } else {
            phase = .playing
        }
        startLink()
    }

    func pause() {
        phase = .paused
        stopLink()
    }

    func restart() {
        pause()
        offset = 0
        elapsed = 0
        speedFactor = 1
        hasStarted = false
    }

    func setOffset(_ value: CGFloat) {
        offset = clamp(value, 0, maxOffset)
    }

    func jump(by delta: CGFloat) {
        setOffset(offset + delta)
    }

    func setProgress(_ value: Double) {
        setOffset(CGFloat(value) * maxOffset)
    }

    /// Quando cambia l'altezza del testo (carattere, margini...) mantiene il punto di lettura.
    func updateMaxOffset(_ value: CGFloat) {
        let newMax = max(1, value)
        if maxOffset > 1 { offset *= newMax / maxOffset }
        maxOffset = newMax
        offset = clamp(offset, 0, maxOffset)
    }

    // MARK: - Display link

    private func startLink() {
        stopLink()
        lastTimestamp = nil
        let proxy = DisplayLinkProxy { [weak self] link in self?.tick(link) }
        let link = CADisplayLink(target: proxy, selector: #selector(DisplayLinkProxy.tick(_:)))
        link.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120)
        link.add(to: .main, forMode: .common)
        self.link = link
    }

    private func stopLink() {
        link?.invalidate()
        link = nil
    }

    private func tick(_ link: CADisplayLink) {
        let now = link.timestamp
        let dt = min(lastTimestamp.map { now - $0 } ?? 0, 0.1)
        lastTimestamp = now

        switch phase {
        case .countingDown:
            let left = countdownEnd - CACurrentMediaTime()
            if left <= 0 {
                countdownRemaining = 0
                phase = .playing
            } else {
                let seconds = Int(left.rounded(.up))
                if seconds != countdownRemaining { countdownRemaining = seconds }
            }
        case .playing:
            elapsed += dt
            if let target = followTarget {
                let step = (target - offset) * min(1, CGFloat(dt) * 4)
                offset = clamp(offset + step, 0, maxOffset)
            } else {
                offset = min(maxOffset, offset + effectiveSpeed * CGFloat(dt))
            }
            if offset >= maxOffset { pause() }
        case .paused:
            stopLink()
        }
    }
}

/// CADisplayLink vuole un target Objective-C: questo oggetto fa da ponte senza trattenere il motore.
private final class DisplayLinkProxy: NSObject {
    let handler: (CADisplayLink) -> Void

    init(_ handler: @escaping (CADisplayLink) -> Void) {
        self.handler = handler
    }

    @objc func tick(_ link: CADisplayLink) {
        handler(link)
    }
}
