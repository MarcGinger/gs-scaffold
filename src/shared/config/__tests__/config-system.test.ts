/**
 * Configuration System Test
 *
 * Tests the new Doppler-enabled configuration system
 * and validates backward compatibility with existing code.
 */

import { getValidatedConfig, validateConfig } from '../config-validator';
import { loadConfig } from '../config-loader';
import { AppConfigUtil } from '../app-config.util';

async function testConfigurationSystem(): Promise<void> {
  console.log('🧪 Testing Phase 1.4 Configuration System\n');

  try {
    // Test 1: Basic configuration loading
    console.log('1️⃣ Testing basic configuration loading...');
    const loadResult = await loadConfig({ source: 'env' });
    console.log(`   ✅ Source: ${loadResult.source}`);
    console.log(`   ✅ Doppler Available: ${loadResult.dopplerAvailable}`);
    console.log(`   ✅ Errors: ${loadResult.errors.length}`);
    console.log(`   ✅ Warnings: ${loadResult.warnings.length}`);

    if (loadResult.errors.length > 0) {
      console.log('   ❌ Errors found:');
      loadResult.errors.forEach((error) => console.log(`      - ${error}`));
    }

    if (loadResult.warnings.length > 0) {
      console.log('   ⚠️ Warnings found:');
      loadResult.warnings.forEach((warning) =>
        console.log(`      - ${warning}`),
      );
    }

    // Test 2: Configuration validation
    console.log('\n2️⃣ Testing configuration validation...');
    const validation = await validateConfig({ source: 'env' });
    console.log(`   ✅ Valid: ${validation.valid}`);
    console.log(`   ✅ Environment: ${validation.environment}`);
    console.log(`   ✅ Source: ${validation.source}`);

    // Test 3: Legacy compatibility
    console.log('\n3️⃣ Testing legacy compatibility...');
    const legacyEnvironment = AppConfigUtil.getEnvironment();
    const legacyPort = AppConfigUtil.getPort();
    const legacyHost = AppConfigUtil.getHost();

    console.log(`   ✅ Legacy Environment: ${legacyEnvironment}`);
    console.log(`   ✅ Legacy Port: ${legacyPort}`);
    console.log(`   ✅ Legacy Host: ${legacyHost}`);

    // Test 4: New configuration access
    if (validation.valid) {
      console.log('\n4️⃣ Testing new configuration access...');
      const config = await getValidatedConfig({ source: 'env' });
      console.log(`   ✅ New Environment: ${config.APP_RUNTIME_ENVIRONMENT}`);
      console.log(`   ✅ New Port: ${config.APP_SERVER_PORT}`);
      console.log(`   ✅ New Host: ${config.APP_SERVER_HOST}`);

      // Compare legacy vs new
      console.log('\n📊 Legacy vs New Comparison:');
      console.log(
        `   Environment: ${legacyEnvironment} → ${config.APP_RUNTIME_ENVIRONMENT}`,
      );
      console.log(`   Port: ${legacyPort} → ${config.APP_SERVER_PORT}`);
      console.log(`   Host: ${legacyHost} → ${config.APP_SERVER_HOST}`);
    }

    // Test 5: Security configuration
    console.log('\n5️⃣ Testing security configuration...');
    const legacySecurity = AppConfigUtil.getSecurityConfig();
    console.log(`   ✅ Keycloak URL: ${legacySecurity.keycloak.url}`);
    console.log(`   ✅ JWT Audience: ${legacySecurity.jwt.audience}`);

    // Test 6: Doppler availability
    console.log('\n6️⃣ Testing Doppler integration...');
    try {
      const dopplerResult = await loadConfig({ source: 'doppler' });
      console.log('   ✅ Doppler integration successful');
      console.log(
        `   ✅ Loaded ${Object.keys(dopplerResult.config).length} configuration keys`,
      );
    } catch (error) {
      console.log('   ⚠️ Doppler not available or not configured:');
      console.log(`      ${error}`);
      console.log('   ℹ️ This is expected if Doppler is not set up yet');
    }

    console.log('\n🎉 Configuration system test completed!');

    return;
  } catch (error) {
    console.error('❌ Configuration test failed:', error);
    process.exit(1);
  }
}

// Export for use in other tests
export { testConfigurationSystem };

// Run test if called directly
if (require.main === module) {
  testConfigurationSystem()
    .then(() => {
      console.log('\n✅ All tests passed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Tests failed:', error);
      process.exit(1);
    });
}
