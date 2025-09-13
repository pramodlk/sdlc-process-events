const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
let firebaseApp;

const initializeFirebase = () => {
  if (!firebaseApp) {
    try {
      // Decode the base64 encoded private key
      // const privateKey = Buffer.from(process.env.FIREBASE_PRIVATE_KEY, 'base64').toString('utf8');
      
      const serviceAccount = {
        type: "service_account",
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
      };

      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID
      });
      
      console.log('Firebase initialized successfully');
    } catch (error) {
      console.error('Error initializing Firebase:', error);
      throw error;
    }
  }
  return firebaseApp;
};

const getFirestore = () => {
  const app = initializeFirebase();
  return admin.firestore(app);
};

/**
 * Process a single event and store it in Firestore
 * @param {Object} eventData - The event data to process
 * @param {string} eventData.sessionId - Session ID
 * @param {string} eventData.agentName - Agent name (source)
 * @param {string} eventData.event - Event description
 * @param {string} eventData.createdAt - ISO timestamp
 */
const processEvent = async (eventData) => {
  try {
    console.log('Processing event:', JSON.stringify(eventData));
    
    // Validate required fields
    if (!eventData.sessionId || !eventData.agentName || !eventData.event || !eventData.createdAt) {
      throw new Error('Missing required fields: sessionId, agentName, event, or createdAt');
    }

    const db = getFirestore();
    const collectionName = process.env.FIRESTORE_COLLECTION_NAME || 'sdlc-events';
    const collection = db.collection(collectionName);

    // Convert ISO timestamp to Firestore timestamp
    const createdAtDate = new Date(eventData.createdAt);
    const firestoreTimestamp = admin.firestore.Timestamp.fromDate(createdAtDate);

    // Create the event object to add
    const newEvent = {
      createdAt: firestoreTimestamp,
      source: eventData.agentName,
      event: eventData.event
    };

    // Query for existing document with the same sessionId
    const querySnapshot = await collection.where('sessionId', '==', eventData.sessionId).get();

    if (querySnapshot.empty) {
      // Create new document if sessionId doesn't exist
      const newDoc = {
        sessionId: eventData.sessionId,
        events: [newEvent]
      };
      
      const docRef = await collection.add(newDoc);
      console.log(`Created new document with ID: ${docRef.id} for sessionId: ${eventData.sessionId}`);
    } else {
      // Update existing document by adding the new event to the events array
      const existingDoc = querySnapshot.docs[0];
      await existingDoc.ref.update({
        events: admin.firestore.FieldValue.arrayUnion(newEvent)
      });
      console.log(`Updated existing document with ID: ${existingDoc.id} for sessionId: ${eventData.sessionId}`);
    }

    return {
      success: true,
      message: `Event processed successfully for sessionId: ${eventData.sessionId}`
    };
  } catch (error) {
    console.error('Error processing event:', error);
    throw error;
  }
};

/**
 * Lambda handler function
 * @param {Object} event - AWS Lambda event object
 * @param {Object} context - AWS Lambda context object
 * @returns {Object} Response object
 */
exports.handler = async (event, context) => {
  console.log('Received event:', JSON.stringify(event, null, 2));
  
  try {
    let results = [];

    // Handle SQS events
    if (event.Records && event.Records.length > 0) {
      console.log(`Processing ${event.Records.length} SQS messages`);
      
      for (const record of event.Records) {
        try {
          if (record.eventSource === 'aws:sqs') {
            const messageBody = JSON.parse(record.body);
            const result = await processEvent(messageBody);
            results.push(result);
          }
        } catch (error) {
          console.error('Error processing SQS record:', error);
          results.push({
            success: false,
            error: error.message,
            record: record.messageId
          });
        }
      }
    }
    
    // Handle API Gateway events
    else if (event.httpMethod && event.httpMethod === 'POST') {
      console.log('Processing API Gateway request');
      
      try {
        let requestBody;
        
        // Parse the request body
        if (typeof event.body === 'string') {
          requestBody = JSON.parse(event.body);
        } else {
          requestBody = event.body;
        }
        
        const result = await processEvent(requestBody);
        results.push(result);
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'POST,OPTIONS'
          },
          body: JSON.stringify({
            message: 'Event processed successfully',
            result: result
          })
        };
      } catch (error) {
        console.error('Error processing API request:', error);
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            error: 'Bad Request',
            message: error.message
          })
        };
      }
    }
    
    // Handle OPTIONS request for CORS
    else if (event.httpMethod && event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Methods': 'POST,OPTIONS'
        },
        body: ''
      };
    }
    
    else {
      console.log('Unknown event type');
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Unsupported event type'
        })
      };
    }

    // Return results for SQS processing
    console.log('Processing completed:', JSON.stringify(results));
    return {
      statusCode: 200,
      processedRecords: results.length,
      results: results
    };

  } catch (error) {
    console.error('Handler error:', error);
    
    // For API Gateway requests, return proper HTTP response
    if (event.httpMethod) {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Internal Server Error',
          message: error.message
        })
      };
    }
    
    // For SQS, throw the error to trigger retry mechanism
    throw error;
  }
};