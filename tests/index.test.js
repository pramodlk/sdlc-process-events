const { handler } = require('../src/index');

// Mock Firebase Admin SDK
const mockBatch = {
  delete: jest.fn(),
  commit: jest.fn()
};

const mockDoc = {
  ref: {
    update: jest.fn()
  }
};

const mockQuerySnapshot = {
  empty: false,
  docs: [mockDoc]
};

const mockEmptyQuerySnapshot = {
  empty: true,
  docs: []
};

const mockCollection = {
  where: jest.fn(() => ({
    get: jest.fn()
  })),
  add: jest.fn()
};

const mockFirestore = {
  collection: jest.fn(() => mockCollection),
  batch: jest.fn(() => mockBatch)
};

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn()
  },
  firestore: jest.fn(() => mockFirestore),
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
    mockCollection.where().get.mockResolvedValue(mockEmptyQuerySnapshot);
    
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

  test('should handle flush event from analysis-agent', async () => {
    mockCollection.where().get.mockResolvedValue(mockQuerySnapshot);
    
    const event = {
      httpMethod: 'POST',
      body: JSON.stringify({
        sessionId: 'test-session',
        agentName: 'analysis-agent',
        event: 'Flush',
        createdAt: '2025-01-15T10:30:00.000Z'
      })
    };

    const result = await handler(event, {});
    
    expect(result.statusCode).toBe(200);
    const responseBody = JSON.parse(result.body);
    expect(responseBody.result.action).toBe('flush');
    expect(responseBody.result.deletedDocuments).toBe(1);
    expect(mockBatch.delete).toHaveBeenCalled();
    expect(mockBatch.commit).toHaveBeenCalled();
  });

  test('should handle flush event when no documents exist', async () => {
    mockCollection.where().get.mockResolvedValue(mockEmptyQuerySnapshot);
    
    const event = {
      httpMethod: 'POST',
      body: JSON.stringify({
        sessionId: 'test-session',
        agentName: 'analysis-agent',
        event: 'Flush',
        createdAt: '2025-01-15T10:30:00.000Z'
      })
    };

    const result = await handler(event, {});
    
    expect(result.statusCode).toBe(200);
    const responseBody = JSON.parse(result.body);
    expect(responseBody.result.action).toBe('flush');
    expect(responseBody.result.deletedDocuments).toBe(0);
    expect(mockBatch.delete).not.toHaveBeenCalled();
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
    mockCollection.where().get.mockResolvedValue(mockEmptyQuerySnapshot);
    
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

  test('should handle SQS flush event', async () => {
    mockCollection.where().get.mockResolvedValue(mockQuerySnapshot);
    
    const event = {
      Records: [
        {
          eventSource: 'aws:sqs',
          messageId: 'test-message-1',
          body: JSON.stringify({
            sessionId: 'test-session',
            agentName: 'analysis-agent',
            event: 'Flush',
            createdAt: '2025-01-15T10:30:00.000Z'
          })
        }
      ]
    };

    const result = await handler(event, {});
    
    expect(result.statusCode).toBe(200);
    expect(result.results[0].action).toBe('flush');
    expect(mockBatch.delete).toHaveBeenCalled();
    expect(mockBatch.commit).toHaveBeenCalled();
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