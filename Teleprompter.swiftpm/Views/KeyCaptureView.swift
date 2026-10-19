import SwiftUI
import UIKit

/// Riceve i tasti da tastiere e telecomandi Bluetooth (page turner, pedali) mentre il prompter è aperto.
struct KeyCaptureView: UIViewRepresentable {
    var onKey: (UIKeyboardHIDUsage) -> Void

    func makeUIView(context: Context) -> KeyCaptureUIView {
        let view = KeyCaptureUIView()
        view.onKey = onKey
        return view
    }

    func updateUIView(_ view: KeyCaptureUIView, context: Context) {
        view.onKey = onKey
        view.claimFocus()
    }
}

final class KeyCaptureUIView: UIView {
    var onKey: ((UIKeyboardHIDUsage) -> Void)?

    override var canBecomeFirstResponder: Bool { true }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        claimFocus()
    }

    func claimFocus() {
        DispatchQueue.main.async { [weak self] in
            guard let self, self.window != nil, !self.isFirstResponder else { return }
            self.becomeFirstResponder()
        }
    }

    override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        var handled = false
        for press in presses {
            if let key = press.key {
                onKey?(key.keyCode)
                handled = true
            }
        }
        if !handled { super.pressesBegan(presses, with: event) }
    }
}
