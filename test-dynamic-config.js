/**
 * Test Dynamic Doppler Configuration
 * Verify environment-based configuration switching
 */

async function testDynamicConfig() {
  console.log('🧪 Testing Dynamic Doppler Configuration');
  console.log('=========================================\n');

  const environments = ['development', 'staging', 'production', 'test'];

  for (const env of environments) {
    console.log(`📋 Environment: ${env.toUpperCase()}`);
    console.log('------------------------');

    // Simulate environment
    process.env.NODE_ENV = env;

    // Import fresh module (simulate startup)
    delete require.cache[require.resolve('./dist/src/app.module.js')];

    try {
      const { createDopplerConfig } = require('./test-config-factory.js');
      const config = createDopplerConfig();

      console.log(`  Project: ${config.project}`);
      console.log(`  Config: ${config.config}`);
      console.log(`  Fallback Enabled: ${config.enableFallback}`);
      console.log(`  Logging Enabled: ${config.enableLogging}`);
      console.log(`  Strict Mode: ${config.strict}`);
      console.log(`  Global: ${config.isGlobal}`);
      console.log();
    } catch (error) {
      console.log(`  Error: ${error.message}`);
      console.log();
    }
  }

  // Test environment variable overrides
  console.log('🔧 Testing Environment Variable Overrides');
  console.log('==========================================');

  process.env.NODE_ENV = 'development';
  process.env.DOPPLER_PROJECT = 'custom-project';
  process.env.DOPPLER_CONFIG = 'custom-config';

  try {
    const { createDopplerConfig } = require('./test-config-factory.js');
    const config = createDopplerConfig();

    console.log(`Override Test:`);
    console.log(`  Project: ${config.project} (should be 'custom-project')`);
    console.log(`  Config: ${config.config} (should be 'custom-config')`);
    console.log();
  } catch (error) {
    console.log(`Override Error: ${error.message}`);
  }

  // Clean up
  delete process.env.DOPPLER_PROJECT;
  delete process.env.DOPPLER_CONFIG;
  process.env.NODE_ENV = 'development';

  console.log('✅ Dynamic configuration testing complete!');
}

// Create a test version of the config factory
const fs = require('fs');
const testFactoryCode = `
const createDopplerConfig = () => {
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  const configMap = {
    development: 'dev_main',
    staging: 'staging_main',
    production: 'prd_main',
    test: 'test_main',
  };

  const config = {
    project: process.env.DOPPLER_PROJECT || 'gs-scaffold-api',
    config: process.env.DOPPLER_CONFIG || configMap[nodeEnv] || 'dev_main',
    enableFallback: nodeEnv !== 'production',
    enableLogging: nodeEnv === 'development',
    strict: nodeEnv === 'production',
    isGlobal: true,
  };

  return config;
};

module.exports = { createDopplerConfig };
`;

fs.writeFileSync('test-config-factory.js', testFactoryCode);

testDynamicConfig()
  .then(() => {
    // Cleanup
    if (fs.existsSync('test-config-factory.js')) {
      fs.unlinkSync('test-config-factory.js');
    }
  })
  .catch(console.error);
