/** Where "back" goes from a route (hash without the #); null means we are home and back leaves the app. */
export function backTarget(route: string): string | null {
  const r = route.replace(/^#/, '') || '/';
  return r === '/' ? null : '#/';
}
