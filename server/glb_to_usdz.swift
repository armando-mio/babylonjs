import Foundation
import SceneKit

// ========================================
// GLB → USDZ Converter via Apple SceneKit
// ========================================
// Uso: swift glb_to_usdz.swift <input.glb> <output.usdz>
// Funziona solo su macOS 12.0+ con SceneKit

guard CommandLine.arguments.count == 3 else {
    print("❌ Uso: swift glb_to_usdz.swift <input.glb> <output.usdz>")
    exit(1)
}

let inputPath = CommandLine.arguments[1]
let outputPath = CommandLine.arguments[2]

let inputUrl = URL(fileURLWithPath: inputPath)
let outputUrl = URL(fileURLWithPath: outputPath)

// Verifica che il file di input esista
guard FileManager.default.fileExists(atPath: inputPath) else {
    print("❌ File non trovato: \(inputPath)")
    exit(1)
}

print("🔄 Caricamento GLB: \(inputPath)")

do {
    // SceneKit può importare GLB/glTF nativamente su macOS
    let scene = try SCNScene(url: inputUrl, options: [
        .checkConsistency: true
    ])
    
    print("✅ Scena caricata. Nodi: \(scene.rootNode.childNodes.count)")
    
    // Esporta come USDZ (formato determinato dall'estensione)
    let success = scene.write(to: outputUrl, options: nil, delegate: nil, progressHandler: nil)
    
    if success {
        // Verifica che il file sia stato creato
        if FileManager.default.fileExists(atPath: outputPath) {
            let attrs = try FileManager.default.attributesOfItem(atPath: outputPath)
            let size = attrs[.size] as? Int64 ?? 0
            print("✅ USDZ generato: \(outputPath) (\(size / 1024) KB)")
        } else {
            print("❌ File USDZ non trovato dopo write()")
            exit(1)
        }
    } else {
        print("❌ SceneKit write() ha restituito false")
        exit(1)
    }
    
} catch {
    print("❌ Errore durante la conversione: \(error.localizedDescription)")
    exit(1)
}
