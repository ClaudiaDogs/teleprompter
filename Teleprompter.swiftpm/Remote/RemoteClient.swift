import Foundation
import MultipeerConnectivity
import Observation
import UIKit

/// Lato telecomando (iPhone): trova gli iPad con il prompter aperto e invia i comandi.
@Observable
final class RemoteClient: NSObject {
    enum State: Equatable {
        case browsing, connecting, connected
    }

    private(set) var peers: [MCPeerID] = []
    private(set) var state: State = .browsing
    private(set) var status: RemoteStatus?
    private(set) var errorMessage: String?

    @ObservationIgnored private let peerID = MCPeerID(displayName: UIDevice.current.name)
    @ObservationIgnored private var session: MCSession?
    @ObservationIgnored private var browser: MCNearbyServiceBrowser?

    func start() {
        guard browser == nil else { return }
        let session = MCSession(peer: peerID, securityIdentity: nil, encryptionPreference: .required)
        session.delegate = self
        self.session = session
        let browser = MCNearbyServiceBrowser(peer: peerID, serviceType: remoteServiceType)
        browser.delegate = self
        browser.startBrowsingForPeers()
        self.browser = browser
        state = .browsing
    }

    func stop() {
        browser?.stopBrowsingForPeers()
        browser = nil
        session?.disconnect()
        session = nil
        peers = []
        status = nil
        state = .browsing
    }

    func connect(to peer: MCPeerID, pin: String) {
        guard let session, let browser else { return }
        errorMessage = nil
        state = .connecting
        browser.invitePeer(peer, to: session, withContext: pin.data(using: .utf8), timeout: 10)
    }

    func disconnect() {
        session?.disconnect()
        status = nil
        state = .browsing
    }

    func send(_ command: RemoteCommand) {
        guard let session, !session.connectedPeers.isEmpty,
              let data = try? JSONEncoder().encode(RemoteMessage.command(command)) else { return }
        try? session.send(data, toPeers: session.connectedPeers, with: .reliable)
    }
}

extension RemoteClient: MCNearbyServiceBrowserDelegate {
    func browser(_ browser: MCNearbyServiceBrowser, foundPeer peerID: MCPeerID, withDiscoveryInfo info: [String: String]?) {
        DispatchQueue.main.async {
            if !self.peers.contains(peerID) { self.peers.append(peerID) }
        }
    }

    func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {
        DispatchQueue.main.async { self.peers.removeAll { $0 == peerID } }
    }
}

extension RemoteClient: MCSessionDelegate {
    func session(_ session: MCSession, peer peerID: MCPeerID, didChange newState: MCSessionState) {
        DispatchQueue.main.async {
            switch newState {
            case .connected:
                self.state = .connected
                self.errorMessage = nil
            case .notConnected:
                if self.state == .connecting {
                    self.errorMessage = "Connessione rifiutata: controlla il PIN e che il teleprompter sia aperto sull'iPad."
                }
                if session.connectedPeers.isEmpty {
                    self.state = .browsing
                    self.status = nil
                }
            case .connecting:
                break
            @unknown default:
                break
            }
        }
    }

    func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
        guard let message = try? JSONDecoder().decode(RemoteMessage.self, from: data),
              case .status(let status) = message else { return }
        DispatchQueue.main.async { self.status = status }
    }

    func session(_ session: MCSession, didReceive stream: InputStream, withName streamName: String, fromPeer peerID: MCPeerID) {}
    func session(_ session: MCSession, didStartReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, with progress: Progress) {}
    func session(_ session: MCSession, didFinishReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, at localURL: URL?, withError error: Error?) {}
}
