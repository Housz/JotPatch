// Assemble a loadable Firefox add-on directory from the compiled Chrome assets.
// The package mirrors the repository layout, so extension paths
// (dist/content.js, styles/highlight.css, dist/options.js) stay identical and
// the same TypeScript sources serve both browsers.
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

const OUT = 'dist/firefox';
const PACKAGE_FILES = [
  ['dist/content.js', 'dist/content.js'],
  ['dist/background.js', 'dist/background.js'],
  ['dist/options.js', 'dist/options.js'],
  ['styles/highlight.css', 'styles/highlight.css'],
  ['options.html', 'options.html'],
  ['manifest.firefox.json', 'manifest.json']
];

rmSync(OUT, { recursive: true, force: true });
for (const [from, to] of PACKAGE_FILES) {
  mkdirSync(dirname(join(OUT, to)), { recursive: true });
  copyFileSync(from, join(OUT, to));
}
console.log(`JotPatch Firefox package assembled in ${OUT}/ (${PACKAGE_FILES.length} files).`);
console.log('Load it with about:debugging#/runtime/this-firefox -> Load Temporary Add-on -> select dist/firefox/manifest.json');
