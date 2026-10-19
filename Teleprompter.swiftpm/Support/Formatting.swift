import Foundation

/// 75 -> "1:15", 3725 -> "1:02:05".
func formatTime(_ seconds: TimeInterval, roundUp: Bool = false) -> String {
    let value = max(0, seconds)
    let total = Int(roundUp ? value.rounded(.up) : value.rounded(.down))
    let h = total / 3600, m = (total % 3600) / 60, s = total % 60
    return h > 0
        ? String(format: "%d:%02d:%02d", h, m, s)
        : String(format: "%d:%02d", m, s)
}

func clamp<T: Comparable>(_ value: T, _ lower: T, _ upper: T) -> T {
    min(max(value, lower), upper)
}
