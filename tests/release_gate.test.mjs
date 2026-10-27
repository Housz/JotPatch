import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// This guard must not regress: ordinary main merges are not new Releases.
// Releasing from a dev-channel commit should be a deliberate no-op, while
// mismatched/unapproved tags must still fail before artifacts are created.
test('release workflow does not fail on non-release main commits', () => {
  const source=readFileSync('.github/workflows/release.yml','utf8');
  assert.match(source,/id: release-gate/);
  assert.match(source,/if\(c\.channel!=="release"\) \{/);
  assert.match(source,/if\(tag\) throw Error\("A release tag must point to release-channel source"\)/);
  assert.match(source,/GITHUB_OUTPUT,"publish=false/);
  assert.match(source,/GITHUB_OUTPUT,"publish=true/);
  assert.match(source,/verifySourceVersions\("\.",c\)/);
  assert.match(source,/Tag does not match release version/);
});

test('publish and signing operations must be gated', () => {
  const source=readFileSync('.github/workflows/release.yml','utf8');
  const steps=[
    'npm install --no-audit --no-fund',
    'npm run check',
    'npm run package:release',
    'Package Firefox from the same source commit',
    'Validate both distributables and shared runtime identity',
    'Mozilla validation of Firefox distributable',
    'Optionally sign a normal-installable Firefox XPI via AMO',
    'Tag main commit and publish both verified browser ZIPs'
  ];
  assert.equal((source.match(/if: steps\.release-gate\.outputs\.publish == 'true'/g)||[]).length,steps.length);
  for(const step of steps)assert.ok(source.includes(step),step);
});
