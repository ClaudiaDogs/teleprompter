// swift-tools-version: 5.9

// Progetto in formato "App playground": si apre con Swift Playgrounds su iPad
// oppure con Xcode su Mac.

import PackageDescription
import AppleProductTypes

let package = Package(
    name: "Teleprompter",
    platforms: [
        .iOS("17.0")
    ],
    products: [
        .iOSApplication(
            name: "Teleprompter",
            targets: ["AppModule"],
            bundleIdentifier: "com.slimdogsproduction.teleprompter",
            teamIdentifier: "",
            displayVersion: "1.0",
            bundleVersion: "1",
            appIcon: .placeholder(icon: .tv),
            accentColor: .presetColor(.orange),
            supportedDeviceFamilies: [
                .pad,
                .phone
            ],
            supportedInterfaceOrientations: [
                .portrait,
                .landscapeRight,
                .landscapeLeft,
                .portraitUpsideDown(.when(deviceFamilies: [.pad]))
            ],
            capabilities: [
                .localNetwork(
                    purposeString: "Serve per collegare l'iPhone come telecomando del teleprompter.",
                    bonjourServiceTypes: ["_tlprompter._tcp", "_tlprompter._udp"]
                ),
                .microphone(purposeString: "Serve per far scorrere il testo seguendo la tua voce."),
                .speechRecognition(purposeString: "Serve per riconoscere le parole che leggi e far scorrere il testo con la tua voce.")
            ]
        )
    ],
    targets: [
        .executableTarget(
            name: "AppModule",
            path: "."
        )
    ]
)
