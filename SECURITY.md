# Security Policy

## Reporting Vulnerabilities

To report a security vulnerability, use
[GitHub's private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on the affected repository. Do not open a public issue for security vulnerabilities.

For critical vulnerabilities affecting multiple repositories, report to the
[.github repository](https://github.com/JacobPEvans/.github/security/advisories/new).

## Dependency Trust

Automated dependency updates use Renovate via this repo's presets
([`renovate-presets.json`](renovate-presets.json) + [`renovate-grouping.json`](renovate-grouping.json)),
which are a thin shim inheriting [dryvist/.github](https://github.com/dryvist/.github)'s
master policy — the single source of truth for Renovate policy across every
dryvist AND JacobPEvans repo. Minor/patch updates auto-merge
publisher-agnostically; trust tiers gate only majors and PR-creation cadence.
Canonical, fuller documentation:
[docs.jacobpevans.com/infrastructure/cicd/dependency-automation](https://docs.jacobpevans.com/infrastructure/cicd/dependency-automation).

| Tier | Scope | PR-creation cadence | Majors |
| --- | --- | --- | --- |
| **First-party** | `dryvist/**`, `JacobPEvans/**`, `JacobPEvans-personal/**` | at any time | auto-merge immediately, incl. major |
| **Trusted** | curated ~50-org allowlist | twice-weekly (Mon/Thu) | never auto-merge; 3-day review PR (`dep:review`) |
| **Untrusted** | all other external deps | weekly (Mon) | never auto-merge; held 30 days for review |
| **Security / CVE** | any vulnerability alert | immediate (0-day PR) | minor/patch auto-merges fast; a security major still opens for review |

**Minor/patch updates auto-merge publisher-agnostically** — any package, any
ecosystem, any publisher — after a 3-day stabilization window and green CI.
Trust tiers do not gate minor/patch; they gate only majors and PR-creation
cadence.

- **First-party** — our own published packages. release-please cuts and
  auto-merges every release, so changes propagate to consumers at once
  (0-day auto-merge, all update types including major).
- **Trusted** — the curated org allowlist in `renovate-presets.json` (actions,
  google, github, hashicorp, astral-sh, NixOS, …). Trust here shortens the
  major-default 30-day hold to a 3-day review PR (`dep:review` label); it has
  no effect on minor/patch, which auto-merges the same way for every tier.
- **Untrusted** — everything else, including Nix flake inputs and Python
  packages that aren't on the trusted allowlist. Minor/patch still
  auto-merges through the same publisher-agnostic rule; the only differences
  are a weekly (vs twice-weekly) PR-creation cadence and the full 30-day
  hold before a major opens for review.
- **Majors never auto-merge except first-party** — a compatible-looking
  version is not a compatible API. First-party majors auto-merge
  immediately; trusted-org majors open a 3-day review PR; every other major
  is held 30 days.
- **Security / CVE** — `vulnerabilityAlerts` surfaces a 0-day PR
  immediately, bypassing the normal schedule. The auto-merge decision then
  falls to the same packageRules as any other update: a security minor/patch
  inherits the broad rule's fast auto-merge, while a security major still
  opens for review like any other major.
- **Supply-chain safety** for the broad auto-merge set is the deterministic
  `dependency-review` job (`actions/dependency-review-action`) inside the
  required Merge Gate on public repos. The `ai-workflows` dependency
  reviewer is advisory only — it labels findings for human follow-up but
  does not gate or block auto-merge.
- Renovate merges directly via its own API rather than GitHub's native
  auto-merge queue (`platformAutomerge: false`) — the native queue has a
  known bug where PRs pass all checks but GitHub never executes the merge.

GitHub Actions from untrusted orgs are pinned to SHA digests, not tags;
first-party self-references ride `@main` (see Version Pinning below).

### Version Pinning Strategy

| Source | Strategy |
| -------- | ---------- |
| JacobPEvans self-references | `@main` or major version tag — never SHA or minor/patch pins |
| Trusted GitHub Actions | Semantic version tags (e.g., `@v6`) |
| External/untrusted GitHub Actions | SHA commit hash pins |
| Nix flake inputs | Branch-pinned to stable releases (e.g., `nixpkgs-25.11-darwin`) |
| Python packages (pyproject.toml) | Lower-bound with `>=`; publisher-agnostic minor/patch auto-merge like every other ecosystem |
| Python tool installs (uv) | Exact pin with `==`, managed by Renovate custom regex |

## Dependency Update Vectors

Dependencies enter the ecosystem through multiple channels. Each has different
protections:

### Renovate PRs (Managed)

Primary update mechanism. Enforces stabilization delays, CI gates, and repository
rulesets before merge. All repos extend the centralized `renovate-presets.json`.

### `/flake-rebuild` Command (Managed)

The approved method for manually updating Nix flake inputs. Enforces:

- Feature branch isolation (never commits to main)
- Quality validation (fmt, statix, deadnix, flake check, darwin-rebuild)
- CI gating via auto-merge (all required status checks must pass)

**Warning**: Running raw `nix flake update && darwin-rebuild switch` bypasses all
protections. Workflow rules forbid committing directly to main, which mitigates
but does not eliminate local execution risk.

### Homebrew (`brew autoupdate`) — Accepted Risk

Homebrew packages have NO version pinning in nix-darwin configuration and NO
Renovate tracking (Renovate cannot manage Homebrew in Nix files). The `brew
autoupdate` LaunchAgent runs every 30 hours.

**Why this is accepted**: Homebrew-core has significantly more review rigor than
PyPI or npm. All formulae are open-source and community-reviewed. Bottles are
built by Homebrew's CI infrastructure, not package authors. Supply-chain
compromises in homebrew-core are extremely rare.

### `uv tool install` in Activation Scripts (Managed)

Python tools installed during `darwin-rebuild switch` are pinned to exact
versions (`==`) and tracked by Renovate via custom regex managers. Updates go
through the standard 3-day stabilization pipeline.

## Security Scanning

| Tool | Scope | Integration |
| ------ | ------- | ------------- |
| **CodeQL** | GitHub Actions YAML | `codeql.yml` (org-wide) |
| **pip-audit** | Python dependency CVEs | `_python-security.yml` (reusable workflow) |
| **OSV Scanner** | Multi-ecosystem lockfile CVEs | `_osv-scan.yml` (reusable workflow) |
| **Daily Malicious Code Scan** | Pattern-based threat detection | Copilot agent (per-repo) |
| **Zizmor** | GitHub Actions security linting | Pre-commit hook |

## Incident Response — Supply-Chain Attacks

### Detection

- GitHub Advisory Database alerts (via Renovate `vulnerabilityAlerts`)
- CodeQL and OSV Scanner findings in CI
- Daily malicious code scan alerts
- Community notification (mailing lists, social media, CVE databases)

### Immediate Response (within 1 hour)

1. Identify all repos consuming the compromised package
2. Check Renovate PR history — was a compromised version offered or merged?
3. Check `flake.lock` timestamps — did a manual update pull it?
4. Check `uv tool list` — is the compromised version installed locally?

### Containment

- Add version constraint to block compromised versions (e.g., `!=bad.version`)
- If Nix flake input: pin to known-good commit hash temporarily
- If `uv tool install`: downgrade to last known-good version with `==`
- Clear local caches: `uv cache clean <package>`

### Verification

- Run `nix flake metadata` to confirm pinned revisions
- Check `uv tool list` for installed versions
- Audit CI logs for the affected time window
- Check for IOCs specific to the attack

### Recovery

- Update to patched version when available
- Remove temporary pins and constraints
- Document incident in a GitHub Discussion for future reference

## Accepted Risks

### nix-devenv uses `nixpkgs-unstable`

Intentional. Dev shells need latest tool versions (terraform, ansible, kubectl).
nix-devenv is never consumed by nix-darwin at build time — it provides independent
`nix develop` entry points outside the system build graph.

### Nix Flake Alignment (`follows` Pattern)

nix-darwin uses `inputs.nixpkgs.follows` to force companion repos (nix-ai,
nix-home) to use the same nixpkgs at build time, regardless of their own
`flake.lock`. This means flake.lock drift between repos is cosmetic for the
system build but matters for standalone development and CI.
