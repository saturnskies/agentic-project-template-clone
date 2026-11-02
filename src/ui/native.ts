import { Capacitor } from '@capacitor/core';
import { backTarget } from '../lib/nav';

/**
 * Inside the Android app, the system back gesture (swipe from the screen edge) or button goes to
 * "Your decks" from any other screen, and leaves the app only from there. Browsers keep their own back.
 */
export async function installNativeBack(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const { App } = await import('@capacitor/app');
  await App.addListener('backButton', () => {
    const open = document.querySelector<HTMLDialogElement>('dialog[open]');
    if (open) {
      open.close();
      return;
    }
    const target = backTarget(location.hash);
    if (target) location.replace(target);
    else void App.exitApp();
  });
}
