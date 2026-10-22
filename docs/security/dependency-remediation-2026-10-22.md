# Dependency remediation - 22 October 2026

ChatNoir's bounded review identified four dependency packages matching npm
security advisories: one critical and three high package ratings. Application
exploitability was not established. This change removes the affected versions
from the resolved dependency tree; it does not claim an application exploit was
reproduced or that the whole app is secure.

| Package | Reviewed lockfile | Updated lockfile |
|---|---|---|
| Next.js | 16.3.4 | 16.3.8 |
| Sharp | 0.35.4 | 0.35.5 |
| source-map-js | 1.2.1 | 1.2.2 |
| Undici | 7.29.0 | 7.30.1 |

The Next.js minimum is now `^16.3.8`. The other packages remain transitive
dependencies, updated through their existing compatible ranges. Sharp's
platform packages and bundled libvips entries were updated with it. No new
direct dependency, override, application logic or data-access change was added.

## Verification

Verified with Node.js 26.9.0 and npm 11.19.1 on macOS:

| Check | Result |
|---|---|
| `npm ci --ignore-scripts --no-audit --no-fund` | Clean install succeeded |
| `npm audit --package-lock-only --ignore-scripts --json --registry=https://registry.npmjs.org` | Before: 4 package findings; after: 0 advisories of any severity |
| `npm ls next sharp source-map-js undici --all` | Installed tree matches the updated versions |
| `npm test` | 254 passed; 0 failed or skipped |
| `npm run typecheck` | Passed |
| `npm run build -- --webpack` | Production build passed with Next.js 16.3.8 |
| Synthetic Sharp SVG-to-PNG conversion | Passed; local Sharp 0.35.5 reports librsvg 2.63.2 |

Tests and build ran in a disposable source copy using the updated installed
dependencies, test mode and local storage, without project environment files or
host provider credentials. Tests use synthetic inputs and scripted/mocked model,
network and database behavior. The initial test runner could not bind its Unix
socket under a long temporary path; rerunning with a shorter temporary directory
passed without changing app code or assertions.

The clean audit is a point-in-time registry result, not proof of no
vulnerabilities. No advisory exploit payload, live model generation, production
database test or confidential workshop data was used. Public workshop reads
remain the intentional demo contract described in [Security](../../SECURITY.md).

## Advisory references

- [Next.js advisory](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j) (the original audit also returned other Next.js advisories).
- [Sharp / librsvg advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w).
- [source-map-js advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).
- [Undici advisory](https://github.com/advisories/GHSA-w293-vg96-wgc3) (the original audit also returned other Undici advisories).

The post-update audit returned no remaining matches for any of the original
advisories. Closing these dependency findings means the affected locked versions
were replaced and the listed compatibility checks passed, not that every
upstream exploit scenario was executed.
