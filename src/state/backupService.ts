import {
  BackupData,
  exportBackup,
  importBackup,
  isBackupData,
} from '../db/backupRepository';
import { initCalorieGoals } from './calorieGoalsService';
import { initCommonFoods } from './commonFoodsService';
import { initConversations } from './conversationsService';
import { initDailyEnergy } from './dailyEnergyService';
import { initGoalHistory } from './goalHistoryService';
import { initGoals } from './goalsService';
import { initProfile } from './profileService';
import { initStrength } from './strengthService';
import { useHealthStore } from './useHealthStore';

/**
 * Cloud backup + restore, wired to the OS share sheet and document picker.
 *
 * "Backup" writes the local database ({@link exportBackup}) to a JSON file and
 * opens the system share sheet, from which the user picks Google Drive / Files /
 * anywhere. "Restore" opens the document picker, reads the chosen JSON back into
 * SQLite ({@link importBackup}) and re-hydrates every in-memory store so the UI
 * reflects the restored data without a relaunch.
 *
 * The native modules (expo-file-system, expo-sharing, expo-document-picker) are
 * loaded lazily via require() at call time — exactly like the optional native
 * health module — so importing this file never pulls a native dependency into a
 * unit test or a platform where it isn't installed. They are only reached when
 * the user actually taps Back up / Restore on a device build.
 */

export interface BackupResult {
  ok: boolean;
  /** True when the user dismissed the share sheet / picker (not an error). */
  canceled?: boolean;
  /** Human-readable failure reason. */
  error?: string;
}

/* eslint-disable @typescript-eslint/no-require-imports */
function loadFileSystem(): {
  cacheDirectory: string | null;
  documentDirectory: string | null;
  writeAsStringAsync: (uri: string, contents: string) => Promise<void>;
  readAsStringAsync: (uri: string) => Promise<string>;
} {
  return require('expo-file-system/legacy');
}

function loadSharing(): {
  isAvailableAsync: () => Promise<boolean>;
  shareAsync: (uri: string, opts?: Record<string, unknown>) => Promise<void>;
} {
  return require('expo-sharing');
}

function loadDocumentPicker(): {
  getDocumentAsync: (opts?: Record<string, unknown>) => Promise<{
    canceled: boolean;
    assets?: { uri: string; name?: string }[];
  }>;
} {
  return require('expo-document-picker');
}
/* eslint-enable @typescript-eslint/no-require-imports */

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Reload every store that reads from a backed-up table, so a restore lands in
 * the UI immediately. Health is refreshed too (goals feed its weekly rollups). */
async function rehydrateStores(): Promise<void> {
  await Promise.all([
    initProfile(),
    initGoals(),
    initCalorieGoals(),
    initCommonFoods(),
    initDailyEnergy(),
    initConversations(),
    initStrength(),
  ]);
  // Goal history depends on goals being present, so run it after.
  await initGoalHistory();
  await useHealthStore.getState().refresh();
}

/** Filename stamp "2026-08-13" from an epoch ms (UTC date). */
function dateStamp(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * Export the local database to a JSON file and open the share sheet to save it
 * (Google Drive, Files, etc.). Returns `{ ok }` once the sheet is presented.
 */
export async function createBackup(
  now: number = Date.now(),
): Promise<BackupResult> {
  try {
    const data: BackupData = await exportBackup(now);
    const json = JSON.stringify(data);

    const FileSystem = loadFileSystem();
    const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
    if (!dir) return { ok: false, error: 'No writable directory available.' };
    const uri = `${dir}healthy-backup-${dateStamp(now)}.json`;
    await FileSystem.writeAsStringAsync(uri, json);

    const Sharing = loadSharing();
    if (!(await Sharing.isAvailableAsync())) {
      return {
        ok: false,
        error: `Backup saved on-device but sharing is unavailable. File: ${uri}`,
      };
    }
    await Sharing.shareAsync(uri, {
      mimeType: 'application/json',
      dialogTitle: 'Save Healthy backup',
      UTI: 'public.json',
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: message(err) };
  }
}

/**
 * Pick a previously exported JSON backup and restore it into the database,
 * then re-hydrate every store. Overwrites the backed-up tables with the file's
 * contents. Returns `{ canceled: true }` if the user dismisses the picker.
 */
export async function restoreBackup(): Promise<BackupResult> {
  try {
    const DocumentPicker = loadDocumentPicker();
    const res = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
      copyToCacheDirectory: true,
    });
    if (res.canceled) return { ok: false, canceled: true };
    const asset = res.assets?.[0];
    if (!asset?.uri) return { ok: false, error: 'No file selected.' };

    const FileSystem = loadFileSystem();
    const raw = await FileSystem.readAsStringAsync(asset.uri);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'That file is not valid JSON.' };
    }
    if (!isBackupData(parsed)) {
      return { ok: false, error: 'That file is not a Healthy backup.' };
    }

    await importBackup(parsed);
    await rehydrateStores();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: message(err) };
  }
}
