/**
 * Simple Migration Test - Phase 2.2
 * Test the secret migration functionality without interactive prompts
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;

const execAsync = promisify(exec);
const DOPPLER_CMD = '.\\doppler.bat';

// Test configuration
const TEST_CONFIG = {
  project: 'gs-scaffold-api',
  config: 'dev_main',
  envFile: '.env.sample',
};

// Secret mappings for P0 (Critical) secrets
const P0_SECRETS = [
  { legacy: 'KEYCLOAK_CLIENT_SECRET', doppler: 'AUTH_KEYCLOAK_CLIENT_SECRET' },
  { legacy: 'PII_ENCRYPTION_KEY', doppler: 'SECURITY_PII_ENCRYPTION_KEY' },
  { legacy: 'DATABASE_PASSWORD', doppler: 'DATABASE_POSTGRES_PASSWORD' },
  { legacy: 'DATABASE_URL', doppler: 'DATABASE_POSTGRES_URL' },
];

/**
 * Load environment variables from file
 */
async function loadEnvFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const env = {};

    content.split('\n').forEach((line) => {
      line = line.trim();
      if (line && !line.startsWith('#') && line.includes('=')) {
        const [key, ...valueParts] = line.split('=');
        const value = valueParts.join('=').replace(/^["']|["']$/g, '');
        env[key.trim()] = value;
      }
    });

    return env;
  } catch (error) {
    console.error(`❌ Failed to load ${filePath}:`, error.message);
    return {};
  }
}

/**
 * Set a secret in Doppler
 */
async function setDopplerSecret(project, config, name, value) {
  try {
    await execAsync(
      `${DOPPLER_CMD} secrets set ${name}="${value}" --project ${project} --config ${config}`,
    );
    return true;
  } catch (error) {
    console.error(`❌ Failed to set ${name}: ${error.message}`);
    return false;
  }
}

/**
 * Migrate P0 secrets (dry run)
 */
async function migrateP0Secrets(dryRun = true) {
  console.log('🚀 Testing P0 Secret Migration\n');

  // Load environment file
  console.log(`📄 Loading environment from: ${TEST_CONFIG.envFile}`);
  const env = await loadEnvFile(TEST_CONFIG.envFile);
  console.log(`✅ Loaded ${Object.keys(env).length} environment variables\n`);

  // Process P0 secrets
  console.log('🔒 P0 Critical Secrets Migration:');
  let migratedCount = 0;
  let errorCount = 0;

  for (const secret of P0_SECRETS) {
    const value = env[secret.legacy];

    if (!value) {
      console.log(`  ❌ ${secret.legacy} → ${secret.doppler}: Missing in .env`);
      errorCount++;
      continue;
    }

    if (dryRun) {
      const maskedValue =
        value.length > 10
          ? `${value.substring(0, 3)}...${value.substring(value.length - 3)}`
          : '*'.repeat(value.length);
      console.log(
        `  🔍 DRY RUN: ${secret.legacy} → ${secret.doppler} = ${maskedValue}`,
      );
      migratedCount++;
    } else {
      const success = await setDopplerSecret(
        TEST_CONFIG.project,
        TEST_CONFIG.config,
        secret.doppler,
        value,
      );
      if (success) {
        console.log(`  ✅ ${secret.legacy} → ${secret.doppler}: Migrated`);
        migratedCount++;
      } else {
        errorCount++;
      }
    }
  }

  // Summary
  console.log(`\n📊 Migration Summary:`);
  console.log(`  ✅ Migrated: ${migratedCount}`);
  console.log(`  ❌ Errors: ${errorCount}`);
  console.log(
    `  📈 Success Rate: ${Math.round((migratedCount / P0_SECRETS.length) * 100)}%`,
  );

  if (dryRun) {
    console.log(
      `\n💡 This was a dry run. To perform actual migration, run with --execute flag`,
    );
  }

  return { migratedCount, errorCount, success: errorCount === 0 };
}

/**
 * Check current Doppler secrets
 */
async function checkDopplerSecrets() {
  try {
    const { stdout } = await execAsync(
      `${DOPPLER_CMD} secrets --project ${TEST_CONFIG.project} --config ${TEST_CONFIG.config} --json`,
    );
    const secrets = JSON.parse(stdout);

    console.log(
      `\n🔍 Current Doppler Secrets (${TEST_CONFIG.project}/${TEST_CONFIG.config}):`,
    );
    const secretNames = Object.keys(secrets);

    if (secretNames.length === 0) {
      console.log('  📭 No secrets found');
    } else {
      secretNames.forEach((name) => {
        console.log(`  🔑 ${name}`);
      });
    }

    return secrets;
  } catch (error) {
    console.error('❌ Failed to check Doppler secrets:', error.message);
    return {};
  }
}

/**
 * Main test function
 */
async function runTest() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');

  console.log('🧪 Phase 2.2 Migration Test\n');
  console.log(`📋 Configuration:`);
  console.log(`  Project: ${TEST_CONFIG.project}`);
  console.log(`  Config: ${TEST_CONFIG.config}`);
  console.log(`  Source: ${TEST_CONFIG.envFile}`);
  console.log(`  Mode: ${dryRun ? 'DRY RUN' : 'EXECUTE'}\n`);

  try {
    // Check current state
    await checkDopplerSecrets();

    // Perform migration
    const result = await migrateP0Secrets(dryRun);

    if (result.success) {
      console.log('\n🎉 Migration test completed successfully!');

      if (!dryRun) {
        console.log(
          '\n🔗 View secrets: https://dashboard.doppler.com/workplace/projects/gs-scaffold-api/configs/dev_main',
        );
      }
    } else {
      console.log('\n❌ Migration test completed with errors');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
runTest();
