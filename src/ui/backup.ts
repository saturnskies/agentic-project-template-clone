import { Capacitor } from '@capacitor/core';
import { backupFileName, BackupError, makeBackup, mergeBackup, parseBackup } from '../lib/backup';
import type { AppContext } from './app';
import { h } from './dom';

/** Saves the backup file: through the share sheet inside the Android app, as a download in a browser. */
async function deliver(text: string, fileName: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const { uri } = await Filesystem.writeFile({ path: fileName, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: 'Swapsmith backup', dialogTitle: 'Save your Swapsmith backup', files: [uri] });
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = h('a', { href: url, download: fileName });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** "Back up" and "Restore" for the home screen: decks live only on this device, so this is the safety net. */
export function backupSection(ctx: AppContext): HTMLElement {
  const status = h('p', { class: 'muted small', 'aria-live': 'polite' });
  const alert = h('p', { class: 'notice', role: 'alert' });

  const backBtn = h('button', { type: 'button', class: 'button' }, 'Back up my decks');
  backBtn.addEventListener('click', async () => {
    alert.textContent = '';
    try {
      await deliver(makeBackup(ctx.store), backupFileName());
      status.textContent = `Backup file made with ${ctx.store.decks.length} deck${ctx.store.decks.length === 1 ? '' : 's'}. Keep it somewhere safe, like Drive or email to yourself.`;
    } catch (e) {
      // Closing the share sheet rejects on some devices; that is not a failure worth shouting about.
      if (!/cancel|dismiss/i.test(String((e as Error)?.message))) alert.textContent = "Couldn't make the backup file. Try again.";
    }
  });

  const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true, 'aria-label': 'Backup file' }) as HTMLInputElement;
  const restoreBtn = h('button', { type: 'button', class: 'button' }, 'Restore from backup');
  restoreBtn.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const picked = file.files?.[0];
    file.value = '';
    if (!picked) return;
    alert.textContent = '';
    try {
      const result = mergeBackup(ctx.store, parseBackup(await picked.text()));
      ctx.replaceStore(result.store);
      ctx.refresh();
      // refresh() rebuilt the screen, so show the outcome on the new one.
      const note = document.querySelector('.backup [aria-live]');
      if (note) note.textContent = `Restored: ${result.added} deck${result.added === 1 ? '' : 's'} added, ${result.updated} updated. Nothing was deleted.`;
    } catch (e) {
      alert.textContent = e instanceof BackupError ? e.message : "Couldn't read that file.";
    }
  });

  return h(
    'section',
    { class: 'backup', 'aria-labelledby': 'backup-h' },
    h('h3', { id: 'backup-h' }, 'Backup and restore'),
    h('p', { class: 'muted small' }, 'Decks are saved on this device only. Make a backup before uninstalling the app or clearing browser data. Restoring adds to what you have and never deletes.'),
    h('div', { class: 'actions' }, backBtn, restoreBtn, file),
    status,
    alert,
  );
}
