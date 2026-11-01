/**
 * Whose work this browser is holding.
 *
 * Everything the app keeps locally is kept under the account that is signed in, so two people who
 * share a computer do not open each other's rooms. With nobody signed in the work is kept under no
 * name at all, exactly where it always was.
 *
 * The first time an account signs in on a browser that already holds unnamed work, that work becomes
 * the account's and stops being anybody's: it was made by the person who then signed in, and leaving a
 * copy behind would hand it to whoever uses the browser next. An account that already has work on this
 * browser is not overwritten, and the unnamed work is not thrown away either — it stays where it was
 * and is there again after signing out.
 */
let ownerId: string | null = null;
const reloaders: (() => void)[] = [];
const bases = new Set<string>();

/** The storage key a piece of work lives under for whoever is signed in now. */
export function ownedKey(base: string): string {
  bases.add(base);
  return ownerId ? `${base}:${ownerId}` : base;
}

/** A store says how to read itself again when the person changes. */
export function onOwnerChange(reload: () => void): void {
  reloaders.push(reload);
}

export function currentOwner(): string | null {
  return ownerId;
}

export function setOwner(next: string | null): void {
  if (next === ownerId) return;
  ownerId = next;
  if (next) {
    try {
      for (const base of bases) {
        const mine = `${base}:${next}`;
        const unnamed = localStorage.getItem(base);
        if (unnamed == null) continue;
        if (localStorage.getItem(mine) != null) continue;
        localStorage.setItem(mine, unnamed);
        localStorage.removeItem(base);
      }
    } catch {
      // Storage blocked: the account simply starts empty on this browser.
    }
  }
  for (const reload of reloaders) reload();
}
