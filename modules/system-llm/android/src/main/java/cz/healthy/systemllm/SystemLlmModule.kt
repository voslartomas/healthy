package cz.healthy.systemllm

import com.google.mlkit.genai.common.DownloadStatus
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.GenerativeModel
import com.google.mlkit.genai.prompt.SystemInstruction
import com.google.mlkit.genai.prompt.TextPart
import com.google.mlkit.genai.prompt.generateContentRequest
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * The OS's own on-device language model, exposed to JS (ADR-008).
 *
 * Android: Gemini Nano, served by the AICore system service through the ML Kit
 * GenAI Prompt API. The model lives in the OS — the app downloads nothing
 * itself (AICore may fetch/update Nano on its own schedule; [download] only
 * asks it to start). Inference never leaves the device.
 *
 * The JS side (src/features/coach/ondevice/systemLlm.ts) drives a stateless
 * contract shared with the iOS module: `status`, `download`, `warmup`,
 * `generate(system, prompt, options)`. Each `generate` is one self-contained
 * request — the coach renders the conversation into the prompt itself — so no
 * session state lives here.
 */
class SystemLlmModule : Module() {
  /** One client for the process; AICore multiplexes it. Created lazily so the
   * module's construction never touches AICore (it may not be initialised yet on
   * a freshly set-up device). */
  private var client: GenerativeModel? = null

  /**
   * Serializes generation. AICore enforces per-app quotas and Gemini Nano runs
   * one request at a time; overlapping callers (the daily brief racing the first
   * chat message) would otherwise get "busy"/quota errors instead of queuing.
   */
  private val lock = Mutex()

  private fun model(): GenerativeModel = client ?: Generation.getClient().also { client = it }

  /**
   * Whether this device's Gemini Nano honours a separate system instruction.
   * Not all do: on a Xiaomi 17 (nano-v2) AICore logs "Feature … is not available"
   * and silently DROPS the system instruction — the model then answered "Write my
   * brief for today." with a generic offer to help, never having seen the health
   * data or the JSON action protocol. When unsupported, the instructions are
   * folded into the prompt instead (the same shape Gemma needed). Asked once.
   */
  private var systemPromptSupported: Boolean? = null

  @Suppress("DEPRECATION")
  private suspend fun supportsSystemPrompt(m: GenerativeModel): Boolean =
    systemPromptSupported
      ?: runCatching { m.isSystemPromptAvailable() }.getOrDefault(false)
        .also { systemPromptSupported = it }

  override fun definition() = ModuleDefinition {
    Name("SystemLlm")

    Events("onDownloadProgress")

    /** "available" | "downloadable" | "downloading" | "unavailable", plus a
     * short reason when unavailable and the model's name when known. */
    AsyncFunction("status") Coroutine { ->
      try {
        val m = model()
        val status = when (m.checkStatus()) {
          FeatureStatus.AVAILABLE -> "available"
          FeatureStatus.DOWNLOADABLE -> "downloadable"
          FeatureStatus.DOWNLOADING -> "downloading"
          else -> "unavailable"
        }
        // Always "Gemini Nano" for the UI: getBaseModelName() returns AICore's
        // internal id (e.g. "nano-v2"), which means nothing to a user.
        mapOf(
          "status" to status,
          "reason" to if (status == "unavailable") "deviceNotEligible" else null,
          "modelName" to "Gemini Nano",
        )
      } catch (e: Throwable) {
        // AICore missing, not yet initialised (fresh/reset device), or an
        // unlocked bootloader — all mean "can't use it right now". Report it as
        // a status rather than throwing, so the UI can say so plainly.
        mapOf(
          "status" to "unavailable",
          "reason" to "error",
          "message" to (e.message ?: e.javaClass.simpleName),
          "modelName" to "Gemini Nano",
        )
      }
    }

    /** Ask AICore to fetch Gemini Nano. Resolves when it's ready; progress is
     * emitted as `onDownloadProgress` events. */
    AsyncFunction("download") Coroutine { ->
      var failure: Throwable? = null
      model().download().collect { s ->
        when (s) {
          is DownloadStatus.DownloadProgress ->
            sendEvent("onDownloadProgress", mapOf("bytes" to s.totalBytesDownloaded))
          is DownloadStatus.DownloadFailed -> failure = s.e
          else -> Unit
        }
      }
      failure?.let { throw SystemLlmException("Gemini Nano download failed: ${it.message}", it) }
      true
    }

    /** Load Nano into memory ahead of the first request (cuts first-token latency). */
    AsyncFunction("warmup") Coroutine { ->
      runCatching { model().warmup() }.isSuccess
    }

    /** One completion: `system` as the system instruction, `prompt` as the user
     * text. Returns the first candidate's text. */
    AsyncFunction("generate") Coroutine { system: String, prompt: String, options: Map<String, Any?> ->
      val temperature = (options["temperature"] as? Number)?.toFloat() ?: 0.3f
      val maxTokens = (options["maxOutputTokens"] as? Number)?.toInt() ?: 512
      lock.withLock {
        try {
          val m = model()
          val request = if (system.isBlank()) {
            generateContentRequest(TextPart(prompt)) {
              this.temperature = temperature
              this.maxOutputTokens = maxTokens
            }
          } else if (supportsSystemPrompt(m)) {
            generateContentRequest(SystemInstruction(system), TextPart(prompt)) {
              this.temperature = temperature
              this.maxOutputTokens = maxTokens
            }
          } else {
            // See [systemPromptSupported]: put the instructions ahead of the
            // conversation so the model actually reads them.
            generateContentRequest(TextPart("$system\n\n$prompt")) {
              this.temperature = temperature
              this.maxOutputTokens = maxTokens
            }
          }
          val response = m.generateContent(request)
          response.candidates.firstOrNull()?.text ?: ""
        } catch (e: Throwable) {
          throw SystemLlmException(e.message ?: e.javaClass.simpleName, e)
        }
      }
    }

    OnDestroy {
      runCatching { client?.close() }
      client = null
    }
  }
}

internal class SystemLlmException(message: String, cause: Throwable?) :
  CodedException("ERR_SYSTEM_LLM", message, cause)
