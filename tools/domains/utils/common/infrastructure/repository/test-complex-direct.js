/**
 * Direct test for complex object generation functions
 */

const {
  generateComplexObjectMethods,
  generateComplexObjectMethod,
  generateComplexObjectValidationMethod,
} = require('./generate-repository-cleaned');

// Create a simple test
function testComplexObjectFunctionsDirect() {
  console.log('🧪 Testing Complex Object Functions Directly...\n');

  // Mock data
  const mockSchema = {
    parameters: {
      'user-profile': {
        store: { read: 'sql', write: 'sql' },
      },
      'user-settings': {
        store: { read: 'redis', write: 'redis' },
      },
    },
  };

  const mockTable = {
    name: 'user-profile',
    cols: [
      { name: 'id', pk: true, type: 'string', datatype: 'VARCHAR' },
      { name: 'name', type: 'string', datatype: 'VARCHAR' },
    ],
    indexes: [],
    _relationships: [],
  };

  const mockComplexObjects = [
    {
      key: 'configuration',
      function: 'getConfiguration',
      tableName: 'user-profile',
      tables: [
        {
          table_name: 'user-settings',
          childCol: { name: 'settings', type: 'string' },
          parentCol: { name: 'id', type: 'string' },
          type: 'one',
        },
        {
          table_name: 'user-preferences',
          childCol: { name: 'preferences', type: 'string' },
          parentCol: { name: 'id', type: 'string' },
          type: 'many',
        },
      ],
    },
  ];

  const mockErrors = {
    'user-profile': {},
  };

  const imports = {};
  const lines = [];

  try {
    console.log('📝 Generating complex object methods...');

    // Test the main function
    generateComplexObjectMethods(
      mockSchema,
      mockTable,
      imports,
      lines,
      mockComplexObjects,
      mockErrors,
    );

    console.log('✅ Generation successful!');
    console.log('\n📄 Generated code:');
    console.log('=' + '='.repeat(50));
    console.log(lines.join('\n'));
    console.log('=' + '='.repeat(50));

    // Verify key components are present
    const code = lines.join('\n');
    const hasGetConfiguration = code.includes('async getConfiguration(');
    const hasValidateSettings = code.includes('validateSettings(');
    const hasValidatePreferences = code.includes('validatePreferences(');
    const hasPromiseAll = code.includes('Promise.all([');
    const hasErrorHandling = code.includes('catch (error)');
    const hasJSDoc = code.includes('* Retrieves a complex object');

    console.log('\n🔍 Verification Results:');
    console.log(`✅ getConfiguration method: ${hasGetConfiguration}`);
    console.log(`✅ validateSettings method: ${hasValidateSettings}`);
    console.log(`✅ validatePreferences method: ${hasValidatePreferences}`);
    console.log(`✅ Promise.all parallel execution: ${hasPromiseAll}`);
    console.log(`✅ Error handling: ${hasErrorHandling}`);
    console.log(`✅ JSDoc documentation: ${hasJSDoc}`);

    if (
      hasGetConfiguration &&
      hasValidateSettings &&
      hasValidatePreferences &&
      hasPromiseAll &&
      hasErrorHandling &&
      hasJSDoc
    ) {
      console.log(
        '\n🎉 All tests passed! Complex object generation working correctly.',
      );
    } else {
      console.log('\n❌ Some tests failed. Check the implementation.');
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// Run the test
testComplexObjectFunctionsDirect();
