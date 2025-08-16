/**
 * Test file for snapshot conversion methods
 */

const {
  generateSnapshotConversionMethods,
  generateSnapshotConversionMethod,
  generateComplexObjectSnapshotConversion,
  generateSimpleObjectSnapshotConversion,
} = require('./generate-repository-cleaned');

// Test the snapshot conversion functions
function testSnapshotConversion() {
  console.log('🧪 Testing Snapshot Conversion Methods...\n');

  // Mock schema and table for testing
  const mockSchema = {
    parameters: {
      'user-profile': {
        store: { read: 'sql', write: 'sql' },
      },
      'user-settings': {
        store: { read: 'redis', write: 'redis' },
      },
    },
    tables: {
      'user-profile': {
        name: 'user-profile',
        cols: [
          { name: 'id', pk: true, type: 'string', datatype: 'VARCHAR' },
          { name: 'settings', type: 'json', datatype: 'JSON' },
          {
            name: 'preferences',
            type: 'json',
            datatype: 'JSON',
            defaultvalue: 'object()',
          },
        ],
        _relationships: [
          {
            childCol: 'settings',
            parentTable: 'user-settings',
            c_p: 'one',
            c_ch: 'one',
          },
          {
            childCol: 'preferences',
            parentTable: 'user-preferences',
            c_p: 'many',
            c_ch: 'many',
          },
        ],
      },
      'user-settings': {
        name: 'user-settings',
        cols: [
          { name: 'id', pk: true, type: 'string', datatype: 'VARCHAR' },
          { name: 'theme', type: 'string', datatype: 'VARCHAR' },
        ],
        _relationships: [
          {
            childCol: 'preferences',
            parentCol: 'id',
            c_p: 'many',
            c_ch: 'many',
          },
        ],
      },
    },
  };

  const mockTable = {
    name: 'user-profile',
    cols: [
      { name: 'id', pk: true, type: 'string', datatype: 'VARCHAR' },
      { name: 'settings', type: 'json', datatype: 'JSON' },
      {
        name: 'preferences',
        type: 'json',
        datatype: 'JSON',
        defaultvalue: 'object()',
      },
    ],
    _relationships: [
      {
        childCol: 'settings',
        parentTable: 'user-settings',
        c_p: 'one',
        c_ch: 'one',
      },
      {
        childCol: 'preferences',
        parentTable: 'user-preferences',
        c_p: 'many',
        c_ch: 'many',
      },
    ],
  };

  const imports = {};
  const lines = [];

  try {
    console.log('📝 Generating snapshot conversion methods...');

    // Test the main function
    generateSnapshotConversionMethods(mockSchema, mockTable, imports, lines);

    console.log('✅ Generation successful!');
    console.log('\n📄 Generated code:');
    console.log('=' + '='.repeat(50));
    console.log(lines.join('\n'));
    console.log('=' + '='.repeat(50));

    // Verify key components are present
    const code = lines.join('\n');
    const hasConvertMethod =
      code.includes('convertUserSettingsToSnapshot') ||
      code.includes('convertUserPreferencesToSnapshot');
    const hasJSDoc = code.includes('* Converts I');
    const hasPropertyMapping =
      code.includes('Explicit property mapping') || code.includes('return {');
    const hasRecordHandling = code.includes('Record<string');
    const hasPrivateMethod = code.includes('private convert');

    console.log('\n🔍 Verification Results:');
    console.log(`✅ Conversion method generated: ${hasConvertMethod}`);
    console.log(`✅ JSDoc documentation: ${hasJSDoc}`);
    console.log(`✅ Property mapping: ${hasPropertyMapping}`);
    console.log(`✅ Record type handling: ${hasRecordHandling}`);
    console.log(`✅ Private method modifier: ${hasPrivateMethod}`);

    // Check imports
    const hasImports = Object.keys(imports).length > 0;
    console.log(`✅ Imports generated: ${hasImports}`);

    if (
      hasConvertMethod &&
      hasJSDoc &&
      hasPropertyMapping &&
      hasPrivateMethod
    ) {
      console.log(
        '\n🎉 All tests passed! Snapshot conversion generation working correctly.',
      );
    } else {
      console.log('\n❌ Some tests failed. Check the implementation.');
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// Test simple object conversion
function testSimpleObjectConversion() {
  console.log('\n🧪 Testing Simple Object Conversion...\n');

  const mockSchema = {
    tables: {
      'user-profile': {
        name: 'user-profile',
        cols: [{ name: 'id', pk: true, type: 'string', datatype: 'VARCHAR' }],
      },
    },
  };

  const mockTable = {
    name: 'user-profile',
    cols: [{ name: 'id', pk: true, type: 'string', datatype: 'VARCHAR' }],
  };

  const imports = {};
  const lines = [];

  const mockCol = {
    name: 'settings',
    type: 'json',
    datatype: 'JSON',
    defaultvalue: 'object()',
  };

  const mockRelationship = {
    childCol: 'settings',
    parentTable: 'user-settings',
    c_p: 'many',
    c_ch: 'many',
  };

  try {
    console.log('📝 Generating simple object conversion...');

    generateSimpleObjectSnapshotConversion(
      mockSchema,
      mockTable,
      imports,
      lines,
      mockCol,
      mockRelationship,
    );

    console.log('✅ Generation successful!');
    console.log('\n📄 Generated code:');
    console.log('=' + '='.repeat(30));
    console.log(lines.join('\n'));
    console.log('=' + '='.repeat(30));

    const code = lines.join('\n');
    const hasRecordType = code.includes('Record<string');
    const hasSpreadOperator = code.includes('...settings');
    const hasExplicitMapping = code.includes('Explicit property mapping');

    console.log('\n🔍 Simple Object Verification:');
    console.log(`✅ Record type handling: ${hasRecordType}`);
    console.log(`✅ Spread operator: ${hasSpreadOperator}`);
    console.log(`✅ Explicit mapping comment: ${hasExplicitMapping}`);
  } catch (error) {
    console.error('❌ Simple object test failed:', error.message);
  }
}

// Run the tests
testSnapshotConversion();
testSimpleObjectConversion();
