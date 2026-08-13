import { loadProfile, saveProfile } from '../db/profileRepository';
import { UserProfile, useProfileStore } from './useProfileStore';

/**
 * Bridges the SQLite {@link ../db/profileRepository} and the in-memory
 * {@link useProfileStore}, mirroring the goals/calorie-goal services: hydrate on
 * launch, and persist-then-update on every edit.
 */

/** Load the persisted profile into the store on app start. */
export async function initProfile(): Promise<void> {
  const profile = await loadProfile();
  useProfileStore.getState().setProfile(profile);
}

/**
 * Apply a partial profile edit: merge in memory, then persist the full row.
 * Returns the resulting profile.
 */
export async function updateProfile(
  patch: Partial<UserProfile>,
): Promise<UserProfile> {
  useProfileStore.getState().patchProfile(patch);
  const next = useProfileStore.getState().profile;
  await saveProfile(next);
  return next;
}
