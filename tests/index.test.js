const { handler } = require('../src/index');

// Mock Firebase Admin SDK
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn()
  },
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      where: jest.fn(() => ({
        get: jest.fn()
      })),
      add: jest.fn()
    }))
  })),
  Timestamp: {
    fromDate: jest.fn((date) => ({ seconds: Math.floor(date.getTime() / 1000), nanoseconds: 0 }))
  },
  FieldValue: {
    arrayUnion: jest.fn()
  }
}));

describe('Process Events Lambda Handler', () => {
  beforeEach(() => {
    // Set up environment variables
    process.env.FIRESTORE_COLLECTION_NAME = 'test-events';
    process.env.FIREBASE_PROJECT_ID = 'test-project';
    process.env.FIREBASE_PRIVATE_KEY = Buffer.from('test-private-key').toString('base64');
    process.env.FIREBASE_CLIENT_EMAIL = 'test@test.iam.gserviceaccount.com';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should handle API Gateway POST request', async () => {
    const event = {
      httpMethod: 'POST',
      body: JSON.stringify({
        sessionId: 'test-session',
        agentName: 'Test Agent',
        event: 'Test Event',
        createdAt: '2025-01-15T10:30:00.000Z'
      })
    };

    const result = await handler(event, {});
    
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toHaveProperty('message', 'Event processed successfully');
  });

  test('should handle API Gateway OPTIONS request', async () => {
    const event = {
      httpMethod: 'OPTIONS'
    };

    const result = await handler(event, {});
    
    expect(result.statusCode).toBe(200);
    expect(result.headers).toHaveProperty('Access-Control-Allow-Origin', '*');
  });

  test('should handle SQS event', async () => {
    const event = {
      Records: [
        {
          eventSource: 'aws:sqs',
          messageId: 'test-message-1',
          body: JSON.stringify({
            sessionId: 'test-session',
            agentName: 'Test Agent',
            event: 'Test Event',
            createdAt: '2025-01-15T10:30:00.000Z'
          })
        }
      ]
    };

    const result = await handler(event, {});
    
    expect(result.statusCode).toBe(200);
    expect(result.processedRecords).toBe(1);
  });

  test('should return 400 for invalid API request', async () => {
    const event = {
      httpMethod: 'POST',
      body: JSON.stringify({
        sessionId: 'test-session'
        // Missing required fields
      })
    };

    const result = await handler(event, {});
    
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toHaveProperty('error', 'Bad Request');
  });
});