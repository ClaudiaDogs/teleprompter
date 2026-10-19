import Foundation

struct Script: Identifiable, Codable, Hashable {
    var id = UUID()
    var title: String
    var body: String
    var createdAt = Date()
    var updatedAt = Date()
    /// Durata scelta per lo script (modalità "Durata"). nil = stima dalle parole.
    var targetDuration: TimeInterval?

    var wordCount: Int {
        body.split(whereSeparator: { $0.isWhitespace || $0.isNewline }).count
    }

    /// Stima a circa 150 parole al minuto, ritmo medio del parlato.
    var estimatedDuration: TimeInterval {
        max(10, (Double(wordCount) / 150.0 * 60.0).rounded())
    }

    var effectiveDuration: TimeInterval { targetDuration ?? estimatedDuration }
}

extension Script {
    static let sample = Script(
        title: "Benvenuto",
        body: """
        Benvenuto nel Teleprompter.

        Questo è uno script di prova. Tocca lo schermo per avviare o mettere in pausa lo scorrimento.

        Trascina il testo con un dito per andare avanti o indietro. Quando sei in pausa puoi trascinare anche la linea guida e il timer per spostarli.

        Con una tastiera o un telecomando Bluetooth:
        Spazio o Invio: play e pausa.
        Freccia su e freccia giù: più veloce o più lento.
        Freccia sinistra e destra, Pagina su e Pagina giù: indietro e avanti.
        R: ricomincia dall'inizio.
        H e V: ribalta in orizzontale e in verticale.
        Esc: chiudi.

        Buona registrazione!
        """
    )
}
