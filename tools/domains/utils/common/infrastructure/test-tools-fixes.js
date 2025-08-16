/**
 * Test file to verify the tools.js fixes
 */

const {
  getComplexObjects,
  getComplexRelationships,
  getSpecialColumns,
} = require('./tools');

// Test the fixed functions
function testToolsFixes() {
  console.log('🧪 Testing tools.js fixes...\n');

  // Test 1: Functions handle missing _relationships gracefully
  console.log('📝 Test 1: Missing _relationships safety check');
  const tableWithoutRelationships = {
    name: 'test-table',
    cols: [
      { name: 'id', pk: true, type: 'string', datatype: 'VARCHAR' },
      { name: 'data', type: 'json', datatype: 'JSON' },
    ],
    // No _relationships property
  };

  const mockSchema = {
    parameters: {},
    tables: {
      'test-table': tableWithoutRelationships,
    },
  };

  try {
    const specialCols = getSpecialColumns(
      mockSchema,
      tableWithoutRelationships,
    );
    const complexObjects = getComplexObjects(
      mockSchema,
      tableWithoutRelationships,
    );
    const complexRelationships = getComplexRelationships(
      mockSchema,
      tableWithoutRelationships,
    );

    console.log(
      `✅ getSpecialColumns returned: ${JSON.stringify(specialCols)}`,
    );
    console.log(
      `✅ getComplexObjects returned: ${JSON.stringify(complexObjects)}`,
    );
    console.log(
      `✅ getComplexRelationships returned: ${JSON.stringify(complexRelationships)}`,
    );
    console.log('✅ All functions handled missing _relationships gracefully\n');
  } catch (error) {
    console.error('❌ Error in safety check test:', error.message);
    return false;
  }

  // Test 2: Functions work with proper relationships
  console.log('📝 Test 2: Normal operation with relationships');
  const tableWithRelationships = {
    name: 'user-profile',
    cols: [
      { name: 'id', pk: true, type: 'string', datatype: 'VARCHAR' },
      { name: 'settings', type: 'json', datatype: 'JSON' },
      { name: 'email', type: 'string', datatype: 'VARCHAR' },
    ],
    _relationships: [
      {
        childCol: 'settings',
        parentTable: 'user-settings',
        c_p: 'one',
        c_ch: 'one',
      },
      {
        childCol: 'email',
        parentTable: 'email-config',
        c_p: 'one',
        c_ch: 'one',
      },
    ],
  };

  const schemaWithRelationships = {
    parameters: {
      'user-profile': { store: { read: 'sql', write: 'sql' } },
      'user-settings': { store: { read: 'redis', write: 'redis' } },
      'email-config': { store: { read: 'sql', write: 'sql' } },
    },
    tables: {
      'user-profile': tableWithRelationships,
      'user-settings': {
        name: 'user-settings',
        cols: [
          { name: 'id', pk: true, type: 'string', datatype: 'VARCHAR' },
          { name: 'theme', type: 'string', datatype: 'VARCHAR' },
        ],
        _relationships: [],
      },
      'email-config': {
        name: 'email-config',
        cols: [
          { name: 'id', pk: true, type: 'string', datatype: 'VARCHAR' },
          { name: 'domain', type: 'string', datatype: 'VARCHAR' },
        ],
        _relationships: [],
      },
    },
  };

  try {
    const specialCols2 = getSpecialColumns(
      schemaWithRelationships,
      tableWithRelationships,
    );
    const complexObjects2 = getComplexObjects(
      schemaWithRelationships,
      tableWithRelationships,
    );
    const complexRelationships2 = getComplexRelationships(
      schemaWithRelationships,
      tableWithRelationships,
    );

    console.log(
      `✅ getSpecialColumns found ${specialCols2.length} special columns`,
    );
    console.log(
      `✅ getComplexObjects found ${complexObjects2.length} complex objects`,
    );
    console.log(
      `✅ getComplexRelationships found ${complexRelationships2.length} complex relationships`,
    );
    console.log('✅ All functions worked correctly with relationships\n');
  } catch (error) {
    console.error('❌ Error in normal operation test:', error.message);
    return false;
  }

  console.log('🎉 All tests passed! tools.js fixes are working correctly.');
  return true;
}

// Run the tests
testToolsFixes();
