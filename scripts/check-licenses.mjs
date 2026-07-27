// Fails the build if any dependency ships under a copyleft license.
// Permissive licenses (MIT/BSD/Apache/ISC/...) and "Unknown" are allowed;
// "Unknown" is reported as a warning, not a failure, to avoid flaking on
// packages that simply omit SPDX metadata.
import { execSync } from 'node:child_process';

const DENY = [
  /\bA?GPL\b/i,
  /\bLGPL\b/i,
  /\bMPL\b/i,
  /\bEPL\b/i,
  /\bCDDL\b/i,
  /\bSSPL\b/i,
  /\bEUPL\b/i,
  /\bCPAL\b/i,
  /\bOSL\b/i,
];

const raw = execSync('pnpm licenses list --json', { encoding: 'utf8' });
const byLicense = JSON.parse(raw);

const violations = [];
let unknown = 0;
for (const [license, pkgs] of Object.entries(byLicense)) {
  if (/unknown/i.test(license)) {
    unknown += pkgs.length;
    continue;
  }
  if (DENY.some((re) => re.test(license))) {
    for (const p of pkgs) violations.push(`${p.name}@${(p.versions || []).join(',')} — ${license}`);
  }
}

if (unknown) console.warn(`note: ${unknown} package(s) report an Unknown license (allowed).`);

if (violations.length) {
  console.error('Copyleft licenses found in the dependency tree:');
  for (const v of violations) console.error(`  - ${v}`);
  console.error('\nIf a package is a false positive or acceptable, allowlist it explicitly.');
  process.exit(1);
}

console.log('License check passed: no copyleft licenses in the dependency tree.');
