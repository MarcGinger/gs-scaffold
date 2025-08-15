/**
 * Interactive Doppler Project Setup Script
 * Phase 2.1: Project Creation and Configuration
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const readline = require('readline');

const execAsync = promisify(exec);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (prompt) =>
  new Promise((resolve) => rl.question(prompt, resolve));

async function checkAuthentication() {
  try {
    const { stdout } = await execAsync('doppler me');
    const result = JSON.parse(stdout);
    return {
      authenticated: true,
      user: result.email || result.name,
    };
  } catch {
    return { authenticated: false };
  }
}

async function authenticate() {
  console.log('Opening browser for Doppler authentication...');
  try {
    await execAsync('doppler login');
    return await checkAuthentication();
  } catch (error) {
    console.error('Authentication failed:', error.message);
    return { authenticated: false };
  }
}

async function listProjects() {
  try {
    const { stdout } = await execAsync('doppler projects --json');
    return JSON.parse(stdout);
  } catch {
    return [];
  }
}

async function createProject(name, description = '') {
  try {
    const descArg = description ? `--description "${description}"` : '';
    await execAsync(`doppler projects create ${name} ${descArg}`);
    console.log(`✅ Created project: ${name}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to create project ${name}:`, error.message);
    return false;
  }
}

async function createConfig(project, config, description = '') {
  try {
    await execAsync(`doppler configs create ${config} --project ${project}`);
    console.log(`✅ Created config: ${config} in ${project}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to create config ${config}:`, error.message);
    return false;
  }
}

async function setSecret(project, config, name, value) {
  try {
    await execAsync(
      `doppler secrets set ${name}="${value}" --project ${project} --config ${config}`,
    );
    return true;
  } catch (error) {
    console.error(`❌ Failed to set secret ${name}:`, error.message);
    return false;
  }
}

async function createServiceToken(name, project, config, access = 'read') {
  try {
    const { stdout } = await execAsync(
      `doppler service-tokens create ${name} --project ${project} --config ${config} --access ${access} --plain`,
    );
    return stdout.trim();
  } catch (error) {
    console.error(`❌ Failed to create service token ${name}:`, error.message);
    return null;
  }
}

const defaultDevSecrets = {
  // Core Application
  APP_CORE_NAME: 'gs-scaffold',
  APP_CORE_VERSION: '0.0.1',
  APP_RUNTIME_ENVIRONMENT: 'development',
  APP_SERVER_PORT: '3000',
  APP_SERVER_PROTOCOL: 'http',
  APP_SERVER_HOST: 'localhost',

  // Database
  DATABASE_POSTGRES_HOST: 'localhost',
  DATABASE_POSTGRES_PORT: '5432',
  DATABASE_POSTGRES_NAME: 'postgres',
  DATABASE_POSTGRES_USER: 'postgres',
  DATABASE_POSTGRES_PASSWORD: 'dev-password-change-me',

  // Cache/Redis
  CACHE_REDIS_URL: 'redis://localhost:6379',

  // EventStore
  EVENTSTORE_ESDB_CONNECTION_STRING: 'esdb://localhost:2113?tls=false',

  // Authentication
  AUTH_KEYCLOAK_URL: 'http://localhost:8080',
  AUTH_KEYCLOAK_REALM: 'gs-scaffold',
  AUTH_KEYCLOAK_CLIENT_ID: 'gs-scaffold-api',
  AUTH_KEYCLOAK_CLIENT_SECRET: 'dev-client-secret-change-me',
  AUTH_JWT_AUDIENCE: 'gs-scaffold-api',

  // Security
  SECURITY_PII_ENCRYPTION_KEY: 'dev-encryption-key-32-chars-change-in-prod',
  SECURITY_OPA_URL: 'http://localhost:8181',

  // Logging
  LOGGING_CORE_LEVEL: 'debug',
  LOGGING_CORE_SINK: 'console',
  LOGGING_CORE_PRETTY_ENABLED: 'true',
};

async function setupGsScaffoldProject() {
  console.log('🚀 GS-Scaffold Doppler Project Setup\n');

  // Step 1: Check authentication
  console.log('1. Checking authentication...');
  let auth = await checkAuthentication();

  if (!auth.authenticated) {
    console.log('❌ Not authenticated with Doppler');
    const shouldAuth = await question(
      'Do you want to authenticate now? (y/n): ',
    );
    if (shouldAuth.toLowerCase() === 'y') {
      auth = await authenticate();
      if (!auth.authenticated) {
        console.log('❌ Authentication failed. Exiting...');
        return;
      }
    } else {
      console.log('ℹ️  Authentication required. Run: doppler login');
      return;
    }
  }

  console.log(`✅ Authenticated as: ${auth.user}\n`);

  // Step 2: Check existing projects
  console.log('2. Checking existing projects...');
  const projects = await listProjects();
  const gsProject = projects.find((p) => p.name === 'gs-scaffold-api');

  if (gsProject) {
    console.log('ℹ️  Project gs-scaffold-api already exists');
    const shouldContinue = await question(
      'Continue with environment setup? (y/n): ',
    );
    if (shouldContinue.toLowerCase() !== 'y') {
      console.log('Exiting...');
      return;
    }
  } else {
    console.log('📁 Creating gs-scaffold-api project...');
    const created = await createProject(
      'gs-scaffold-api',
      'GS Scaffold API Configuration and Secrets',
    );
    if (!created) return;
  }

  // Step 3: Create environments
  console.log('\n3. Setting up environments...');

  // Create dev environment
  await createConfig('gs-scaffold-api', 'dev');

  // Set development secrets
  console.log('📝 Setting development secrets...');
  let secretCount = 0;
  for (const [key, value] of Object.entries(defaultDevSecrets)) {
    const success = await setSecret('gs-scaffold-api', 'dev', key, value);
    if (success) secretCount++;
  }
  console.log(`✅ Set ${secretCount} development secrets\n`);

  // Create staging and prod environments (empty)
  await createConfig('gs-scaffold-api', 'staging');
  await createConfig('gs-scaffold-api', 'prod');

  // Step 4: Create service tokens
  console.log('4. Creating service tokens...');
  const devToken = await createServiceToken(
    'gs-scaffold-dev-token',
    'gs-scaffold-api',
    'dev',
    'read',
  );

  if (devToken) {
    console.log(
      `✅ Development token created: ${devToken.substring(0, 20)}...`,
    );
    console.log('\n📋 To use in your application:');
    console.log(`export DOPPLER_TOKEN="${devToken}"`);
    console.log('or add to your .env file:');
    console.log(`DOPPLER_TOKEN=${devToken}`);
  }

  console.log('\n🎉 Setup complete!');
  console.log('\nNext steps:');
  console.log('1. Save your service token securely');
  console.log('2. Update your application to use Doppler');
  console.log('3. Configure staging and production environments manually');
  console.log(
    '\nProject URL: https://dashboard.doppler.com/workplace/projects/gs-scaffold-api',
  );
}

// Run the setup
setupGsScaffoldProject()
  .then(() => {
    rl.close();
  })
  .catch((error) => {
    console.error('❌ Setup failed:', error);
    rl.close();
  });
