import Foundation

/// Nome del servizio Bonjour (max 15 caratteri). Deve coincidere con NSBonjourServices in Package.swift.
let remoteServiceType = "tlprompter"

enum RemoteCommand: String, Codable {
    case togglePlay, faster, slower, back, forward, restart, mirrorH, mirrorV
}

/// Stato del prompter che l'iPad manda al telecomando quattro volte al secondo.
struct RemoteStatus: Codable, Equatable {
    var title: String
    var isPlaying: Bool
    var progress: Double
    var elapsed: TimeInterval
    var remaining: TimeInterval
    var speedText: String
}

enum RemoteMessage: Codable {
    case command(RemoteCommand)
    case status(RemoteStatus)
}
