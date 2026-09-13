import { useEffect, useState } from 'react';

/**
 * A clock the render can read.
 *
 * Anything that asks "what is today?" — the habit statuses, the noon catch-up
 * cut-off, the 12-week grid's rightmost column — depends on the current time,
 * and reading `Date.now()` straight from a render body is both impure and
 * frozen: a screen left open across midnight would keep showing yesterday.
 * This ticks instead, so those surfaces roll over on their own.
 *
 * `intervalMs` is how coarse the caller's answer can afford to be: a minute for
 * the Today card (whose copy changes at noon and midnight), several for a
 * history grid.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
