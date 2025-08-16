/**
 * Test file for Doppler Project Setup
 * Phase 2.1: Validation and Testing
 */

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * Simple Doppler validation check
 */
async function checkDopplerAuthentication() {
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

async function listDopplerProjects() {
  try {
    const { stdout } = await execAsync('doppler projects --json');
    const projects = JSON.parse(stdout);
    return projects.map((p) => ({
      name: p.name,
      description: p.description,
    }));
  } catch {
    return [];
  }
}

// Manual testing function
async function testDopplerSetup() {
  console.log('🔧 Testing Doppler Project Setup...\n');

  try {
    // Test 1: Authentication check
    console.log('1. Checking authentication...');
    const auth = await checkDopplerAuthentication();
    console.log(
      `   Authentication: ${auth.authenticated ? '✅ Authenticated' : '❌ Not authenticated'}`,
    );
    if (auth.user) {
      console.log(`   User: ${auth.user}`);
    }

    // Test 2: List projects
    console.log('\n2. Listing existing projects...');
    const projects = await listDopplerProjects();
    console.log(`   Found ${projects.length} projects:`);
    projects.forEach((p) =>
      console.log(`   - ${p.name}: ${p.description || 'No description'}`),
    );

    // Test 3: Check if gs-scaffold project exists
    console.log('\n3. Checking for gs-scaffold-api project...');
    const gsProject = projects.find((p) => p.name === 'gs-scaffold-api');
    if (gsProject) {
      console.log('   ✅ gs-scaffold-api project exists');
    } else {
      console.log(
        '   ℹ️  gs-scaffold-api project not found - ready for creation',
      );
    }

    console.log('\n✅ Doppler setup test completed successfully');
  } catch (error) {
    console.error('❌ Doppler setup test failed:', error);
  }
}

// Run the test
testDopplerSetup().catch(console.error);
