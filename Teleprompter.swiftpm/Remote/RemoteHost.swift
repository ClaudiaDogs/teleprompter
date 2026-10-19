import Foundation
import MultipeerConnectivity
import Observation
import UIKit

/// Lato iPad: mentre il prompter è aperto si rende visibile ai telecomandi vicini
/// (Wi-Fi o Bluetooth, senza internet) e accetta solo chi conosce il PIN.
@Observable
final class RemoteHost: NSObject {
    static let shared = RemoteHost()

    private(set) var pin = ""
    private(set) var connectedNames: [String] = []

    @ObservationIgnored var onCommand: ((RemoteCommand) -> Void)?
    @ObservationIgnored private let peerID = MCPeerID(displayName: UIDevice.current.name)
    @ObservationIgnored private var session: MCSession?
    @ObservationIgnored private var advertiser: MCNearbyServiceAdvertiser?

    func start() {
        guard advertiser == nil else { return }
        pin = String(format: "%04d", Int.random(in: 0...9999))
        let session = MCSession(peer: peerID, securityIdentity: nil, encryptionPreference: .required)
        session.delegate = self
        self.session = session
        let advertiser = MCNearbyServiceAdvertiser(peer: peerID, discoveryInfo: nil, serviceType: remoteServiceType)
        advertiser.delegate = self
        advertiser.startAdvertisingPeer()
        self.advertiser = advertiser
    }

    func stop() {
        advertiser?.stopAdvertisingPeer()
        advertiser = nil
        session?.disconnect()
        session = nil
        connectedNames = []
    }

    func send(_ status: RemoteStatus) {
        guard let session, !session.connectedPeers.isEmpty,
              let data = try? JSONEncoder().encode(RemoteMessage.status(status)) else { return }
        try? session.send(data, toPeers: session.connectedPeers, with: .unreliable)
    }
}

extension RemoteHost: MCNearbyServiceAdvertiserDelegate {
    func advertiser(_ advertiser: MCNearbyServiceAdvertiser,
                    didReceiveInvitationFromPeer peerID: MCPeerID,
                    withContext context: Data?,
                    invitationHandler: @escaping (Bool, MCSession?) -> Void) {
        let receivedPIN = context.flatMap { String(data: $0, encoding: .utf8) }
        DispatchQueue.main.async {
            let accepted = receivedPIN == self.pin && self.session != nil
            invitationHandler(accepted, accepted ? self.session : nil)
        }
    }
}

extension RemoteHost: MCSessionDelegate {
    func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
        let names = session.connectedPeers.map(\.displayName)
        DispatchQueue.main.async { self.connectedNames = names }
    }

    func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
        guard let message = try? JSONDecoder().decode(RemoteMessage.self, from: data),
              case .command(let command) = message else { return }
        DispatchQueue.main.async { self.onCommand?(command) }
    }

    func session(_ session: MCSession, didReceive stream: InputStream, withName streamName: String, fromPeer peerID: MCPeerID) {}
    func session(_ session: MCSession, didStartReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, with progress: Progress) {}
    func session(_ session: MCSession, didFinishReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, at localURL: URL?, withError error: Error?) {}
}
