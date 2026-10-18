import { readFileSync, statSync } from 'node:fs';
import { parseArgs } from 'node:util';
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
for (const file of [manifest.background.service_worker, 'dist/content.js', 'styles/highlight.css']) {
  if (statSync(file).size === 0) throw new Error(`Empty artifact: ${file}`);
}
console.log('JotPatch build verified: unpacked extension can be loaded from project root.');
