import ExpoModulesCore
#if canImport(FoundationModels)
import FoundationModels
#endif

/**
 * The OS's own on-device language model, exposed to JS (ADR-008).
 *
 * iOS: Apple Intelligence's system model through the Foundation Models
 * framework (iOS 26+, Apple Intelligence–capable iPhones with it switched on).
 * The model is part of the OS — nothing is downloaded by the app, and inference
 * never leaves the device.
 *
 * Same stateless contract as the Android module: `status`, `download`,
 * `warmup`, `generate(system, prompt, options)`. Each `generate` opens a fresh
 * `LanguageModelSession` with the system text as its instructions — the coach
 * renders the conversation into the prompt itself, so no transcript is kept
 * here.
 *
 * Everything that touches FoundationModels is behind `canImport` +
 * `@available`, so the module still builds with an older SDK / deployment
 * target and simply reports "unavailable".
 */
public class SystemLlmModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SystemLlm")

    Events("onDownloadProgress")

    AsyncFunction("status") { () -> [String: Any?] in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        return AppleModel.status()
      }
      #endif
      return ["status": "unavailable", "reason": "osTooOld", "modelName": "Apple Intelligence"]
    }

    /// iOS manages the model itself (it downloads after Apple Intelligence is
    /// switched on); there's nothing an app can trigger.
    AsyncFunction("download") { () -> Bool in
      return false
    }

    AsyncFunction("warmup") { () -> Bool in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        AppleModel.prewarm()
        return true
      }
      #endif
      return false
    }

    AsyncFunction("generate") { (system: String, prompt: String, options: [String: Any]) async throws -> String in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        let temperature = (options["temperature"] as? Double) ?? 0.3
        let maxTokens = (options["maxOutputTokens"] as? Int) ?? 512
        return try await AppleModel.generate(
          system: system, prompt: prompt, temperature: temperature, maxTokens: maxTokens)
      }
      #endif
      throw SystemLlmUnavailable()
    }
  }
}

struct SystemLlmUnavailable: Error, LocalizedError {
  var errorDescription: String? { "Apple Intelligence is not available on this device." }
}

#if canImport(FoundationModels)
@available(iOS 26.0, *)
enum AppleModel {
  static func status() -> [String: Any?] {
    switch SystemLanguageModel.default.availability {
    case .available:
      return ["status": "available", "modelName": "Apple Intelligence"]
    case .unavailable(let reason):
      switch reason {
      case .modelNotReady:
        // Apple Intelligence is on but the model is still downloading/updating.
        return ["status": "downloading", "reason": "modelNotReady", "modelName": "Apple Intelligence"]
      case .appleIntelligenceNotEnabled:
        return ["status": "unavailable", "reason": "notEnabled", "modelName": "Apple Intelligence"]
      case .deviceNotEligible:
        return ["status": "unavailable", "reason": "deviceNotEligible", "modelName": "Apple Intelligence"]
      @unknown default:
        return ["status": "unavailable", "reason": "error", "modelName": "Apple Intelligence"]
      }
    }
  }

  static func prewarm() {
    LanguageModelSession().prewarm()
  }

  static func generate(system: String, prompt: String, temperature: Double, maxTokens: Int)
    async throws -> String
  {
    let session = LanguageModelSession(instructions: system)
    let options = GenerationOptions(temperature: temperature, maximumResponseTokens: maxTokens)
    let response = try await session.respond(to: prompt, options: options)
    return response.content
  }
}
#endif
