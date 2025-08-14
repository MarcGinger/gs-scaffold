/**
 * Connection Test Script
 * Tests connectivity to Redis and EventStore DB
 */

const Redis = require('ioredis');
const { EventStoreDBClient } = require('@eventstore/db-client');

async function testConnections() {
  console.log('🔌 Testing Database Connections\n');

  // Test Redis Connection
  console.log('📊 Testing Redis Connection...');
  let redisConnected = false;
  let redis = null;

  try {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      connectTimeout: 5000,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });

    await redis.connect();

    // Test basic operations
    await redis.set('test:connection', 'ok');
    const result = await redis.get('test:connection');
    await redis.del('test:connection');

    if (result === 'ok') {
      console.log('✅ Redis: Connected and operational');
      console.log(
        `   URL: ${process.env.REDIS_URL || 'redis://localhost:6379'}`,
      );
      redisConnected = true;
    }
  } catch (error) {
    console.log('❌ Redis: Connection failed');
    console.log(`   Error: ${error.message}`);
    console.log(`   URL: ${process.env.REDIS_URL || 'redis://localhost:6379'}`);
  } finally {
    if (redis) {
      try {
        await redis.quit();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  console.log('');

  // Test EventStore DB Connection
  console.log('🗃️  Testing EventStore DB Connection...');
  let esdbConnected = false;
  let client = null;

  try {
    const connectionString =
      process.env.ESDB_CONNECTION_STRING || 'esdb://localhost:2113?tls=false';

    client = EventStoreDBClient.connectionString(connectionString);

    // Test connection with a simple read operation
    const readResult = client.readAll({
      direction: 'forwards',
      fromPosition: 'start',
      maxCount: 1,
    });

    // Try to read just one event to test connectivity
    let eventFound = false;
    for await (const event of readResult) {
      eventFound = true;
      break; // Just need to read one to test connection
    }

    console.log('✅ EventStore DB: Connected and operational');
    console.log(`   URL: ${connectionString}`);
    console.log(
      `   Test read: ${eventFound ? 'Found events' : 'No events (empty store)'}`,
    );
    esdbConnected = true;
  } catch (error) {
    console.log('❌ EventStore DB: Connection failed');
    console.log(`   Error: ${error.message}`);
    console.log(
      `   URL: ${process.env.ESDB_CONNECTION_STRING || 'esdb://localhost:2113?tls=false'}`,
    );

    // Check if it's a common connection issue
    if (error.message.includes('ECONNREFUSED')) {
      console.log(
        '   💡 Hint: Make sure EventStore DB is running on port 2113',
      );
    } else if (error.message.includes('ENOTFOUND')) {
      console.log('   💡 Hint: Check the hostname in your connection string');
    }
  } finally {
    if (client) {
      try {
        client.dispose();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  console.log('');

  // Summary
  console.log('📋 Connection Summary:');
  console.log(`   Redis: ${redisConnected ? '✅ Ready' : '❌ Failed'}`);
  console.log(`   EventStore DB: ${esdbConnected ? '✅ Ready' : '❌ Failed'}`);

  if (redisConnected && esdbConnected) {
    console.log('\n🎉 All databases are ready for EventStore infrastructure!');
    return true;
  } else {
    console.log(
      '\n⚠️  Some databases are not available. Check the errors above.',
    );
    return false;
  }
}

// Environment variable hints
console.log('🔧 Environment Variables:');
console.log(
  `   REDIS_URL: ${process.env.REDIS_URL || 'redis://localhost:6379 (default)'}`,
);
console.log(
  `   ESDB_CONNECTION_STRING: ${process.env.ESDB_CONNECTION_STRING || 'esdb://localhost:2113?tls=false (default)'}`,
);
console.log('');

// Run the test
testConnections()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  });
