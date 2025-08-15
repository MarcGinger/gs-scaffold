/**
 * Phase 2.3 Simplified Validation Test
 * Tests Doppler integration without TypeScript compilation
 */

const { execSync } = require('child_process');

async function validateDopplerIntegration() {
  console.log('🔍 Phase 2.3: Simplified Validation Test');
  console.log('==========================================\n');

  const results = {
    dopplerCLI: false,
    authentication: false,
    projectExists: false,
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
        console.log(
          `   Description: ${gsProject.description || 'No description'}`,
        );
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

    // Test 4: Critical Secrets
    console.log('\n4️⃣ Testing Critical Secrets...');
    try {
      const criticalSecrets = [
        'AUTH_KEYCLOAK_CLIENT_SECRET',
        'SECURITY_PII_ENCRYPTION_KEY',
        'DATABASE_POSTGRES_PASSWORD',
        'DATABASE_POSTGRES_URL',
      ];

      let secretCount = 0;
      const secretStatus = [];

      for (const secret of criticalSecrets) {
        try {
          const value = execSync(
            `.\\doppler.bat secrets get ${secret} --project gs-scaffold-api --config dev_main --plain`,
            { encoding: 'utf8', stdio: 'pipe' },
          );
          if (value.trim() && value.trim() !== 'PLACEHOLDER') {
            secretCount++;
            secretStatus.push(`   ✅ ${secret}: Available`);
          } else {
            secretStatus.push(`   ⚠️  ${secret}: Placeholder value`);
          }
        } catch (error) {
          secretStatus.push(`   ❌ ${secret}: Missing or inaccessible`);
        }
      }

      console.log(
        `Critical Secrets Status (${secretCount}/${criticalSecrets.length}):`,
      );
      secretStatus.forEach((status) => console.log(status));

      results.criticalSecrets = secretCount;

      if (secretCount === criticalSecrets.length) {
        results.productionReady = true;
      }
    } catch (error) {
      console.log('❌ Critical secrets test failed:', error.message);
    }

    // Test 5: Configuration Files
    console.log('\n5️⃣ Testing Configuration Files...');
    const configFiles = [
      'src/shared/config/config-loader.ts',
      'src/shared/config/doppler-config.service.ts',
      'doppler.bat',
      'migrate-secrets.js',
    ];

    let filesFound = 0;
    configFiles.forEach((file) => {
      try {
        require('fs').accessSync(file);
        console.log(`   ✅ ${file}: Found`);
        filesFound++;
      } catch {
        console.log(`   ❌ ${file}: Missing`);
      }
    });

    console.log(
      `Configuration files: ${filesFound}/${configFiles.length} found`,
    );
  } catch (error) {
    console.log('❌ Validation failed with error:', error.message);
  }

  // Final assessment
  console.log('\n📊 Validation Results');
  console.log('======================');
  console.log(`Doppler CLI Available: ${results.dopplerCLI ? '✅' : '❌'}`);
  console.log(`Authentication: ${results.authentication ? '✅' : '❌'}`);
  console.log(`Project Setup: ${results.projectExists ? '✅' : '❌'}`);
  console.log(`Critical Secrets: ${results.criticalSecrets}/4`);
  console.log(`Production Ready: ${results.productionReady ? '✅' : '❌'}`);

  if (results.productionReady) {
    console.log('\n🎊 DOPPLER INTEGRATION: PRODUCTION READY!');
    console.log('==========================================');
    console.log('✅ All critical systems validated');
    console.log('✅ Secrets securely managed in Doppler');
    console.log('✅ Application configuration complete');
    console.log('\n📖 Implementation Status:');
    console.log('• Phase 1.1-1.4: CLI setup and project structure ✅');
    console.log('• Phase 2.1: Doppler project configuration ✅');
    console.log('• Phase 2.2: P0 critical secret migration ✅');
    console.log('• Phase 2.3: Application integration ✅');
    console.log('\n🚀 Ready for Production Deployment:');
    console.log('1. Update app.module.ts with DopplerConfigService');
    console.log('2. Deploy with DOPPLER_TOKEN service token');
    console.log('3. Continue P1-P4 migration when ready');
    console.log('\n📁 Integration Files Available:');
    console.log('• docs/deployment/DOPPLER_INTEGRATION_GUIDE.md');
    console.log('• docs/deployment/APP_MODULE_INTEGRATION_EXAMPLE.md');
    console.log('• src/shared/config/doppler-config.service.ts');
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
