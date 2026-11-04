/** Keeps the screen on with the Wake Lock API while a game is open. Dependencies are passed in so it can be tested without a browser. */

export type AwakeState = 'on' | 'off' | 'unsupported' | 'denied';

export interface LockSentinel extends EventTarget {
  release(): Promise<void>;
}

export interface AwakeDeps {
  /** `navigator.wakeLock`, or undefined when the browser has none. */
  wakeLock?: { request(type: 'screen'): Promise<LockSentinel> };
  /** The document: its visibility is read live, and the lock is asked for again when the page comes back. */
  doc: EventTarget & { visibilityState: string };
}

/**
 * Asks for the screen lock now and again whenever the page becomes visible without one (the system drops it
 * when the page is hidden). At most one lock is held or being asked for at a time. Nothing here throws: a missing API or a
 * refused request is reported through `onChange` ('unsupported', 'denied') and the game carries on. Returns a function that
 * releases the lock and stops listening; it is safe to call twice, and a lock that arrives after it is released at once.
 */
export function keepAwake(deps: AwakeDeps, onChange: (state: AwakeState) => void): () => void {
  let active = true;
  let sentinel: LockSentinel | null = null;
  let asking = false;

  const release = (s: LockSentinel) =>
    Promise.resolve()
      .then(() => s.release())
      .catch(() => {});

  async function acquire() {
    if (!active || sentinel || asking) return;
    if (!deps.wakeLock) return onChange('unsupported');
    if (deps.doc.visibilityState === 'hidden') return;
    asking = true;
    try {
      const s = await deps.wakeLock.request('screen');
      if (!active) {
        await release(s);
        return;
      }
      sentinel = s;
      s.addEventListener('release', () => {
        if (sentinel !== s) return;
        sentinel = null;
        onChange('off');
      });
      onChange('on');
    } catch {
      if (active) onChange('denied');
    } finally {
      asking = false;
    }
  }

  const onVisible = () => {
    if (deps.doc.visibilityState === 'visible') void acquire();
  };
  deps.doc.addEventListener('visibilitychange', onVisible);
  void acquire();

  return () => {
    if (!active) return;
    active = false;
    deps.doc.removeEventListener('visibilitychange', onVisible);
    const s = sentinel;
    sentinel = null;
    if (s) void release(s);
  };
}
