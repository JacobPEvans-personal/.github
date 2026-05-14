# CLAUDE.md

## Repo Purpose

This is the `.github` community health repository for JacobPEvans. It
provides default community files (issue templates, PR templates,
CONTRIBUTING.md, etc.) that are automatically inherited by all public repos
that don't define their own versions.

## Key Files

- `renovate.json` — Renovate config extending `config:recommended` and local presets
- `renovate-presets.json` — Org-wide Renovate preset. Inline `description` fields are canonical docs. Extend from other repos via `local>JacobPEvans/.github:renovate-presets`.
- `.github/labels.yml` — Canonical label definitions deployed to all repos via `label-sync.yml`
- `.github/workflows/label-sync.yml` — Syncs `labels.yml` to all repos on push to main
- `.github/ISSUE_TEMPLATE/` — Issue forms (bug, feature, docs, chore); all require `priority` + `size` labels
- `.github/PULL_REQUEST_TEMPLATE/` — PR templates per change type; all require Conventional Commits format
- `docs/CONTRIBUTING.md` — Inherited contributing guidelines

## Common Tasks

### Adding or modifying labels

Edit `.github/labels.yml`. Pushing to `main` triggers `label-sync.yml`, which deploys labels to all repos.

### Adding an issue template

Add a `.yml` file to `.github/ISSUE_TEMPLATE/`. It must include `priority` and `size` dropdown fields to match the label taxonomy.

### Updating reusable workflows

Workflows prefixed with `_` are reusable and called from other repos:

```yaml
uses: JacobPEvans/.github/.github/workflows/_name.yml@main
```

## Conventions

- Label names use `namespace:value` format (`type:bug`, `priority:high`, `size:m`)
- PR titles must follow Conventional Commits: `type(scope): description`
- Commits should be signed (required by PR templates)
