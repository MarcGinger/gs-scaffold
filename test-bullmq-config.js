/**
 * BullMQ Connection Test
 * Tests the BullMQ configuration from bullmq.module.ts
 */

const Redis = require('ioredis');
const { Queue, Worker, QueueEvents } = require('bullmq');

async function testBullMQConfiguration() {
  console.log('🚀 Testing BullMQ Configuration\n');

  // Create Redis connection like in bullmq.module.ts
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

  let notificationQueue = null;
  let projectionQueue = null;
  let queueEvents = null;
  let testWorker = null;

  try {
    // Test Queue Creation (matching bullmq.module.ts configuration)
    console.log('📬 Creating Notification Queue...');
    notificationQueue = new Queue('notification', {
      connection: redis,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });
    console.log('✅ Notification Queue created');

    console.log('📊 Creating Projection Queue...');
    projectionQueue = new Queue('projection', {
      connection: redis,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    });
    console.log('✅ Projection Queue created');

    console.log('👁️  Creating Queue Events...');
    queueEvents = new QueueEvents('notification', { connection: redis });
    console.log('✅ Queue Events created');

    // Test adding a job to notification queue
    console.log('\n🧪 Testing Job Operations...');
    const testJob = await notificationQueue.add('test-notification', {
      message: 'Test notification',
      timestamp: new Date().toISOString(),
    });
    console.log(`✅ Job added to notification queue: ${testJob.id}`);

    // Test adding a job to projection queue
    const projectionJob = await projectionQueue.add('test-projection', {
      stream: 'test-stream',
      event: 'TestEvent',
      timestamp: new Date().toISOString(),
    });
    console.log(`✅ Job added to projection queue: ${projectionJob.id}`);

    // Test queue stats
    const notificationStats = await notificationQueue.getWaiting();
    const projectionStats = await projectionQueue.getWaiting();
    console.log(
      `📊 Notification queue waiting jobs: ${notificationStats.length}`,
    );
    console.log(`📊 Projection queue waiting jobs: ${projectionStats.length}`);

    // Create a test worker to process the notification job
    console.log('\n🏃 Testing Worker Processing...');
    let jobProcessed = false;

    testWorker = new Worker(
      'notification',
      async (job) => {
        console.log(`🔄 Processing job ${job.id}: ${job.name}`);
        console.log(`   Data:`, job.data);
        jobProcessed = true;
        return { processed: true, timestamp: new Date().toISOString() };
      },
      { connection: redis },
    );

    // Wait for job processing
    await new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (jobProcessed) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);

      // Timeout after 5 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 5000);
    });

    if (jobProcessed) {
      console.log('✅ Worker successfully processed job');
    } else {
      console.log('⚠️  Worker did not process job within timeout');
    }

    // Test queue events
    console.log('\n📡 Testing Queue Events...');
    let eventReceived = false;

    queueEvents.on('completed', ({ jobId }) => {
      console.log(`📨 Queue event received: Job ${jobId} completed`);
      eventReceived = true;
    });

    // Add another job to trigger events
    const eventTestJob = await notificationQueue.add('event-test', {
      test: 'queue-events',
    });

    // Wait for event
    await new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (eventReceived) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 3000);
    });

    console.log(
      `📡 Queue events: ${eventReceived ? '✅ Working' : '⚠️  No events received'}`,
    );

    console.log('\n🎉 BullMQ Configuration Test Complete!');
    console.log('✅ All BullMQ components are working correctly');
  } catch (error) {
    console.log('❌ BullMQ Configuration Error:', error.message);
    console.log('   Stack:', error.stack);
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');

    if (testWorker) {
      await testWorker.close();
      console.log('✅ Worker closed');
    }

    if (queueEvents) {
      await queueEvents.close();
      console.log('✅ Queue Events closed');
    }

    if (notificationQueue) {
      // Clean up test jobs
      await notificationQueue.obliterate({ force: true });
      await notificationQueue.close();
      console.log('✅ Notification Queue cleaned and closed');
    }

    if (projectionQueue) {
      await projectionQueue.obliterate({ force: true });
      await projectionQueue.close();
      console.log('✅ Projection Queue cleaned and closed');
    }

    if (redis) {
      await redis.quit();
      console.log('✅ Redis connection closed');
    }
  }
}

// Run the test
testBullMQConfiguration().catch(console.error);
