import SwiftUI

struct TextHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

/// Posizione di ogni paragrafo dentro il testo: serve allo scorrimento a voce.
struct ParagraphFramesKey: PreferenceKey {
    static var defaultValue: [Int: CGRect] = [:]
    static func reduce(value: inout [Int: CGRect], nextValue: () -> [Int: CGRect]) {
        value.merge(nextValue()) { $1 }
    }
}

/// Ciò che vede chi legge: testo, linea guida, timer e conto alla rovescia.
/// Tutto è disegnato "dritto"; il ribaltamento per lo specchio viene applicato
/// dall'esterno all'intera scena.
struct PrompterStage: View {
    let paragraphs: [String]
    @Bindable var store: SettingsStore
    let engine: PrompterEngine
    let size: CGSize
    /// In pausa con i comandi visibili: linea guida e timer si possono trascinare.
    let editable: Bool
    /// Ribaltamento effettivo di questa scena, per far seguire il dito ai trascinamenti.
    let mirrorH: Bool
    let mirrorV: Bool
    /// Ingrandimento del testo (monitor esterno).
    var fontScale: Double = 1
    /// Se presente, l'avanzamento segue la percentuale del motore su questa altezza di testo
    /// (monitor esterno, con proporzioni diverse dall'iPad).
    var progressHeight: CGFloat? = nil

    @State private var guideDragStart: Double?
    @State private var timerDragStart: CGPoint?

    var body: some View {
        let s = scaled(store.settings)
        let offset = progressHeight.map { CGFloat(engine.progress) * $0 } ?? engine.offset
        let top = size.height * s.marginTop
        let bottom = size.height * s.marginBottom
        let left = size.width * s.marginLeft
        let right = size.width * s.marginRight
        let areaHeight = max(1, size.height - top - bottom)
        let textWidth = max(80, size.width - left - right)
        let eyeY = size.height * s.guidePosition
        let startY = clamp(eyeY - top, 0, areaHeight)

        ZStack(alignment: .topLeading) {
            Color.black

            if s.guideEnabled {
                GuideView(settings: s, width: size.width, editable: editable)
                    .gesture(guideDrag, including: editable ? .all : [])
                    .position(x: size.width / 2, y: eyeY)
            }

            ScriptTextView(
                paragraphs: paragraphs,
                font: s.font,
                lineSpacing: s.fontSize * s.lineSpacing,
                color: s.textColor.color,
                alignment: s.alignment
            )
            .equatable()
            .frame(width: textWidth)
            .fixedSize(horizontal: false, vertical: true)
            .background(GeometryReader { geo in
                Color.clear.preference(key: TextHeightKey.self, value: geo.size.height)
            })
            .offset(y: startY - offset)
            .frame(width: textWidth, height: areaHeight, alignment: .top)
            .clipped()
            .offset(x: left, y: top)
            .allowsHitTesting(false)

            if s.timerEnabled {
                TimerLabel(engine: engine, settings: s, editable: editable)
                    .gesture(timerDrag, including: editable ? .all : [])
                    .position(x: s.timerX * size.width, y: s.timerY * size.height)
            }

            if engine.phase == .countingDown {
                CountdownView(value: engine.countdownRemaining, diameter: min(size.width, size.height) * 0.45)
                    .position(x: size.width / 2, y: size.height / 2)
                    .allowsHitTesting(false)
            }
        }
        .frame(width: size.width, height: size.height, alignment: .topLeading)
    }

    private func scaled(_ settings: PrompterSettings) -> PrompterSettings {
        guard fontScale != 1 else { return settings }
        var copy = settings
        copy.fontSize *= fontScale
        copy.timerSize *= fontScale
        return copy
    }

    // Le traslazioni sono lette nello spazio dello schermo e poi invertite se lo schermo
    // è ribaltato, così l'oggetto segue sempre il dito.
    private var guideDrag: some Gesture {
        DragGesture(minimumDistance: 2, coordinateSpace: .global)
            .onChanged { value in
                let start = guideDragStart ?? store.settings.guidePosition
                guideDragStart = start
                let dy = value.translation.height * (mirrorV ? -1 : 1)
                store.settings.guidePosition = clamp(start + dy / size.height, 0.05, 0.95)
            }
            .onEnded { _ in guideDragStart = nil }
    }

    private var timerDrag: some Gesture {
        DragGesture(minimumDistance: 2, coordinateSpace: .global)
            .onChanged { value in
                let start = timerDragStart ?? CGPoint(x: store.settings.timerX, y: store.settings.timerY)
                timerDragStart = start
                let dx = value.translation.width * (mirrorH ? -1 : 1)
                let dy = value.translation.height * (mirrorV ? -1 : 1)
                store.settings.timerX = clamp(start.x + dx / size.width, 0.03, 0.97)
                store.settings.timerY = clamp(start.y + dy / size.height, 0.03, 0.97)
            }
            .onEnded { _ in timerDragStart = nil }
    }
}

/// Il testo diviso in paragrafi: ogni paragrafo è disegnato a parte, così anche
/// script molto lunghi restano fluidi.
struct ScriptTextView: View, Equatable {
    let paragraphs: [String]
    let font: Font
    let lineSpacing: CGFloat
    let color: Color
    let alignment: TextAlign

    var body: some View {
        VStack(alignment: alignment.horizontal, spacing: lineSpacing) {
            ForEach(paragraphs.indices, id: \.self) { index in
                Text(paragraphs[index])
                    .font(font)
                    .lineSpacing(lineSpacing)
                    .foregroundStyle(color)
                    .multilineTextAlignment(alignment.textAlignment)
                    .frame(maxWidth: .infinity, alignment: alignment.frameAlignment)
                    .fixedSize(horizontal: false, vertical: true)
                    .background(GeometryReader { geo in
                        Color.clear.preference(
                            key: ParagraphFramesKey.self,
                            value: [index: geo.frame(in: .named("scriptText"))]
                        )
                    })
            }
        }
        .coordinateSpace(name: "scriptText")
    }

    static func paragraphs(from text: String) -> [String] {
        text.components(separatedBy: "\n").map { $0.isEmpty ? " " : $0 }
    }
}

struct GuideView: View {
    let settings: PrompterSettings
    let width: CGFloat
    let editable: Bool

    var body: some View {
        let color = settings.guideColor.color
        let bandHeight = settings.fontSize * (1.3 + settings.lineSpacing)
        let height = max(44, settings.guideStyle == .band ? bandHeight : 44)

        ZStack {
            switch settings.guideStyle {
            case .line:
                Rectangle().fill(color).frame(height: 3)
            case .arrows:
                HStack {
                    ArrowShape().fill(color).frame(width: 30, height: 36)
                    Spacer()
                    ArrowShape().fill(color).frame(width: 30, height: 36).scaleEffect(x: -1)
                }
                .padding(.horizontal, 8)
            case .band:
                Rectangle().fill(color.opacity(0.3)).frame(height: bandHeight)
            }
        }
        .opacity(settings.guideOpacity)
        .frame(width: width, height: height)
        .overlay {
            if editable {
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Color.white.opacity(0.5), style: StrokeStyle(lineWidth: 1.5, dash: [8, 6]))
                    .padding(.horizontal, 4)
            }
        }
        .contentShape(Rectangle())
    }
}

struct ArrowShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}

struct TimerLabel: View {
    let engine: PrompterEngine
    let settings: PrompterSettings
    let editable: Bool

    var body: some View {
        let remaining = engine.remaining
        let text = label(remaining: remaining)
        let warning = settings.timerMode != .elapsed && remaining < 10 && engine.phase == .playing

        Text(text)
            .font(.system(size: settings.timerSize, weight: .semibold, design: .rounded).monospacedDigit())
            .foregroundStyle(warning ? Color.red : Color.white)
            .padding(.horizontal, settings.timerSize * 0.35)
            .padding(.vertical, settings.timerSize * 0.15)
            .background {
                if editable {
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(Color.white.opacity(0.6), style: StrokeStyle(lineWidth: 1.5, dash: [6, 4]))
                }
            }
            .opacity(settings.timerOpacity)
            .fixedSize()
            .contentShape(Rectangle())
    }

    private func label(remaining: TimeInterval) -> String {
        switch settings.timerMode {
        case .elapsed: formatTime(engine.elapsed)
        case .remaining: "-" + formatTime(remaining, roundUp: true)
        case .both: formatTime(engine.elapsed) + "  -" + formatTime(remaining, roundUp: true)
        }
    }
}

struct CountdownView: View {
    let value: Int
    let diameter: CGFloat

    var body: some View {
        Text("\(value)")
            .font(.system(size: diameter * 0.6, weight: .bold, design: .rounded).monospacedDigit())
            .foregroundStyle(.white)
            .frame(width: diameter, height: diameter)
            .background(Circle().fill(Color.black.opacity(0.9)))
            .overlay(Circle().stroke(Color.white.opacity(0.4), lineWidth: 4))
    }
}
