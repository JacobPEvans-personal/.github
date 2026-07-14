# Authentication & Secrets Management

Cross-repository reference for how credentials are managed across the JacobPEvans infrastructure.

## Secret Providers

### Bitwarden Secrets Manager

- **Used by**: nix-darwin, nix-ai
- **Purpose**: Application secrets, API tokens
- **Access**: Via `bws` CLI, integrated into Nix configuration

### Doppler

- **Used by**: terraform-proxmox, terraform-aws, ansible-proxmox, ansible-proxmox-apps, ansible-splunk
- **Purpose**: Infrastructure secrets (API keys, credentials)
- **Access**: Via `doppler run --` prefix on commands

### aws-vault

- **Used by**: terraform-aws, terraform-aws-bedrock
- **Purpose**: AWS credential management with MFA/session tokens
- **Access**: Via `aws-vault exec <profile> --` prefix

### OpenBao (AWS secrets engine)

- **Used by**: terraform-proxmox
- **Purpose**: AWS credential management for automation and AI agents — a dynamic secrets engine brokers short-lived STS sessions,
  replacing the retired static aws-vault base key for this repo
- **Access**: Terrakube workspace JWT identity (CI/plan/apply); local/agent access via an AWS `credential_process` profile backed by an OpenBao AppRole

### SOPS/age

- **Used by**: nix-devenv
- **Purpose**: Encrypted secrets in git (dev shell configs)
- **Access**: Via `SOPS_AGE_KEY_FILE` environment variable (path, not secret — safe in `.envrc`)

### SSH Keys

- **Used by**: terraform-proxmox, ansible-*
- **Purpose**: Proxmox node access, VM provisioning
- **Access**: Via `ssh-agent` or direct key path variables

### GitHub App Tokens

- **Used by**: CI/CD workflows across all repos
- **Purpose**: Cross-repo automation, release-please, CI triggers
- **Access**: Via `actions/create-github-app-token` in workflows

### macOS Keychain

- **Used by**: nix-darwin
- **Purpose**: HuggingFace tokens, service credentials
- **Access**: Via `security find-generic-password` in activation scripts

## Principles

1. **Never hardcode secrets** — use providers above
2. **Paths are not secrets** — `SOPS_AGE_KEY_FILE`, SSH key paths are safe to commit in `.envrc`
3. **Provider per context** — use the right provider for the right repo (see table above)
4. **CI uses GitHub App tokens** — not PATs, not deploy keys
