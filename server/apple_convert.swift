import Foundation
import ModelIO

// Controlla che siano stati passati i parametri giusti (input usdz e output obj)
guard CommandLine.arguments.count == 3 else {
    print("❌ Errore: Argomenti mancanti. Uso: swift apple_convert.swift <input.usdz> <output.obj>")
    exit(1)
}

let inputUrl = URL(fileURLWithPath: CommandLine.arguments[1])
let outputUrl = URL(fileURLWithPath: CommandLine.arguments[2])

// Carica il file USDZ usando il motore nativo di Apple ModelIO
let asset = MDLAsset(url: inputUrl)

do {
    // Esporta in OBJ (ModelIO applicherà automaticamente le matrici di scala!)
    try asset.export(to: outputUrl)
    print("✅ Geometria nativa estratta con successo in OBJ!")
} catch {
    print("❌ Errore ModelIO durante l'estrazione: \(error)")
    exit(1)
}