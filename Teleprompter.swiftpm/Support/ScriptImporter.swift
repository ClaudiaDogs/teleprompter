import Foundation
import PDFKit
import UniformTypeIdentifiers

/// Legge uno script da file: testo semplice, Markdown, RTF/RTFD, HTML e PDF.
enum ScriptImporter {
    enum ImportError: LocalizedError {
        case unreadable
        case empty

        var errorDescription: String? {
            switch self {
            case .unreadable: "il file non è leggibile"
            case .empty: "il file non contiene testo"
            }
        }
    }

    static var allowedTypes: [UTType] {
        var types: [UTType] = [.plainText, .text, .rtf, .rtfd, .flatRTFD, .html, .pdf]
        if let markdown = UTType("net.daringfireball.markdown") { types.append(markdown) }
        return types
    }

    static func load(from url: URL) throws -> Script {
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }

        let type = UTType(filenameExtension: url.pathExtension) ?? .plainText
        let raw: String

        if type.conforms(to: .pdf) {
            guard let document = PDFDocument(url: url) else { throw ImportError.unreadable }
            raw = document.string ?? ""
        } else if type.conforms(to: .rtf) || type.conforms(to: .rtfd) || type.conforms(to: .flatRTFD) {
            raw = try NSAttributedString(url: url, options: [:], documentAttributes: nil).string
        } else if type.conforms(to: .html) {
            raw = try NSAttributedString(
                url: url,
                options: [
                    .documentType: NSAttributedString.DocumentType.html,
                    .characterEncoding: String.Encoding.utf8.rawValue
                ],
                documentAttributes: nil
            ).string
        } else {
            raw = try readPlainText(url)
        }

        let text = normalize(raw)
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw ImportError.empty }
        return Script(title: url.deletingPathExtension().lastPathComponent, body: text)
    }

    private static func readPlainText(_ url: URL) throws -> String {
        let data = try Data(contentsOf: url)
        for encoding in [String.Encoding.utf8, .utf16, .windowsCP1252, .isoLatin1] {
            if let text = String(data: data, encoding: encoding) { return text }
        }
        throw ImportError.unreadable
    }

    private static func normalize(_ text: String) -> String {
        text.replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
            .replacingOccurrences(of: "\u{2028}", with: "\n")
            .replacingOccurrences(of: "\u{2029}", with: "\n")
            .replacingOccurrences(of: "\u{FEFF}", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
