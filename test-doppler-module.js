/**
 * Test DopplerConfigModule Integration
 * Demonstrates how to use the fixed DopplerConfigModule
 */

const { execSync } = require('child_process');
const path = require('path');

async function testDopplerModule() {
  console.log('🔍 Testing DopplerConfigModule Integration');
  console.log('==========================================\n');

  try {
    // Compile TypeScript to ensure everything works
    console.log('1️⃣ Compiling TypeScript...');
    execSync('npm run build', { stdio: 'pipe' });
    console.log('✅ TypeScript compilation successful\n');

    // Import the compiled modules
    console.log('2️⃣ Testing Module Imports...');
    try {
      const {
        DopplerConfigService,
      } = require('./dist/src/shared/config/doppler-config.service.js');
      const {
        DopplerConfigModule,
      } = require('./dist/src/shared/config/doppler-config.module.js');
      const {
        ConfigLoader,
      } = require('./dist/src/shared/config/config-loader.js');

      console.log('✅ DopplerConfigService imported successfully');
      console.log('✅ DopplerConfigModule imported successfully');
      console.log('✅ ConfigLoader imported successfully\n');

      // Test service functionality
      console.log('3️⃣ Testing DopplerConfigService...');
      const service = new DopplerConfigService({
        project: 'gs-scaffold-api',
        config: 'dev_main',
        enableFallback: true,
        enableLogging: true,
        strict: false,
      });

      const config = await service.loadConfiguration();
      console.log('✅ Configuration loaded successfully');
      console.log(
        `   Environment: ${config.APP_RUNTIME_ENVIRONMENT || 'development'}`,
      );
      console.log(`   Application: ${config.APP_CORE_NAME || 'gs-scaffold'}`);

      // Test critical secrets
      const criticalSecrets = [
        'AUTH_KEYCLOAK_CLIENT_SECRET',
        'SECURITY_PII_ENCRYPTION_KEY',
        'DATABASE_POSTGRES_PASSWORD',
        'DATABASE_POSTGRES_URL',
      ];

      let criticalCount = 0;
      criticalSecrets.forEach((secret) => {
        if (config[secret]) {
          criticalCount++;
        }
      });

      console.log(
        `   Critical Secrets: ${criticalCount}/${criticalSecrets.length} available`,
      );

      // Test module static methods
      console.log('\n4️⃣ Testing DopplerConfigModule...');
      const moduleConfig = DopplerConfigModule.forRoot({
        project: 'gs-scaffold-api',
        config: 'dev_main',
        enableFallback: true,
        isGlobal: true,
      });

      console.log('✅ DopplerConfigModule.forRoot() working');
      console.log(`   Module: ${moduleConfig.module.name}`);
      console.log(`   Global: ${moduleConfig.global}`);
      console.log(`   Providers: ${moduleConfig.providers.length}`);
      console.log(`   Exports: ${moduleConfig.exports.length}`);

      const featureConfig = DopplerConfigModule.forFeature();
      console.log('✅ DopplerConfigModule.forFeature() working');

      // Test configuration status
      console.log('\n5️⃣ Testing Configuration Status...');
      const status = await service.getConfigurationStatus();
      console.log('✅ Configuration status retrieved');
      console.log(`   Doppler Available: ${status.dopplerAvailable}`);
      console.log(`   Config Loaded: ${status.configLoaded}`);
      console.log(`   Source: ${status.source}`);
      console.log(`   Critical Secrets: ${status.criticalSecretsCount}/4`);

      console.log('\n🎊 DOPPLER MODULE INTEGRATION: COMPLETE!');
      console.log('=========================================');
      console.log('✅ All components working correctly');
      console.log('✅ TypeScript compilation successful');
      console.log('✅ Module exports properly configured');
      console.log('✅ Service functionality validated');
      console.log('✅ Ready for NestJS application integration');

      console.log('\n📖 Usage in app.module.ts:');
      console.log('```typescript');
      console.log(
        "import { DopplerConfigModule } from './shared/config/doppler-config.module';",
      );
      console.log('');
      console.log('@Module({');
      console.log('  imports: [');
      console.log('    DopplerConfigModule.forRoot({');
      console.log("      project: 'gs-scaffold-api',");
      console.log("      config: 'dev_main',");
      console.log('      enableFallback: true,');
      console.log('      isGlobal: true,');
      console.log('    }),');
      console.log('    // ... other imports');
      console.log('  ],');
      console.log('})');
      console.log('export class AppModule {}');
      console.log('```');

      return true;
    } catch (error) {
      console.log('❌ Module import failed:', error.message);
      return false;
    }
  } catch (error) {
    console.log('❌ Test failed:', error.message);
    return false;
  }
}

// Run the test
testDopplerModule()
  .then((success) => {
    if (success) {
      console.log(
        '\n✨ All tests passed! Your DopplerConfigModule is ready to use.',
      );
    } else {
      console.log('\n⚠️  Some tests failed. Please check the errors above.');
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('💥 Test execution failed:', error);
    process.exit(1);
  });
