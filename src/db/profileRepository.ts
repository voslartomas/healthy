import { EMPTY_PROFILE, Sex, UserProfile } from '../state/useProfileStore';
import { getDb } from './database';

/**
 * Persistence for the single-row user {@link UserProfile} (the `profile` table,
 * pinned to `id = 1`). The only place that knows this schema; callers work with
 * plain {@link UserProfile} objects.
 */

interface ProfileRow {
  date_of_birth: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  sex: string | null;
}

function rowToProfile(row: ProfileRow): UserProfile {
  const sex = row.sex;
  return {
    dateOfBirth: row.date_of_birth ?? null,
    heightCm: row.height_cm ?? null,
    weightKg: row.weight_kg ?? null,
    sex:
      sex === 'male' || sex === 'female' || sex === 'other'
        ? (sex as Sex)
        : null,
  };
}

/** Load the saved profile, or {@link EMPTY_PROFILE} when none has been saved. */
export async function loadProfile(): Promise<UserProfile> {
  const db = await getDb();
  const row = await db.getFirstAsync<ProfileRow>(
    'SELECT date_of_birth, height_cm, weight_kg, sex FROM profile WHERE id = 1;',
  );
  return row ? rowToProfile(row) : EMPTY_PROFILE;
}

/** Upsert the single profile row. */
export async function saveProfile(profile: UserProfile): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO profile (id, date_of_birth, height_cm, weight_kg, sex, updated_at)
     VALUES (1, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       date_of_birth = excluded.date_of_birth,
       height_cm     = excluded.height_cm,
       weight_kg     = excluded.weight_kg,
       sex           = excluded.sex,
       updated_at    = excluded.updated_at;`,
    profile.dateOfBirth,
    profile.heightCm,
    profile.weightKg,
    profile.sex,
    Date.now(),
  );
}
