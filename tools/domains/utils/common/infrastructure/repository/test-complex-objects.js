/**
 * Test file for complex object generation functionality
 */

const { generateRepository } = require('./generate-repository-cleaned');

// Add _relationships to schema tables
const mockSchema = {
  parameters: {
    'user-profile': {
      store: { read: 'sql', write: 'sql' },
      type: 'entity',
    },
    'user-settings': {
      store: { read: 'redis', write: 'redis' },
      type: 'entity',
    },
    'user-preferences': {
      store: { read: 'mongo', write: 'mongo' },
      type: 'entity',
    },
  },
  tables: {
    'user-profile': {
      name: 'user-profile',
      cols: [
        { name: 'id', pk: true, type: 'string', datatype: 'VARCHAR' },
        { name: 'name', type: 'string', datatype: 'VARCHAR' },
        { name: 'settings', type: 'json', datatype: 'JSON' },
      ],
      _relationships: [
        {
          childTable: 'user-profile',
          parentTable: 'user-settings',
          childCol: 'settings',
          parentCol: 'id',
          c_p: 'one',
          c_ch: 'one',
          parentClass: 'UserSettings',
        },
      ],
    },
    'user-settings': {
      name: 'user-settings',
      cols: [
        { name: 'id', pk: true, type: 'string', datatype: 'VARCHAR' },
        { name: 'theme', type: 'string', datatype: 'VARCHAR' },
        { name: 'configuration', pk: true, type: 'json', datatype: 'JSON' },
      ],
      _relationships: [
        {
          childTable: 'user-settings',
          parentTable: 'user-preferences',
          childCol: 'preferences',
          parentCol: 'id',
          c_p: 'many',
          c_ch: 'many',
          parentClass: 'UserPreferences',
        },
      ],
    },
    'user-preferences': {
      name: 'user-preferences',
      cols: [
        { name: 'id', pk: true, type: 'string', datatype: 'VARCHAR' },
        { name: 'language', type: 'string', datatype: 'VARCHAR' },
      ],
      _relationships: [],
    },
  },
};

const mockTable = {
  name: 'user-profile',
  cols: [
    {
      name: 'id',
      pk: true,
      type: 'string',
      datatype: 'VARCHAR',
      defaultvalue: 'uuid()',
    },
    { name: 'name', type: 'string', datatype: 'VARCHAR' },
    { name: 'settings', type: 'json', datatype: 'JSON' },
  ],
  indexes: [],
  _relationships: [
    {
      childTable: 'user-profile',
      parentTable: 'user-settings',
      childCol: 'settings',
      parentCol: 'id',
      c_p: 'one',
      c_ch: 'one',
      parentClass: 'UserSettings',
    },
  ],
};

// Mock complex objects
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

// Mock tools module
const mockTools = {
  getComplexObjects: (schema, table) => mockComplexObjects,
  getComplexRelationships: (schema, table) => [],
};

// Mock errors object
const mockErrors = {
  'user-profile': {
    userRequiredForOperation: {
      message: 'User context is required for UserProfile operations',
      code: 'USER_REQUIRED_FOR_OPERATION_USER_PROFILE',
    },
  },
};

// Test the complex object generation
async function testComplexObjectGeneration() {
  console.log('🧪 Testing Complex Object Generation...\n');

  try {
    // Test what getComplexObjects returns
    const { getComplexObjects } = require('../tools');
    const complexObjects = getComplexObjects(mockSchema, mockTable);

    console.log(
      '🔍 Complex objects found:',
      JSON.stringify(complexObjects, null, 2),
    );
    console.log('📊 Number of complex objects:', complexObjects.length);

    const result = generateRepository(mockSchema, mockTable, mockErrors);

    console.log('✅ Generation successful!');
    console.log('\n📄 Generated code preview:');
    console.log('=' + '='.repeat(50));

    // Show method signatures and key parts
    const lines = result.split('\n');
    const methodLines = lines.filter((line, index) => {
      return (
        line.includes('async ') ||
        line.includes('getConfiguration') ||
        line.includes('validateSettings') ||
        line.includes('validatePreferences') ||
        line.includes('Promise.all') ||
        line.includes('complex object') ||
        line.includes('* Retrieves a')
      );
    });

    console.log(methodLines.join('\n'));
    console.log('=' + '='.repeat(50));

    // Verify key components are present
    const hasGetConfiguration = result.includes('async getConfiguration(');
    const hasValidateSettings = result.includes('validateSettings(');
    const hasValidatePreferences = result.includes('validatePreferences(');
    const hasPromiseAll = result.includes('Promise.all([');
    const hasErrorHandling = result.includes('catch (error)');

    console.log('\n🔍 Verification Results:');
    console.log(`✅ getConfiguration method: ${hasGetConfiguration}`);
    console.log(`✅ validateSettings method: ${hasValidateSettings}`);
    console.log(`✅ validatePreferences method: ${hasValidatePreferences}`);
    console.log(`✅ Promise.all parallel execution: ${hasPromiseAll}`);
    console.log(`✅ Error handling: ${hasErrorHandling}`);

    if (
      hasGetConfiguration &&
      hasValidateSettings &&
      hasValidatePreferences &&
      hasPromiseAll &&
      hasErrorHandling
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
testComplexObjectGeneration();
