/**
 * Interactive Secret Migration Script - Phase 2.2
 * 
 * This script guides users through the priority-based migration
async function setDopplerSecret(project, config, name, value) {
  try {
    await execAsync(`${DOPPLER_CMD} secrets set ${name}="${value}" --project ${project} --config ${config}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to set ${name}: ${error.message}`);
    return false;
  }
}rets from .env files to Doppler.
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const readline = require('readline');
const fs = require('fs').promises;

const execAsync = promisify(exec);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

// Use local doppler wrapper
const DOPPLER_CMD = '.\\doppler.bat';

// Priority groups for migration
const MIGRATION_GROUPS = {
  P0: {
    name: 'Critical Authentication & Database',
    description: 'Essential secrets required for application startup',
    riskLevel: 'critical',
    secrets: [
      { legacy: 'KEYCLOAK_CLIENT_SECRET', doppler: 'AUTH_KEYCLOAK_CLIENT_SECRET', required: true },
      { legacy: 'PII_ENCRYPTION_KEY', doppler: 'SECURITY_PII_ENCRYPTION_KEY', required: true },
      { legacy: 'DATABASE_PASSWORD', doppler: 'DATABASE_POSTGRES_PASSWORD', required: true },
      { legacy: 'DATABASE_URL', doppler: 'DATABASE_POSTGRES_URL', required: true }
    ]
  },
  P1: {
    name: 'Service Connections',
    description: 'Critical service connection strings and credentials',
    riskLevel: 'high',
    secrets: [
      { legacy: 'REDIS_URL', doppler: 'CACHE_REDIS_URL', required: true },
      { legacy: 'REDIS_PASSWORD', doppler: 'CACHE_REDIS_PASSWORD', required: false },
      { legacy: 'ESDB_CONNECTION_STRING', doppler: 'EVENTSTORE_ESDB_CONNECTION_STRING', required: true },
      { legacy: 'DATABASE_USER', doppler: 'DATABASE_POSTGRES_USER', required: true }
    ]
  },
  P2: {
    name: 'Service Endpoints & Authentication Config',
    description: 'Service URLs and authentication configuration',
    riskLevel: 'medium',
    secrets: [
      { legacy: 'KEYCLOAK_URL', doppler: 'AUTH_KEYCLOAK_URL', required: true },
      { legacy: 'KEYCLOAK_REALM', doppler: 'AUTH_KEYCLOAK_REALM', required: true },
      { legacy: 'KEYCLOAK_CLIENT_ID', doppler: 'AUTH_KEYCLOAK_CLIENT_ID', required: true },
      { legacy: 'JWT_AUDIENCE', doppler: 'AUTH_JWT_AUDIENCE', required: true },
      { legacy: 'OPA_URL', doppler: 'SECURITY_OPA_URL', required: false },
      { legacy: 'PUBLIC_API_URL', doppler: 'APP_SERVER_PUBLIC_URL', required: false }
    ]
  },
  P3: {
    name: 'Application Configuration',
    description: 'Core application and runtime settings',
    riskLevel: 'low',
    secrets: [
      { legacy: 'NODE_ENV', doppler: 'APP_RUNTIME_ENVIRONMENT', required: true },
      { legacy: 'PORT', doppler: 'APP_SERVER_PORT', required: true },
      { legacy: 'PROTOCOL', doppler: 'APP_SERVER_PROTOCOL', required: true },
      { legacy: 'HOST', doppler: 'APP_SERVER_HOST', required: true },
      { legacy: 'LOG_LEVEL', doppler: 'LOGGING_CORE_LEVEL', required: true },
      { legacy: 'DATABASE_HOST', doppler: 'DATABASE_POSTGRES_HOST', required: true },
      { legacy: 'DATABASE_PORT', doppler: 'DATABASE_POSTGRES_PORT', required: true },
      { legacy: 'DATABASE_NAME', doppler: 'DATABASE_POSTGRES_NAME', required: true }
    ]
  }
};

async function loadEnvFile(filePath = '.env') {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = {};
    
    content.split('\n').forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          parsed[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
        }
      }
    });
    
    return parsed;
  } catch (error) {
    console.log(`⚠️  Could not read ${filePath}, using process.env`);
    return process.env;
  }
}

async function checkDopplerAuth() {
  try {
    const { stdout } = await execAsync(`${DOPPLER_CMD} me --json`);
    const result = JSON.parse(stdout);
    return { authenticated: true, user: result.email || result.name };
  } catch {
    return { authenticated: false };
  }
}

async function checkDopplerProject(project, config) {
  try {
    await execAsync(`${DOPPLER_CMD} secrets --project ${project} --config ${config} --json`);
    return true;
  } catch {
    return false;
  }
}

async function getDopplerSecrets(project, config) {
  try {
    const { stdout } = await execAsync(`${DOPPLER_CMD} secrets --project ${project} --config ${config} --json`);
    return JSON.parse(stdout);
  } catch {
    return {};
  }
}

async function setDopplerSecret(project, config, name, value) {
  try {
    await execAsync(`doppler secrets set ${name}="${value}" --project ${project} --config ${config}`);
    return true;
  } catch (error) {
    console.error(`  ❌ Failed to set ${name}: ${error.message}`);
    return false;
  }
}

function isPlaceholderValue(value) {
  const patterns = [
    /change.?me/i,
    /example/i,
    /placeholder/i,
    /dev.?secret/i,
    /test.?value/i,
    /your.?secret/i,
    /replace.?this/i,
  ];
  return patterns.some(pattern => pattern.test(value));
}

function maskValue(value) {
  if (value.length <= 8) {
    return '*'.repeat(value.length);
  }
  const start = value.substring(0, 3);
  const end = value.substring(value.length - 3);
  const middle = '*'.repeat(Math.min(value.length - 6, 10));
  return `${start}${middle}${end}`;
}

async function migratePriorityGroup(priority, project, config, currentEnv, existingSecrets, options = {}) {
  const group = MIGRATION_GROUPS[priority];
  if (!group) {
    throw new Error(`Priority group ${priority} not found`);
  }

  console.log(`\n🎯 Migrating: ${group.name} (${priority})`);
  console.log(`📋 ${group.description}`);
  console.log(`🚨 Risk Level: ${group.riskLevel}`);
  console.log(`📊 Secrets: ${group.secrets.length}\n`);

  let migratedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const warnings = [];

  for (const secret of group.secrets) {
    console.log(`🔍 ${secret.legacy} → ${secret.doppler}`);

    // Check if secret exists in current environment
    const currentValue = currentEnv[secret.legacy];
    
    if (!currentValue) {
      if (secret.required) {
        console.log(`  ❌ Required secret ${secret.legacy} not found`);
        errorCount++;
        continue;
      } else {
        console.log(`  ⏭️  Optional secret not found, skipping`);
        skippedCount++;
        continue;
      }
    }

    // Check if already exists in Doppler
    if (existingSecrets[secret.doppler] && options.skipExisting) {
      console.log(`  ℹ️  Already exists in Doppler, skipping`);
      skippedCount++;
      continue;
    }

    // Check for placeholder values
    if (isPlaceholderValue(currentValue)) {
      console.log(`  ⚠️  Appears to be placeholder: ${maskValue(currentValue)}`);
      if (group.riskLevel === 'critical') {
        console.log(`  ❌ Critical secret with placeholder value`);
        errorCount++;
        continue;
      } else {
        warnings.push(`${secret.legacy} has placeholder value`);
      }
    }

    // Perform migration
    if (options.dryRun) {
      console.log(`  🔍 DRY RUN: Would set ${secret.doppler} = ${maskValue(currentValue)}`);
      migratedCount++;
    } else {
      // Ask for confirmation for critical secrets
      if (group.riskLevel === 'critical' && !options.autoConfirm) {
        const confirm = await question(`  🔒 Migrate critical secret ${secret.doppler}? (y/n): `);
        if (confirm.toLowerCase() !== 'y') {
          console.log(`  ⏭️  Skipped by user`);
          skippedCount++;
          continue;
        }
      }

      const success = await setDopplerSecret(project, config, secret.doppler, currentValue);
      if (success) {
        console.log(`  ✅ Migrated successfully`);
        migratedCount++;
      } else {
        errorCount++;
      }
    }
  }

  return {
    migratedCount,
    skippedCount,
    errorCount,
    warnings,
    success: errorCount === 0
  };
}

async function generateMigrationReport(project, config, currentEnv, existingSecrets) {
  console.log(`\n📊 Migration Status Report`);
  console.log(`=====================================`);
  
  let totalSecrets = 0;
  let migratedSecrets = 0;
  let readySecrets = 0;
  let missingSecrets = 0;

  for (const [priority, group] of Object.entries(MIGRATION_GROUPS)) {
    console.log(`\n${priority}: ${group.name}`);
    console.log(`  Risk Level: ${group.riskLevel}`);
    
    for (const secret of group.secrets) {
      totalSecrets++;
      const hasLegacy = !!currentEnv[secret.legacy];
      const hasDoppler = !!existingSecrets[secret.doppler];
      
      let status = '❌ Missing';
      if (hasLegacy && hasDoppler) {
        status = '✅ Migrated';
        migratedSecrets++;
      } else if (hasLegacy) {
        status = '🔄 Ready';
        readySecrets++;
      } else if (hasDoppler) {
        status = '⚠️ Doppler Only';
      } else {
        missingSecrets++;
      }

      console.log(`    ${secret.doppler}: ${status}`);
    }
  }

  console.log(`\n📈 Summary:`);
  console.log(`  Total Secrets: ${totalSecrets}`);
  console.log(`  ✅ Migrated: ${migratedSecrets}`);
  console.log(`  🔄 Ready to Migrate: ${readySecrets}`);
  console.log(`  ❌ Missing: ${missingSecrets}`);
  console.log(`  📊 Progress: ${Math.round((migratedSecrets / totalSecrets) * 100)}%`);
}

async function main() {
  console.log('🔄 GS-Scaffold Secret Migration - Phase 2.2\n');

  // Step 1: Check Doppler authentication
  console.log('1. Checking Doppler authentication...');
  const auth = await checkDopplerAuth();
  
  if (!auth.authenticated) {
    console.log('❌ Not authenticated with Doppler');
    console.log('Please run: doppler login');
    return;
  }
  
  console.log(`✅ Authenticated as: ${auth.user}`);

  // Step 2: Check project access
  const project = 'gs-scaffold-api';
  const config = 'dev';
  
  console.log(`\n2. Checking Doppler project access...`);
  const hasProject = await checkDopplerProject(project, config);
  
  if (!hasProject) {
    console.log(`❌ Cannot access Doppler project: ${project}/${config}`);
    console.log('Please run: node setup-doppler-project.js');
    return;
  }
  
  console.log(`✅ Project access confirmed: ${project}/${config}`);

  // Step 3: Load current environment
  console.log(`\n3. Loading current environment...`);
  const currentEnv = await loadEnvFile();
  const envSecretCount = Object.keys(currentEnv).length;
  console.log(`✅ Loaded ${envSecretCount} environment variables`);

  // Step 4: Check existing Doppler secrets
  console.log(`\n4. Checking existing Doppler secrets...`);
  const existingSecrets = await getDopplerSecrets(project, config);
  const dopplerSecretCount = Object.keys(existingSecrets).length;
  console.log(`✅ Found ${dopplerSecretCount} existing Doppler secrets`);

  // Step 5: Show migration report
  await generateMigrationReport(project, config, currentEnv, existingSecrets);

  // Step 6: Interactive migration
  console.log(`\n🚀 Ready to begin migration!`);
  
  const action = await question('\nWhat would you like to do?\n1. Migrate P0 (Critical) secrets\n2. Migrate specific priority group\n3. View detailed report\n4. Exit\n\nChoice (1-4): ');

  switch (action) {
    case '1':
      console.log('\n🚨 Migrating P0 Critical Secrets...');
      const result = await migratePriorityGroup('P0', project, config, currentEnv, existingSecrets, {
        dryRun: false,
        skipExisting: true,
        autoConfirm: false
      });
      
      console.log(`\n📊 P0 Migration Complete:`);
      console.log(`  ✅ Migrated: ${result.migratedCount}`);
      console.log(`  ⏭️  Skipped: ${result.skippedCount}`);
      console.log(`  ❌ Errors: ${result.errorCount}`);
      
      if (result.warnings.length > 0) {
        console.log(`  ⚠️  Warnings:`);
        result.warnings.forEach(w => console.log(`    - ${w}`));
      }
      
      if (result.success) {
        console.log('\n🎉 P0 Critical secrets migrated successfully!');
        console.log('Next: Run script again to migrate P1 (Service Connections)');
      }
      break;

    case '2':
      const priority = await question('\nWhich priority group? (P0/P1/P2/P3): ');
      if (MIGRATION_GROUPS[priority.toUpperCase()]) {
        const dryRun = await question('Dry run first? (y/n): ');
        const result = await migratePriorityGroup(
          priority.toUpperCase(), 
          project, 
          config, 
          currentEnv, 
          existingSecrets, 
          { 
            dryRun: dryRun.toLowerCase() === 'y',
            skipExisting: true,
            autoConfirm: false
          }
        );
        
        console.log(`\n📊 ${priority} Migration Complete:`);
        console.log(`  ✅ Migrated: ${result.migratedCount}`);
        console.log(`  ⏭️  Skipped: ${result.skippedCount}`);
        console.log(`  ❌ Errors: ${result.errorCount}`);
      } else {
        console.log('❌ Invalid priority group');
      }
      break;

    case '3':
      await generateMigrationReport(project, config, currentEnv, existingSecrets);
      break;

    case '4':
      console.log('👋 Goodbye!');
      break;

    default:
      console.log('❌ Invalid choice');
  }

  rl.close();
}

// Run the migration script
main().catch((error) => {
  console.error('❌ Migration failed:', error);
  rl.close();
});
