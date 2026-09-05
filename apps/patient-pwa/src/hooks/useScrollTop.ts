import { useEffect } from 'react';

/**
 * Send the page back to the top whenever the screen changes.
 *
 * A patient who scrolled to the bottom of one screen should not land halfway
 * down the next one. Pass whatever identifies the screen: a route path, a step
 * number, a flag for a sub-screen.
 */
export function useScrollTop(...deps: unknown[]): void {
  useEffect(() => {
    window.scrollTo(0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
