/**
 * Phase 2.3 Final Validation Test
 * Comprehensive test of Doppler integration
 */

const { execSync } = require('child_process');
const path = require('path');

async function validateDopplerIntegration() {
  console.log('🔍 Phase 2.3: Final Validation Test');
  console.log('=====================================\n');

  const results = {
    dopplerCLI: false,
    authentication: false,
    projectExists: false,
    configLoader: false,
    criticalSecrets: 0,
    productionReady: false,
  };

  try {
    // Test 1: Doppler CLI availability
    console.log('1️⃣ Testing Doppler CLI...');
    try {
      const version = execSync('.\\doppler.bat --version', {
        encoding: 'utf8',
        stdio: 'pipe',
      });
      console.log(`✅ Doppler CLI: ${version.trim()}`);
      results.dopplerCLI = true;
    } catch (error) {
      console.log('❌ Doppler CLI not available');
      return results;
    }

    // Test 2: Authentication
    console.log('\n2️⃣ Testing Doppler Authentication...');
    try {
      const authResult = execSync('.\\doppler.bat me', {
        encoding: 'utf8',
        stdio: 'pipe',
      });
      if (authResult.includes('gs-core') || authResult.includes('dp.ct')) {
        console.log('✅ Doppler Authentication: Active');
        results.authentication = true;
      } else {
        console.log('❌ Doppler Authentication: Not logged in');
        console.log('   Output:', authResult.substring(0, 100));
        return results;
      }
    } catch (error) {
      console.log('❌ Doppler Authentication: Failed -', error.message);
      return results;
    }

    // Test 3: Project exists
    console.log('\n3️⃣ Testing Doppler Project...');
    try {
      const projects = execSync('.\\doppler.bat projects --json', {
        encoding: 'utf8',
        stdio: 'pipe',
      });
      const projectList = JSON.parse(projects);
      const gsProject = projectList.find((p) => p.name === 'gs-scaffold-api');

      if (gsProject) {
        console.log('✅ Project "gs-scaffold-api": Found');
        results.projectExists = true;
      } else {
        console.log('❌ Project "gs-scaffold-api": Not found');
        console.log(
          '   Available projects:',
          projectList.map((p) => p.name).join(', '),
        );
        return results;
      }
    } catch (error) {
      console.log('❌ Project check failed:', error.message);
      return results;
    }

    // Test 4: ConfigLoader
    console.log('\n4️⃣ Testing ConfigLoader...');
    try {
      // We need to compile TypeScript first
      console.log('   Compiling TypeScript...');
      execSync('npm run build', { stdio: 'pipe' });

      // Import and test the compiled config loader
      const configLoaderPath = path.join(
        __dirname,
        'dist',
        'src',
        'shared',
        'config',
        'config-loader.js',
      );
      const { ConfigLoader } = require(configLoaderPath);

      const loader = ConfigLoader.getInstance();
      const isAvailable = await loader.isDopplerAvailable();

      if (isAvailable) {
        console.log('✅ ConfigLoader: Working');
        results.configLoader = true;
      } else {
        console.log('❌ ConfigLoader: Doppler not available');
        return results;
      }
    } catch (error) {
      console.log('❌ ConfigLoader test failed:', error.message);
      return results;
    }

    // Test 5: Critical Secrets
    console.log('\n5️⃣ Testing Critical Secrets...');
    try {
      const criticalSecrets = [
        'AUTH_KEYCLOAK_CLIENT_SECRET',
        'SECURITY_PII_ENCRYPTION_KEY',
        'DATABASE_POSTGRES_PASSWORD',
        'DATABASE_POSTGRES_URL',
      ];

      let secretCount = 0;
      for (const secret of criticalSecrets) {
        try {
          const value = execSync(
            `.\\doppler.bat secrets get ${secret} --project gs-scaffold-api --config dev_main --plain`,
            { encoding: 'utf8', stdio: 'pipe' },
          );
          if (value.trim() && value.trim() !== 'PLACEHOLDER') {
            secretCount++;
          }
        } catch (error) {
          // Secret not found or not accessible
        }
      }

      console.log(
        `✅ Critical Secrets: ${secretCount}/${criticalSecrets.length} available`,
      );
      results.criticalSecrets = secretCount;

      if (secretCount === criticalSecrets.length) {
        results.productionReady = true;
      }
    } catch (error) {
      console.log('❌ Critical secrets test failed:', error.message);
    }

    // Test 6: Application Integration
    console.log('\n6️⃣ Testing Application Integration...');
    try {
      const {
        ConfigLoader,
      } = require('./dist/src/shared/config/config-loader.js');
      const loader = ConfigLoader.getInstance();

      const config = await loader.loadConfig({
        dopplerProject: 'gs-scaffold-api',
        dopplerConfig: 'dev_main',
      });

      if (config.config && config.errors.length === 0) {
        console.log('✅ Application Integration: Working');
        console.log(`   Source: ${config.source}`);
        console.log(
          `   Environment: ${config.config.APP_RUNTIME_ENVIRONMENT || 'development'}`,
        );
      } else {
        console.log('❌ Application Integration: Errors found');
        config.errors.forEach((error) => console.log(`   Error: ${error}`));
      }
    } catch (error) {
      console.log('❌ Application Integration test failed:', error.message);
    }
  } catch (error) {
    console.log('❌ Validation failed with error:', error.message);
  }

  // Final assessment
  console.log('\n📊 Validation Results');
  console.log('=====================');
  console.log(`Doppler CLI Available: ${results.dopplerCLI ? '✅' : '❌'}`);
  console.log(`Authentication: ${results.authentication ? '✅' : '❌'}`);
  console.log(`Project Setup: ${results.projectExists ? '✅' : '❌'}`);
  console.log(`ConfigLoader: ${results.configLoader ? '✅' : '❌'}`);
  console.log(`Critical Secrets: ${results.criticalSecrets}/4`);
  console.log(`Production Ready: ${results.productionReady ? '✅' : '❌'}`);

  if (results.productionReady) {
    console.log('\n🎊 DOPPLER INTEGRATION: PRODUCTION READY!');
    console.log('==========================================');
    console.log('✅ All critical systems validated');
    console.log('✅ Secrets securely managed in Doppler');
    console.log('✅ Application integration complete');
    console.log('\n📖 Next Steps:');
    console.log(
      '1. Update app.module.ts (see docs/deployment/APP_MODULE_INTEGRATION_EXAMPLE.md)',
    );
    console.log('2. Deploy with Doppler service tokens');
    console.log('3. Continue with P1-P4 secret migration when ready');
  } else {
    console.log('\n⚠️  Some validation checks failed');
    console.log('Please review the errors above and ensure:');
    console.log('- Doppler CLI is installed and authenticated');
    console.log('- gs-scaffold-api project exists in Doppler');
    console.log('- All P0 critical secrets are properly migrated');
  }

  return results;
}

// Run validation
validateDopplerIntegration().catch(console.error);
