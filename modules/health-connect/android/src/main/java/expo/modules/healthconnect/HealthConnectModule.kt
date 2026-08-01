package expo.modules.healthconnect

import android.content.Context
import android.content.Intent
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.time.Duration
import java.time.Instant
import kotlin.reflect.KClass

/**
 * Read-only bridge to Android Health Connect (androidx.health.connect). Promotes
 * the HEA-13 spike probe into a production Expo module. The privacy boundary is
 * enforced structurally: this module only ever *reads*, and it returns aggregate
 * records tagged with their source package so the TS derivation layer can
 * de-duplicate across origins (see src/health/derive.ts).
 *
 * Correctness rules confirmed by HEA-13 and honored here:
 *  - SDK availability is a hard gate (getSdkStatus) before any read.
 *  - Every record type is read in its own try/catch, so one revoked permission
 *    (SecurityException) degrades only that metric, never the whole read.
 *  - High-frequency types (steps, HRV) are paginated via pageToken with a page
 *    cap; steps/energy use a bounded recent window to stay well under the cap.
 */
class HealthConnectModule : Module() {

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val requiredPermissions = setOf(
    HealthPermission.getReadPermission(StepsRecord::class),
    HealthPermission.getReadPermission(HeartRateVariabilityRmssdRecord::class),
    HealthPermission.getReadPermission(RestingHeartRateRecord::class),
    HealthPermission.getReadPermission(SleepSessionRecord::class),
    HealthPermission.getReadPermission(ExerciseSessionRecord::class),
    HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
  )

  override fun definition() = ModuleDefinition {
    Name("HealthConnect")

    AsyncFunction("getSdkStatus") {
      when (HealthConnectClient.getSdkStatus(context)) {
        HealthConnectClient.SDK_AVAILABLE -> "available"
        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "update_required"
        else -> "unavailable"
      }
    }

    AsyncFunction("getGrantedPermissions") Coroutine { ->
      if (HealthConnectClient.getSdkStatus(context) != HealthConnectClient.SDK_AVAILABLE) {
        return@Coroutine emptyList<String>()
      }
      val client = HealthConnectClient.getOrCreate(context)
      client.permissionController.getGrantedPermissions().toList()
    }

    // Interim UX: open the Health Connect permission screen so the user can grant
    // reads, then report what is currently granted. The polished in-app
    // permission-contract flow is tracked as a follow-up issue.
    AsyncFunction("requestPermissions") Coroutine { ->
      if (HealthConnectClient.getSdkStatus(context) != HealthConnectClient.SDK_AVAILABLE) {
        return@Coroutine emptyList<String>()
      }
      try {
        // Health Connect settings screen; the user manages app read grants here.
        val intent = Intent("androidx.health.ACTION_HEALTH_CONNECT_SETTINGS").apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
      } catch (_: Throwable) {
        // Best effort; fall through to reporting current grants.
      }
      val client = HealthConnectClient.getOrCreate(context)
      client.permissionController.getGrantedPermissions().toList()
    }

    AsyncFunction("readAll") Coroutine { startMs: Double, endMs: Double ->
      readAll(startMs.toLong(), endMs.toLong())
    }
  }

  private suspend fun readAll(startMs: Long, endMs: Long): Map<String, Any> {
    val client = HealthConnectClient.getOrCreate(context)
    val start = Instant.ofEpochMilli(startMs)
    val end = Instant.ofEpochMilli(endMs)
    // Bounded recent window for high-frequency interval types (avoids the 1000
    // record page cap dominating; 8 days covers "today" and "this week").
    val recentStart = maxOf(start, end.minus(Duration.ofDays(8)))

    val sources = HashSet<String>()

    val hrv = safeRead(sources) {
      readRecords(client, HeartRateVariabilityRmssdRecord::class, start, end, maxPages = 3)
        .map {
          instantSample(it.heartRateVariabilityMillis, it.time, it.metadata.dataOrigin.packageName)
        }
    }
    val restingHr = safeRead(sources) {
      readRecords(client, RestingHeartRateRecord::class, start, end, maxPages = 2)
        .map {
          instantSample(it.beatsPerMinute.toDouble(), it.time, it.metadata.dataOrigin.packageName)
        }
    }
    val sleep = safeRead(sources) {
      readRecords(client, SleepSessionRecord::class, start, end, maxPages = 2)
        .map {
          val src = it.metadata.dataOrigin.packageName
          mapOf(
            "start" to it.startTime.toEpochMilli().toDouble(),
            "end" to it.endTime.toEpochMilli().toDouble(),
            "durationMin" to Duration.between(it.startTime, it.endTime).toMinutes().toDouble(),
            "source" to src,
          )
        }
    }
    val steps = safeRead(sources) {
      readRecords(client, StepsRecord::class, recentStart, end, maxPages = 12)
        .map {
          val src = it.metadata.dataOrigin.packageName
          mapOf(
            "count" to it.count.toDouble(),
            "start" to it.startTime.toEpochMilli().toDouble(),
            "end" to it.endTime.toEpochMilli().toDouble(),
            "source" to src,
          )
        }
    }
    val exercise = safeRead(sources) {
      readRecords(client, ExerciseSessionRecord::class, start, end, maxPages = 3)
        .map {
          val src = it.metadata.dataOrigin.packageName
          mapOf(
            "exerciseType" to it.exerciseType.toDouble(),
            "start" to it.startTime.toEpochMilli().toDouble(),
            "end" to it.endTime.toEpochMilli().toDouble(),
            "durationMin" to Duration.between(it.startTime, it.endTime).toMinutes().toDouble(),
            "energyKcal" to null,
            "source" to src,
          )
        }
    }
    val activeEnergy = safeRead(sources) {
      readRecords(client, ActiveCaloriesBurnedRecord::class, recentStart, end, maxPages = 12)
        .map {
          val src = it.metadata.dataOrigin.packageName
          mapOf(
            "kcal" to it.energy.inKilocalories,
            "start" to it.startTime.toEpochMilli().toDouble(),
            "end" to it.endTime.toEpochMilli().toDouble(),
            "source" to src,
          )
        }
    }

    return mapOf(
      "hrvRmssd" to hrv,
      "restingHr" to restingHr,
      "sleep" to sleep,
      "steps" to steps,
      "exercise" to exercise,
      "activeEnergy" to activeEnergy,
      "sources" to sources.toList(),
      "readAt" to end.toEpochMilli().toDouble(),
    )
  }

  private fun instantSample(value: Double, time: Instant, source: String): Map<String, Any> =
    mapOf("value" to value, "time" to time.toEpochMilli().toDouble(), "source" to source)

  /** Run a per-type read, swallowing SecurityException (revoked permission) so a
   * single denied type degrades to an empty list instead of failing the batch. */
  private inline fun safeRead(
    sources: HashSet<String>,
    block: () -> List<Map<String, Any?>>,
  ): List<Map<String, Any?>> {
    return try {
      val records = block()
      for (r in records) {
        (r["source"] as? String)?.let { sources.add(it) }
      }
      records
    } catch (_: SecurityException) {
      emptyList()
    } catch (_: Throwable) {
      emptyList()
    }
  }

  private suspend fun <T : Record> readRecords(
    client: HealthConnectClient,
    type: KClass<T>,
    start: Instant,
    end: Instant,
    maxPages: Int,
  ): List<T> {
    val out = ArrayList<T>()
    var token: String? = null
    var pages = 0
    do {
      val response = client.readRecords(
        ReadRecordsRequest(
          recordType = type,
          timeRangeFilter = TimeRangeFilter.between(start, end),
          pageSize = 1000,
          pageToken = token,
        ),
      )
      out.addAll(response.records)
      token = response.pageToken
      pages += 1
    } while (token != null && pages < maxPages)
    return out
  }
}
