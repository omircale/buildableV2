/**
 * Whether an address is the home page's. Anything that is not shaped like one of this app's pages
 * counts as home too: a sign-in link comes back as `#access_token=…`, and that is the auth client's to
 * read, not a page that went missing.
 */
export function isHome(route: string): boolean {
  return !route.startsWith('#/') || route === '#/' || route.startsWith('#/?');
}
