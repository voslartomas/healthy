import { create } from 'zustand';

/**
 * User-entered profile: the pieces the native health sources can't always give
 * us. Age (from {@link dateOfBirth}) is what turns raw workout heart-rate into
 * training zones (220 − age ⇒ HRmax; see src/health/hrZones.ts) — Health Connect
 * exposes no birth date, so the user supplies it. Height/weight/sex are optional
 * manual fallbacks used when no scale/HealthKit characteristic is available.
 *
 * Every field is nullable: the app only ever shows real, known data, and each
 * value is entered independently. Persisted in SQLite (single-row `profile`
 * table) via {@link ../db/profileRepository}.
 */

export type Sex = 'male' | 'female' | 'other';

export interface UserProfile {
  /** Epoch ms (local midnight) of the user's birth date; null when unset. */
  dateOfBirth: number | null;
  heightCm: number | null;
  /** Manual body-weight fallback (kg); live scale data still wins in trends. */
  weightKg: number | null;
  sex: Sex | null;
}

export const EMPTY_PROFILE: UserProfile = {
  dateOfBirth: null,
  heightCm: null,
  weightKg: null,
  sex: null,
};

interface ProfileState {
  profile: UserProfile;
  hydrated: boolean;
  /** Replace the whole profile (used on hydration from SQLite). */
  setProfile: (profile: UserProfile) => void;
  /** Merge a partial update into the current profile in memory. */
  patchProfile: (patch: Partial<UserProfile>) => void;
}

export const useProfileStore = create<ProfileState>(set => ({
  profile: EMPTY_PROFILE,
  hydrated: false,
  setProfile: profile => set({ profile, hydrated: true }),
  patchProfile: patch =>
    set(state => ({ profile: { ...state.profile, ...patch } })),
}));

/** Whole years from a birth date to `now` (calendar-accurate — not a 365.25-day
 * approximation), or null when no birth date / an implausible value is set. */
export function ageFromDob(
  dateOfBirth: number | null,
  now: number = Date.now(),
): number | null {
  if (dateOfBirth == null || !Number.isFinite(dateOfBirth)) return null;
  const b = new Date(dateOfBirth);
  const n = new Date(now);
  let age = n.getFullYear() - b.getFullYear();
  const monthDelta = n.getMonth() - b.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && n.getDate() < b.getDate())) {
    age -= 1;
  }
  return age > 0 && age < 120 ? age : null;
}

/** The current user's age (whole years) from the live profile, or null. */
export function profileAge(now: number = Date.now()): number | null {
  return ageFromDob(useProfileStore.getState().profile.dateOfBirth, now);
}
