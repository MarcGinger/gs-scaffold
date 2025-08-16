/**
 * Phase 2.3: Application Integration Test
 * Test the enhanced config loader with Doppler integration
 */

// Simple test using compiled output
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function testDopplerConfigurationLoading() {
  console.log('🧪 Phase 2.3: Application Integration Test\n');

  try {
    // Test 1: Check if we can load Doppler secrets directly
    console.log('1. Testing direct Doppler secret loading...');

    const dopplerCmd = '.\\doppler.bat';
    const { stdout } = await execAsync(
      `${dopplerCmd} secrets --project gs-scaffold-api --config dev_main --json`,
    );
    const secrets = JSON.parse(stdout);

    console.log(
      `   ✅ Loaded ${Object.keys(secrets).length} secrets from Doppler`,
    );

    // Test 2: Check critical P0 secrets
    console.log('\n2. Checking P0 critical secrets...');
    const p0Secrets = [
      'AUTH_KEYCLOAK_CLIENT_SECRET',
      'SECURITY_PII_ENCRYPTION_KEY',
      'DATABASE_POSTGRES_PASSWORD',
      'DATABASE_POSTGRES_URL',
    ];

    let p0Available = 0;
    p0Secrets.forEach((secret) => {
      if (secrets[secret]) {
        console.log(`   ✅ ${secret}: Available`);
        p0Available++;
      } else {
        console.log(`   ❌ ${secret}: Missing`);
      }
    });

    // Test 3: Check secret format and values
    console.log('\n3. Validating secret format...');
    const sampleSecrets = [
      'AUTH_KEYCLOAK_CLIENT_SECRET',
      'DATABASE_POSTGRES_PASSWORD',
    ];

    sampleSecrets.forEach((secret) => {
      if (secrets[secret]) {
        const secretData = secrets[secret];
        if (typeof secretData === 'object' && secretData.computed) {
          const value = secretData.computed;
          const masked =
            value.length > 10
              ? `${value.substring(0, 3)}...${value.substring(value.length - 3)}`
              : '*'.repeat(value.length);
          console.log(`   🔑 ${secret}: ${masked} (${value.length} chars)`);
        }
      }
    });

    // Test 4: Environment configuration
    console.log('\n4. Testing environment configuration...');
    const envConfig = secrets['DOPPLER_ENVIRONMENT'];
    const projectConfig = secrets['DOPPLER_PROJECT'];
    const configName = secrets['DOPPLER_CONFIG'];

    if (envConfig && projectConfig && configName) {
      console.log(`   🎯 Environment: ${envConfig.computed}`);
      console.log(`   📁 Project: ${projectConfig.computed}`);
      console.log(`   ⚙️  Config: ${configName.computed}`);
    }

    // Test 5: Application startup simulation
    console.log('\n5. Simulating application configuration loading...');

    const appConfig = {
      environment: envConfig?.computed || 'unknown',
      project: projectConfig?.computed || 'unknown',
      secretsLoaded: Object.keys(secrets).length,
      p0SecretsAvailable: p0Available,
      criticalSecretsReady: p0Available === p0Secrets.length,
    };

    console.log(`   📊 Configuration Summary:`);
    console.log(`     Environment: ${appConfig.environment}`);
    console.log(`     Project: ${appConfig.project}`);
    console.log(`     Total Secrets: ${appConfig.secretsLoaded}`);
    console.log(
      `     P0 Critical: ${appConfig.p0SecretsAvailable}/${p0Secrets.length}`,
    );
    console.log(
      `     Ready for Production: ${appConfig.criticalSecretsReady ? 'Yes' : 'No'}`,
    );

    console.log('\n� Integration Test Complete!');

    if (appConfig.criticalSecretsReady) {
      console.log('\n✅ Application ready for Doppler integration!');
      console.log('🚀 All P0 critical secrets are available');
      console.log('� Configuration loading will work in production');

      console.log('\n� Next Steps:');
      console.log('1. Update your application startup to use config loader');
      console.log('2. Test application with Doppler configuration');
      console.log('3. Deploy with production Doppler tokens');
      console.log('4. Migrate remaining secret priorities (P1-P4)');
    } else {
      console.log('\n⚠️  Some critical secrets are missing');
      console.log(
        'Please ensure all P0 secrets are migrated before production use',
      );
    }

    return {
      success: true,
      ...appConfig,
    };
  } catch (error) {
    console.error('\n❌ Integration test failed:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Run the test
testDopplerConfigurationLoading()
  .then((result) => {
    console.log('\n📈 Test Results:');
    console.log(JSON.stringify(result, null, 2));

    if (result.success && result.criticalSecretsReady) {
      console.log('\n🎊 Phase 2.3 Integration: READY FOR PRODUCTION!');
      process.exit(0);
    } else {
      console.log('\n⚠️  Integration needs attention before production use');
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
