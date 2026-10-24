import { readFileSync, statSync } from 'node:fs';
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const optionsScript = readFileSync('options.html', 'utf8').match(/<script src="([^"]+)"><\/script>/);
const files = [
  manifest.background.service_worker,
  'dist/content.js',
  'dist/options.js',
  'styles/highlight.css',
  optionsScript?.[1]
].filter(Boolean);
for (const file of files) {
  if (statSync(file).size === 0) throw new Error(`Empty artifact: ${file}`);
}
console.log('JotPatch build verified: unpacked Chrome extension can be loaded from project root.');
