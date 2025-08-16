// Simple test to check OPA integration after configuration changes
const axios = require('axios');

async function testOpaIntegration() {
  console.log('🔍 Testing OPA Integration...\n');

  try {
    // 1. Test OPA health
    console.log('1. Testing OPA Health Check...');
    const healthResponse = await axios.get('http://localhost:8181/health');
    console.log('✅ OPA is running');

    // 2. Test our new policy
    console.log('\n2. Testing OPA Policy Direct Call...');
    const testInput = {
      input: {
        subject: {
          id: 'e9edbcb6-3320-4f73-a8ce-a7065b44ce25',
          tenant: 'core',
          roles: ['manage-account', 'manage-account-links', 'view-profile'],
          client_id: 'backoffice-user',
        },
        action: {
          type: 'GET',
          name: 'view',
        },
        resource: {
          type: 'product',
          tenant: 'core',
          id: '1',
        },
        context: {
          correlationId: 'test-123',
          time: new Date().toISOString(),
          environment: 'dev',
        },
      },
    };

    const policyResponse = await axios.post(
      'http://localhost:8181/v1/data/authz/decisions/allow',
      testInput,
    );
    console.log(
      '✅ OPA Policy Response:',
      JSON.stringify(policyResponse.data, null, 2),
    );

    // 3. Test application endpoint
    console.log('\n3. Testing Application JWT Endpoint...');
    const jwtToken =
      'eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJDclR5eU44TkozdnVSMDdRbmZ3UVNCNWg5LUtEU2x1Q2cxNFBtMFU4WHE4In0.eyJleHAiOjE3NTUzMTU3NTcsImlhdCI6MTc1NTMxMjE1NywianRpIjoib25ydHJvOmU1NjhhMWYzLWQxZWEtZDk1My02YjcwLTVmZjExNTFiZjZkZiIsImlzcyI6Imh0dHBzOi8vZ3NrZXljbG9hazEtdTE5NjY4LnZtLmVsZXN0aW8uYXBwL3JlYWxtcy9kZWZhdWx0IiwiYXVkIjoiYWNjb3VudCIsInN1YiI6ImU5ZWRiY2I2LTMzMjAtNGY3My1hOGNlLWE3MDY1YjQ0Y2UyNSIsInR5cCI6IkJlYXJlciIsImF6cCI6ImJhY2tvZmZpY2UtdXNlciIsInNpZCI6IjVkYzQ2ZjdmLWUyYWQtNGU3ZS04ZTEwLWViMjAwODM4ZWMzMiIsImFjciI6IjEiLCJhbGxvd2VkLW9yaWdpbnMiOlsiKiJdLCJyZWFsbV9hY2Nlc3MiOnsicm9sZXMiOlsib2ZmbGluZV9hY2Nlc3MiLCJkZWZhdWx0LXJvbGVzLWRlZmF1bHQiLCJ1bWFfYXV0aG9yaXphdGlvbiJdfSwicmVzb3VyY2VfYWNjZXNzIjp7ImFjY291bnQiOnsicm9sZXMiOlsibWFuYWdlLWFjY291bnQiLCJtYW5hZ2UtYWNjb3VudC1saW5rcyIsInZpZXctcHJvZmlsZSJdfX0sInNjb3BlIjoicHJvZmlsZSBlbWFpbCIsInRlbmFudF9pZCI6IjEyMzQ1IiwiZW1haWxfdmVyaWZpZWQiOnRydWUsIm5hbWUiOiJNYXJjIEdpbmdlciIsInByZWZlcnJlZF91c2VybmFtZSI6Im1hcmMuZ2luZ2VyIiwiZ2l2ZW5fbmFtZSI6Ik1hcmMiLCJmYW1pbHlfbmFtZSI6IkdpbmdlciIsInRlbmFudCI6ImNvcmUiLCJlbWFpbCI6Im1hcmMucy5naW5nZXJAZ21haWwuY29tIn0.O2ic8uspI_A9DVdffmQ85U9OoW9IF4Wi0NWMG8WFxKDob8wqscuhdWfZIylwkBEfpcnpvqjXoqTJxjx41nU3bUJIAAgAcMoZV15kn0wMBO6y83NcYcE4QYyaXa0R0BRuMritra7UPKczMaEoTOYg6UZdhf3bCf3OYXu7uvUTemN0X1liIYCErzChq5cVp44jI4xlwQCc0OMbqgXV1GnzVix5RoaLKkNK5VkAEG1AsEa7T2KEcGr_hOIxPa56RIaSdM-5r9dMJG8yASp3xtiNKB0iDCkF3QhSz2De-0AV3keY1Ti0XJnn_rh2Fuhucm5mD5L3ICUC39o4EKaPny30yQ';

    try {
      const appResponse = await axios.get(
        'http://localhost:3010/auth-test/products/1',
        {
          headers: { Authorization: `Bearer ${jwtToken}` },
        },
      );
      console.log(
        '✅ Application OPA Endpoint Success:',
        JSON.stringify(appResponse.data, null, 2),
      );
    } catch (appError) {
      console.log('❌ Application OPA Endpoint Error:');
      console.log('Status:', appError.response?.status);
      console.log(
        'Error:',
        JSON.stringify(appError.response?.data || appError.message, null, 2),
      );
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error(
        'Response data:',
        JSON.stringify(error.response.data, null, 2),
      );
    }
  }
}

testOpaIntegration();
