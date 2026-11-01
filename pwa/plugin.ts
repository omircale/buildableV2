import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Makes the build open without a connection: writes sw.js with the list of every file the app needs,
 * and the web app manifest that lets a phone install the site like an app.
 *
 * Public files are listed except the ones no screen uses any more (the old furniture decors) and the
 * server's own header rules.
 */
const SKIP_PUBLIC = [/^decors\//, /^_headers$/];

function publicFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(dir, p).split('\\').join('/'));
    }
  };
  walk(dir);
  return out.filter((f) => !SKIP_PUBLIC.some((re) => re.test(f)));
}

export function offlineApp(edition: 'contractors' | 'hospitality'): Plugin {
  let publicDir = '';
  return {
    name: 'buildable-offline',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    generateBundle(_, bundle) {
      const files = [
        '/',
        ...Object.keys(bundle)
          .filter((f) => f !== 'sw.js')
          .map((f) => `/${f}`),
        ...publicFiles(publicDir).map((f) => `/${f}`),
        '/manifest.webmanifest',
      ].sort();
      const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12);
      const source = readFileSync(new URL('./sw.js', import.meta.url), 'utf8').replace('__VERSION__', version).replace('__FILES__', JSON.stringify(files));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });

      const name = edition === 'hospitality' ? 'Buildable — מלונאות' : 'Buildable — סטודיו תכנון';
      const manifest = {
        name,
        short_name: 'Buildable',
        lang: 'he',
        dir: 'rtl',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f6f3ee',
        theme_color: '#9a5b2e',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      };
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: JSON.stringify(manifest, null, 2) });
    },
  };
}
