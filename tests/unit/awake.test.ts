import { describe, expect, it } from 'vitest';
import { keepAwake, type AwakeState } from '../../src/lib/awake';

/** A fake screen lock sentinel, and a wakeLock API that hands them out and counts. */
function fakes(opts: { reject?: boolean; hidden?: boolean; supported?: boolean; delay?: boolean; failRelease?: boolean } = {}) {
  class Sentinel extends EventTarget {
    released = 0;
    async release() {
      this.released++;
      if (opts.failRelease) throw new Error('already released');
      this.dispatchEvent(new Event('release'));
    }
  }
  const sentinels: Sentinel[] = [];
  let pending: Array<() => void> = [];
  const log = { requests: 0 };
  const wakeLock = {
    request: async (_type: 'screen') => {
      log.requests++;
      if (opts.delay) await new Promise<void>((r) => pending.push(r));
      if (opts.reject) throw new Error('NotAllowedError');
      const s = new Sentinel();
      sentinels.push(s);
      return s;
    },
  };
  const doc = Object.assign(new EventTarget(), { visibilityState: (opts.hidden ? 'hidden' : 'visible') as DocumentVisibilityState });
  const states: AwakeState[] = [];
  const deps = { wakeLock: opts.supported === false ? undefined : wakeLock, doc };
  const settle = async () => {
    pending.forEach((r) => r());
    pending = [];
    await new Promise((r) => setTimeout(r, 0));
  };
  const visibility = async (v: DocumentVisibilityState) => {
    doc.visibilityState = v;
    doc.dispatchEvent(new Event('visibilitychange'));
    await settle();
  };
  return { deps, states, onChange: (s: AwakeState) => states.push(s), sentinels, log, settle, visibility };
}

describe('keepAwake', () => {
  it('asks for the screen lock once and reports it on', async () => {
    const f = fakes();
    keepAwake(f.deps, f.onChange);
    await f.settle();
    expect(f.log.requests).toBe(1);
    expect(f.states).toEqual(['on']);
  });

  it('reports a browser without the API as unsupported, and stopping is safe', async () => {
    const f = fakes({ supported: false });
    const stop = keepAwake(f.deps, f.onChange);
    await f.settle();
    expect(f.states).toEqual(['unsupported']);
    expect(() => stop()).not.toThrow();
  });

  it('reports a refused request as denied, and tries again when the page comes back', async () => {
    const f = fakes({ reject: true });
    keepAwake(f.deps, f.onChange);
    await f.settle();
    expect(f.states).toEqual(['denied']);
    await f.visibility('visible');
    expect(f.log.requests).toBe(2);
  });

  it('never holds two locks: coming back to the page while one is held asks for nothing', async () => {
    const f = fakes();
    keepAwake(f.deps, f.onChange);
    await f.settle();
    await f.visibility('visible');
    await f.visibility('visible');
    expect(f.log.requests).toBe(1);
  });

  it('never sends a second request while the first is still waiting', async () => {
    const f = fakes({ delay: true });
    keepAwake(f.deps, f.onChange);
    await f.visibility('visible');
    await f.visibility('visible');
    expect(f.log.requests).toBe(1);
  });

  it('asks again after the system takes the lock away (page hidden), once the page is visible', async () => {
    const f = fakes();
    keepAwake(f.deps, f.onChange);
    await f.settle();
    f.sentinels[0].dispatchEvent(new Event('release'));
    expect(f.states).toEqual(['on', 'off']);
    await f.visibility('hidden');
    expect(f.log.requests).toBe(1);
    await f.visibility('visible');
    expect(f.log.requests).toBe(2);
    expect(f.states).toEqual(['on', 'off', 'on']);
  });

  it('waits for the page to be visible before asking at all', async () => {
    const f = fakes({ hidden: true });
    keepAwake(f.deps, f.onChange);
    await f.settle();
    expect(f.log.requests).toBe(0);
    await f.visibility('visible');
    expect(f.log.requests).toBe(1);
  });

  it('releases the lock when stopped, once, and stops listening', async () => {
    const f = fakes();
    const stop = keepAwake(f.deps, f.onChange);
    await f.settle();
    stop();
    stop();
    await f.settle();
    expect(f.sentinels[0].released).toBe(1);
    expect(f.states).toEqual(['on']);
    await f.visibility('visible');
    expect(f.log.requests).toBe(1);
  });

  it('releases a lock that arrives after we were stopped, and never reports it on', async () => {
    const f = fakes({ delay: true });
    const stop = keepAwake(f.deps, f.onChange);
    stop();
    await f.settle();
    expect(f.sentinels[0].released).toBe(1);
    expect(f.states).toEqual([]);
  });

  it('does not throw when releasing fails', async () => {
    const f = fakes({ failRelease: true });
    const stop = keepAwake(f.deps, f.onChange);
    await f.settle();
    expect(() => stop()).not.toThrow();
    await f.settle();
  });
});
