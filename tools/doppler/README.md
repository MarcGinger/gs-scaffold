# Doppler Tools & Utilities

This directory contains all Doppler-related utilities, scripts, and tools for the gs-scaffold project's secrets management implementation.

## 📁 Directory Contents

### Core Utilities

- **`doppler.bat`** - Windows CLI wrapper for consistent Doppler access
- **`migrate-secrets.js`** - Interactive secret migration script (Phase 2.2)
- **`setup-doppler-project.js`** - Doppler project setup and initialization

### Validation & Testing

- **`validate-doppler-simple.js`** - Simplified production readiness validation
- **`validate-doppler-integration.js`** - Comprehensive integration validation
- **`test-integration.js`** - Application integration testing
- **`test-migration.js`** - Migration functionality testing
- **`test-doppler-module.js`** - Module-level testing
- **`test-doppler-setup.js`** - Setup validation testing

## 🚀 Quick Start

### Run from Root Directory

All scripts should be run from the project root directory:

```bash
# Navigate to project root
cd d:\gsnew\gsnew\gs-scaffold

# Run any Doppler tool
node tools\doppler\migrate-secrets.js
node tools\doppler\validate-doppler-simple.js
```

### Key Commands

```bash
# 1. Validate Doppler setup
node tools\doppler\validate-doppler-simple.js

# 2. Migrate secrets interactively
node tools\doppler\migrate-secrets.js

# 3. Test application integration
node tools\doppler\test-integration.js

# 4. Full validation suite
node tools\doppler\validate-doppler-integration.js
```

## 📋 Usage Guide

### Phase 2.2: Secret Migration

```bash
# Interactive migration with priority groups
node tools\doppler\migrate-secrets.js

# Available priorities:
# P0: Critical (auth, database) - 4 secrets
# P1: Service connections - 4 secrets
# P2: Service endpoints - 6 secrets
# P3: Application config - 8 secrets
# P4: Optional settings - 7 secrets
```

### Validation & Testing

```bash
# Simple validation (no compilation required)
node tools\doppler\validate-doppler-simple.js

# Comprehensive testing (requires build)
npm run build
node tools\doppler\validate-doppler-integration.js

# Test specific functionality
node tools\doppler\test-migration.js     # Migration testing
node tools\doppler\test-integration.js   # App integration
```

### Setup & Configuration

```bash
# Initial Doppler project setup
node tools\doppler\setup-doppler-project.js

# Test basic setup
node tools\doppler\test-doppler-setup.js

# Direct CLI access (Windows)
tools\doppler\doppler.bat --help
tools\doppler\doppler.bat secrets --project gs-scaffold-api --config dev_main
```

## 🔧 Tool Descriptions

### Migration Tools

#### `migrate-secrets.js`

**Interactive secret migration with priority-based workflow**

- Guides through P0-P4 priority groups
- Safety features: dry-run, confirmations, placeholder detection
- Progress tracking and detailed reporting
- Automatic backup and validation

#### `setup-doppler-project.js`

**Initial Doppler project configuration**

- Creates gs-scaffold-api project
- Sets up dev/staging/prod environments
- Generates service tokens
- Configures default secrets

### Validation Tools

#### `validate-doppler-simple.js`

**Quick production readiness check**

- CLI availability and authentication
- Project existence validation
- Critical secrets verification
- Basic configuration files check

#### `validate-doppler-integration.js`

**Comprehensive integration validation**

- Full application integration testing
- TypeScript compilation validation
- Configuration loader testing
- End-to-end workflow verification

### Testing Tools

#### `test-integration.js`

**Application integration testing**

- ConfigLoader functionality
- Service integration
- Error handling validation

#### `test-migration.js`

**Migration functionality testing**

- Migration process validation
- Backup and restore testing
- Error scenario handling

## 📊 Migration Status

### Completed Phases

- ✅ **Phase 2.1**: Doppler project setup
- ✅ **Phase 2.2**: P0 critical secrets migration (4/4 secrets)
- ✅ **Phase 2.3**: Application integration

### Available for Migration

- **P1 Secrets** (4 remaining): Service connections
- **P2 Secrets** (6 remaining): External service configs
- **P3 Secrets** (8 remaining): Application settings
- **P4 Secrets** (7 remaining): Optional features

## 🛠️ Troubleshooting

### Common Issues

1. **Doppler CLI not found**

   ```bash
   # Use the wrapper
   tools\doppler\doppler.bat --version
   ```

2. **Authentication errors**

   ```bash
   # Check authentication
   tools\doppler\doppler.bat me
   ```

3. **Project access issues**
   ```bash
   # Verify project access
   tools\doppler\doppler.bat projects
   ```

### Debug Commands

```bash
# Check current configuration
tools\doppler\doppler.bat configure

# Test secret access
tools\doppler\doppler.bat secrets get DATABASE_POSTGRES_URL --plain --project gs-scaffold-api --config dev_main

# Validate setup
node tools\doppler\test-doppler-setup.js
```

## 📝 Implementation Notes

### Path Updates Required

After moving utilities to `tools/doppler/`, the following may need path updates:

1. **Documentation references** - Update any docs referencing old paths
2. **Package.json scripts** - Update npm scripts if they reference these tools
3. **CI/CD pipelines** - Update any automation that calls these scripts
4. **README files** - Update main project README

### Development Workflow

1. **Run from project root** - All scripts expect to be run from the main directory
2. **Build before testing** - Some validation scripts require `npm run build` first
3. **Interactive mode** - Most tools provide interactive prompts for ease of use
4. **Dry-run available** - Migration tools support dry-run mode for safety

---

## 🎯 Next Steps

1. **Continue P1-P4 migration** using `migrate-secrets.js`
2. **Update documentation** references to new paths
3. **Test deployment** with Doppler service tokens
4. **Set up staging/prod** environments when ready

For detailed usage instructions, see:

- `docs/deployment/DOPPLER_DEVELOPER_SETUP_GUIDE.md`
- `docs/deployment/DOPPLER_INTEGRATION_GUIDE.md`
