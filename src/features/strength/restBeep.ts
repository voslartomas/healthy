/**
 * Rest-timer cue sound. Isolated here so the runner never imports the native
 * audio API directly: playback is best-effort and fully guarded, so a missing
 * or unmockable native module (as under Jest, whose expo-audio mock has no
 * `createAudioPlayer`) degrades to silence instead of throwing.
 */

// A single reused player instance; created lazily on first play.
let player: { play: () => void; seekTo: (s: number) => void } | null = null;
let tried = false;

/** Play the short rest-over beep. No-op if audio can't be initialised. */
export function playRestBeep(): void {
  try {
    if (!player && !tried) {
      tried = true;
      // Lazy require so importing the runner in tests never pulls native audio.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const audio = require('expo-audio') as {
        createAudioPlayer?: (
          src: number,
        ) => { play: () => void; seekTo: (s: number) => void };
      };
      if (typeof audio.createAudioPlayer === 'function') {
        const beep = require('../../../assets/exercises/beep.wav');
        player = audio.createAudioPlayer(beep);
      }
    }
    if (player) {
      // Rewind so rapid consecutive rests each play from the start.
      player.seekTo(0);
      player.play();
    }
  } catch {
    // Best-effort: never let a cue-sound failure disrupt the workout.
  }
}
