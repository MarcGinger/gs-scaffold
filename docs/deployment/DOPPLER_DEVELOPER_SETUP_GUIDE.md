# Doppler Secrets Management - Developer Setup Guide

> **Complete guide for installing Doppler CLI and managing secrets in the gs-scaffold application**

## 📋 Prerequisites

- Windows 10/11 with PowerShell 5.1 or later
- Node.js 16+ installed
- Access to the gs-scaffold project repository
- Internet connection for Doppler CLI installation

---

## 🚀 Quick Start (5 Minutes)

### Step 1: Install Doppler CLI

**Option A: Using Winget (Recommended)**

```powershell
# Install Doppler CLI
winget install DopplerHQ.Doppler

# Verify installation (may require new terminal session)
doppler --version
```

**Option B: Manual Installation**

```powershell
# Download and install from GitHub releases
$arch = if ([Environment]::Is64BitOperatingSystem) { "amd64" } else { "386" }
$url = "https://github.com/DopplerHQ/cli/releases/latest/download/doppler_windows_$arch.zip"
Invoke-WebRequest -Uri $url -OutFile "$env:TEMP\doppler.zip"
Expand-Archive -Path "$env:TEMP\doppler.zip" -DestinationPath "$env:TEMP\doppler"
Move-Item "$env:TEMP\doppler\doppler.exe" "$env:ProgramFiles\Doppler\doppler.exe" -Force
```

### Step 2: Authenticate with Doppler

```bash
# Login to Doppler (opens browser)
doppler login

# Verify authentication
doppler me
```

### Step 3: Setup Project Access

```bash
# Navigate to your project directory
cd d:\gsnew\gsnew\gs-scaffold

# Setup project (interactive)
doppler setup

# Select:
# - Project: gs-scaffold-api
# - Config: dev_main
```

### Step 4: Test Configuration

```bash
# View available secrets
doppler secrets

# Test application with integrated Doppler
npm run start:dev
```

---

## 🔧 Detailed Installation Guide

### Windows Installation Steps

1. **Open PowerShell as Administrator**

2. **Install using Winget (Preferred)**

   ```powershell
   # Check if winget is available
   winget --version

   # Install Doppler
   winget install DopplerHQ.Doppler

   # Restart terminal to update PATH
   ```

3. **Alternative: Manual Installation**

   ```powershell
   # Create install directory
   New-Item -ItemType Directory -Path "$env:ProgramFiles\Doppler" -Force

   # Download latest release
   $arch = if ([Environment]::Is64BitOperatingSystem) { "amd64" } else { "386" }
   $url = "https://github.com/DopplerHQ/cli/releases/latest/download/doppler_windows_$arch.zip"
   Invoke-WebRequest -Uri $url -OutFile "$env:TEMP\doppler.zip"

   # Extract and install
   Expand-Archive -Path "$env:TEMP\doppler.zip" -DestinationPath "$env:TEMP\doppler" -Force
   Move-Item -Path "$env:TEMP\doppler\doppler.exe" -Destination "$env:ProgramFiles\Doppler\doppler.exe" -Force

   # Add to PATH (permanent)
   $currentPath = [Environment]::GetEnvironmentVariable("PATH", "Machine")
   if ($currentPath -notlike "*$env:ProgramFiles\Doppler*") {
       [Environment]::SetEnvironmentVariable("PATH", "$currentPath;$env:ProgramFiles\Doppler", "Machine")
   }

   # Clean up
   Remove-Item -Path "$env:TEMP\doppler.zip", "$env:TEMP\doppler" -Recurse -Force
   ```

4. **Verify Installation**
   ```powershell
   # Restart PowerShell to pick up PATH changes
   # Then verify
   doppler --version
   # Expected output: doppler version v3.75.1 or later
   ```

### Authentication Setup

1. **Login to Doppler**

   ```bash
   doppler login
   ```

   - This opens your browser
   - Sign in with your account or create new account
   - CLI will automatically authenticate

2. **Verify Authentication**

   ```bash
   # Check authentication status
   doppler me

   # Expected output shows user info and workplace details
   ```

---

## 🏗️ Project Configuration

### Setting Up gs-scaffold-api Project

1. **Navigate to Project**

   ```bash
   cd d:\gsnew\gsnew\gs-scaffold
   ```

2. **Setup Doppler Project**

   ```bash
   # Interactive setup (recommended for first time)
   doppler setup

   # Manual setup (if you know the details)
   doppler setup --project gs-scaffold-api --config dev_main
   ```

3. **Verify Project Setup**

   ```bash
   # Check current configuration
   doppler configure

   # List available secrets
   doppler secrets
   ```

### Environment Configuration

The project uses these environments:

- **dev_main**: Local development (your primary environment)
- **staging**: Staging environment
- **production**: Production environment

```bash
# Switch between environments
doppler configure set config dev_main    # Development
doppler configure set config staging     # Staging
doppler configure set config production  # Production

# Or setup different configs
doppler setup --config staging
```

---

## 🔑 Managing Secrets (Keys)

### 📋 Viewing Secrets

```bash
# List all secrets (values are masked for security)
doppler secrets

# Get specific secret (still masked)
doppler secrets get DATABASE_URL

# Get secret value in plain text (use carefully!)
doppler secrets get DATABASE_URL --plain

# Download all secrets as .env format
doppler secrets download --format env

# Download as JSON (for scripting)
doppler secrets download --format json

# Get secret count and summary
doppler secrets --json | jq 'keys | length'
```

### ➕ Adding New Secrets/Keys

**Method 1: Command Line (Single Secret)**

```bash
# Add a single secret
doppler secrets set SECRET_NAME "secret_value"

# Examples:
doppler secrets set API_KEY "your-api-key-here"
doppler secrets set DATABASE_PASSWORD "super-secure-password"
doppler secrets set REDIS_URL "redis://localhost:6379"
```

**Method 2: Interactive Mode (Multiple Secrets)**

```bash
# Add multiple secrets interactively
doppler secrets set

# Follow prompts:
# - Secret name: NEW_API_KEY
# - Secret value: [enter value]
# - Add another? y/n
```

**Method 3: Upload from File**

```bash
# Upload from .env file
doppler secrets upload .env

# Upload from specific file
doppler secrets upload secrets.env

# Upload with dry run (preview changes)
doppler secrets upload .env --dry-run
```

**Method 4: Web Dashboard**

1. Go to: https://dashboard.doppler.com
2. Navigate to `gs-scaffold-api` → `dev_main`
3. Click "Add Secret" button
4. Enter name and value
5. Click "Save"

**Method 5: Using Migration Script (Recommended for gs-scaffold)**

```bash
# Add secrets to your .env file first
echo "NEW_SECRET=value" >> .env

# Then use the migration script
node migrate-secrets.js

# Follow interactive prompts to migrate by priority
```

### ✏️ Updating Existing Secrets

```bash
# Update existing secret
doppler secrets set DATABASE_PASSWORD "new-secure-password"

# Bulk update from file
doppler secrets upload updated_secrets.env

# Update with confirmation
doppler secrets set API_KEY "new-key" --confirm
```

### ❌ Removing Secrets/Keys

**Command Line Removal**

```bash
# Remove single secret
doppler secrets delete SECRET_NAME

# Remove with confirmation prompt
doppler secrets delete API_KEY

# Remove multiple secrets
doppler secrets delete SECRET_1 SECRET_2 SECRET_3

# Remove with force (no confirmation)
doppler secrets delete SECRET_NAME --yes
```

**Web Dashboard Removal**

1. Go to: https://dashboard.doppler.com
2. Navigate to `gs-scaffold-api` → `dev_main`
3. Find the secret you want to remove
4. Click the "..." menu next to the secret
5. Select "Delete"
6. Confirm deletion

**Bulk Removal**

```bash
# List secrets to file
doppler secrets --json | jq -r 'keys[]' > current_secrets.txt

# Edit the file to keep only secrets you want to delete
# Then delete them
cat secrets_to_delete.txt | xargs doppler secrets delete
```

### 🔄 Advanced Key Management

**Copy secrets between environments**

```bash
# Copy from dev_main to staging
doppler secrets download --config dev_main --format env > temp_secrets.env
doppler secrets upload temp_secrets.env --config staging
rm temp_secrets.env
```

**Rename a secret (delete + add)**

```bash
# Get old value
OLD_VALUE=$(doppler secrets get OLD_SECRET_NAME --plain)

# Add new secret
doppler secrets set NEW_SECRET_NAME "$OLD_VALUE"

# Delete old secret
doppler secrets delete OLD_SECRET_NAME
```

**Search for secrets**

```bash
# Find secrets containing "database"
doppler secrets --json | jq 'keys[] | select(test("DATABASE"; "i"))'

# Find secrets by value pattern (be careful with sensitive data)
doppler secrets download --format env | grep "localhost"
```

---

## 🏃 Running Your Application

### Development Mode

**Option 1: Using Integrated Configuration (Recommended)**

```bash
# The application automatically loads from Doppler
npm run start:dev

# Configuration is loaded through DopplerConfigService
```

**Option 2: Using Doppler CLI Direct**

```bash
# Run with Doppler CLI injection
doppler run -- npm run start:dev

# Or specific commands
doppler run -- node dist/main.js
```

### Environment Variables in Code

The application automatically loads secrets through the integrated `DopplerConfigService`:

```typescript
// In your NestJS service
import { Injectable } from '@nestjs/common';
import { DopplerConfigService } from '../shared/config/doppler-config.service';

@Injectable()
export class MyService {
  constructor(private readonly configService: DopplerConfigService) {}

  async someMethod() {
    // Get specific configuration value
    const dbUrl = await this.configService.getConfigValue(
      'DATABASE_POSTGRES_URL',
    );
    const apiKey = await this.configService.getConfigValue(
      'AUTH_KEYCLOAK_CLIENT_SECRET',
    );

    // Get full configuration
    const config = await this.configService.loadConfiguration();
    console.log(config.APP_RUNTIME_ENVIRONMENT);
  }
}
```

---

## 🛠️ Troubleshooting

### Common Issues

**Issue: "doppler: command not found"**

```bash
# Solution 1: Restart terminal
# Close and reopen PowerShell

# Solution 2: Manually add to PATH (temporary)
$env:PATH += ";$env:ProgramFiles\Doppler"

# Solution 3: Check installation
Get-ChildItem "$env:ProgramFiles\Doppler"
```

**Issue: "Not authenticated"**

```bash
# Solution: Re-authenticate
doppler logout
doppler login
doppler me  # Verify
```

**Issue: "No project configured"**

```bash
# Solution: Setup project
doppler setup --project gs-scaffold-api --config dev_main

# Or check current config
doppler configure
```

**Issue: "Permission denied / Access denied"**

```bash
# Solution 1: Run as administrator
# Right-click PowerShell → Run as Administrator

# Solution 2: Check workspace access
doppler me

# Solution 3: Re-authenticate
doppler login
```

**Issue: "Project not found"**

```bash
# List available projects
doppler projects

# Check if you have access to gs-scaffold-api
# Contact team lead if project access needed
```

### Debugging Configuration

```bash
# Check current Doppler configuration
doppler configure

# List all available secrets (masked)
doppler secrets

# Test secret retrieval
doppler secrets get DATABASE_POSTGRES_URL --plain

# Validate application configuration
node tools\doppler\validate-doppler-simple.js

# Check application integration
npm run build
node tools\doppler\test-integration.js
```

### Validation Scripts

The project includes validation scripts:

```bash
# Simple validation (no TypeScript compilation)
node tools\doppler\validate-doppler-simple.js

# Full validation (with TypeScript)
node validate-doppler-integration.js

# Test migration functionality
node test-migration.js

# Test application integration
node test-integration.js
```

---

## 🔄 Migration from .env Files

If you're migrating from existing `.env` files:

### Automatic Migration (Recommended)

1. **Ensure your .env file is current**

   ```bash
   # Check your .env file
   cat .env
   ```

2. **Use the migration script**

   ```bash
   node migrate-secrets.js
   ```

   - Follow interactive prompts
   - Migrate by priority groups (P0-P4)
   - P0: Critical secrets (auth, database)
   - P1: Important operational secrets
   - P2: External service integrations
   - P3: Development and debugging
   - P4: Optional features

3. **Verify migration**

   ```bash
   # Check migrated secrets
   doppler secrets

   # Test application
   npm run start:dev
   ```

### Manual Migration

1. **Backup existing configuration**

   ```bash
   cp .env .env.backup
   ```

2. **Upload .env file directly**

   ```bash
   # Preview what will be uploaded
   doppler secrets upload .env --dry-run

   # Upload for real
   doppler secrets upload .env
   ```

3. **Update application code** (if needed)
   - The application is already configured to use Doppler
   - No code changes needed for most cases

---

## 🚀 Advanced Usage

### Multiple Environments

```bash
# Setup for different environments
doppler setup --project gs-scaffold-api --config dev_main    # Development
doppler setup --project gs-scaffold-api --config staging    # Staging
doppler setup --project gs-scaffold-api --config production # Production

# Switch between environments
doppler configure set config dev_main
doppler configure set config staging
doppler configure set config production

# Check current environment
doppler configure
```

### Service Tokens (CI/CD)

```bash
# Generate service token for automated deployments
doppler configs tokens create "ci-cd-token" --config production

# Use in CI/CD pipeline
export DOPPLER_TOKEN="dp.st.production.your-token-here"
doppler run -- npm start

# Or in Docker
docker run -e DOPPLER_TOKEN="dp.st.production.your-token" my-app
```

### Team Collaboration

```bash
# Share secrets with team (they need Doppler access)
# Team members follow same setup process

# Check who has access
# (Done through web dashboard - Team settings)

# Audit secret changes
doppler activity
```

### Backup and Restore

```bash
# Backup all secrets (do this regularly!)
doppler secrets download --format env > "backup-$(date +%Y%m%d).env"

# Backup specific environment
doppler secrets download --config production --format env > "prod-backup-$(date +%Y%m%d).env"

# Restore from backup
doppler secrets upload backup-20250816.env

# Restore to specific environment
doppler secrets upload backup-20250816.env --config staging
```

---

## 📊 Secret Organization Best Practices

### Naming Conventions

Follow these naming patterns for consistency:

```bash
# Database secrets
DATABASE_POSTGRES_URL
DATABASE_POSTGRES_PASSWORD
DATABASE_REDIS_URL

# Authentication secrets
AUTH_KEYCLOAK_CLIENT_SECRET
AUTH_JWT_SECRET
AUTH_SESSION_SECRET

# External APIs
API_STRIPE_SECRET_KEY
API_SENDGRID_API_KEY
API_TWILIO_AUTH_TOKEN

# Application configuration
APP_RUNTIME_ENVIRONMENT
APP_LOG_LEVEL
APP_PORT
```

### Priority Groups

The migration system uses these priority groups:

- **P0 (Critical)**: Application cannot start without these
  - Database credentials
  - Essential auth secrets
  - Core encryption keys

- **P1 (Important)**: Core functionality affected
  - External API keys
  - Cache configuration
  - Storage credentials

- **P2 (Standard)**: Feature-specific
  - Email service keys
  - Payment provider keys
  - Analytics tokens

- **P3 (Optional)**: Development tools
  - Debug tokens
  - Development-only services
  - Monitoring tools

- **P4 (Development)**: Nice to have
  - Local development helpers
  - Optional integrations

### Schema Integration

When adding new secrets, update the configuration schema:

```typescript
// In src/shared/config/app-config.schema.ts
export const MyDomainConfigSchema = z.object({
  MY_NEW_SECRET: z.string().min(1),
  MY_OPTIONAL_SECRET: z.string().optional(),
});
```

---

## 📚 Additional Resources

- **Doppler CLI Documentation**: https://docs.doppler.com/docs/cli
- **Web Dashboard**: https://dashboard.doppler.com
- **Project Dashboard**: https://dashboard.doppler.com/workplace/projects/gs-scaffold-api
- **GitHub Repository**: https://github.com/DopplerHQ/cli

### Internal Documentation

- `docs/deployment/DOPPLER_INTEGRATION_GUIDE.md` - Complete integration guide
- `docs/deployment/APP_MODULE_INTEGRATION_EXAMPLE.md` - NestJS integration examples
- `DOPPLER_SUCCESS_SUMMARY.md` - Implementation summary
- `tools\doppler\migrate-secrets.js` - Interactive migration script
- `tools\doppler\validate-doppler-simple.js` - Validation script

### Quick Reference Commands

```bash
# Essential commands
doppler login                    # Authenticate
doppler setup                    # Configure project
doppler secrets                  # List secrets
doppler secrets set NAME "value" # Add secret
doppler secrets delete NAME      # Remove secret
doppler run -- command          # Run with secrets
doppler secrets upload .env      # Bulk upload
doppler secrets download         # Backup secrets

# Troubleshooting
doppler me                       # Check auth
doppler configure               # Check config
doppler --version               # Check CLI version
node tools\doppler\validate-doppler-simple.js # Validate setup
```

---

## 🆘 Getting Help

If you encounter issues:

1. **Check this guide** for common solutions
2. **Run validation scripts** to diagnose problems
3. **Check Doppler status** at https://status.doppler.com
4. **Contact the team** if project-specific issues
5. **Review logs** in the application for integration issues

**Emergency: Application won't start**

```bash
# Quick fallback to .env
cp .env.backup .env
npm run start:dev

# Then troubleshoot Doppler separately
doppler me
doppler configure
doppler secrets
```

---

_Last updated: August 16, 2025_  
_For gs-scaffold project - Doppler integration complete and production ready_ 🎉
