# Process Events Lambda Function

This AWS SAM application processes events from two sources:
1. **SQS Queue** - Automatically processes messages from an SQS queue
2. **API Gateway** - Processes events via HTTP POST requests

Events are stored in a Firebase Firestore database with proper document organization by sessionId.

## Architecture

- **Lambda Function**: Processes events and stores them in Firestore
- **SQS Queue**: Message queue for asynchronous event processing
- **Dead Letter Queue**: Handles failed message processing
- **API Gateway**: REST endpoint for direct event submission
- **Firestore**: Document database for event storage

## Event Schema

Both SQS messages and API requests should follow this schema:

```json
{
  "sessionId": "string",
  "agentName": "string", 
  "event": "string",
  "createdAt": "ISO timestamp"
}
```

## Firestore Storage

Events are stored in Firestore with the following structure:
- Collection name is configurable via SAM parameter
- Documents are organized by `sessionId`
- Each document contains an array of events
- Events include `createdAt` (Firestore timestamp), `source` (agentName), and `event` description

## Prerequisites

1. **AWS CLI** configured with appropriate permissions
2. **SAM CLI** installed
3. **Node.js 18.x** or later
4. **Firebase Project** with Firestore enabled
5. **Firebase Service Account** with Firestore permissions

## Firebase Setup

1. Create a Firebase project and enable Firestore
2. Generate a service account key:
   - Go to Firebase Console → Project Settings → Service Accounts
   - Click "Generate new private key"
   - Download the JSON file
3. Extract the required values:
   - `project_id`
   - `private_key` (base64 encode this value)
   - `client_email`

## Deployment

1. **Install dependencies**:
   ```bash
   cd src
   npm install
   cd ..
   ```

2. **Build the application**:
   ```bash
   sam build
   ```

3. **Deploy with guided deployment**:
   ```bash
   sam deploy --guided
   ```

   You'll be prompted for:
   - Stack name
   - AWS Region
   - SQS Queue name
   - Firestore collection name
   - Firebase project ID
   - Firebase private key (base64 encoded)
   - Firebase client email

4. **Or deploy with parameters**:
   ```bash
   sam deploy --parameter-overrides \
     SQSQueueName=my-events-queue \
     FirestoreCollectionName=my-events \
     FirebaseProjectId=my-firebase-project \
     FirebasePrivateKey=<base64-encoded-private-key> \
     FirebaseClientEmail=my-service-account@my-project.iam.gserviceaccount.com
   ```

## Usage

### API Endpoint

Send POST requests to the API Gateway endpoint:

```bash
curl -X POST https://your-api-id.execute-api.region.amazonaws.com/prod/process-event \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-123",
    "agentName": "Analyst Agent",
    "event": "Created Dev Spec",
    "createdAt": "2025-01-15T10:30:00.000Z"
  }'
```

### SQS Queue

Send messages to the SQS queue using AWS SDK or AWS CLI:

```bash
aws sqs send-message \
  --queue-url https://sqs.region.amazonaws.com/account/queue-name \
  --message-body '{
    "sessionId": "session-123",
    "agentName": "Coding Agent",
    "event": "Pulled the git Repo",
    "createdAt": "2025-01-15T10:35:00.000Z"
  }'
```

## Configuration

The following parameters can be configured during deployment:

- `SQSQueueName`: Name of the SQS queue (default: process-events-queue)
- `FirestoreCollectionName`: Firestore collection name (default: sdlc-events)
- `FirebaseProjectId`: Your Firebase project ID
- `FirebasePrivateKey`: Base64 encoded Firebase private key
- `FirebaseClientEmail`: Firebase service account email

## Monitoring

- **CloudWatch Logs**: Lambda function logs
- **CloudWatch Metrics**: Lambda invocations, errors, and duration
- **SQS Metrics**: Queue depth, message processing rates
- **Dead Letter Queue**: Failed message processing

## Error Handling

- SQS messages are automatically retried up to 3 times
- Failed messages are moved to the Dead Letter Queue
- API requests return appropriate HTTP status codes
- All errors are logged to CloudWatch

## Local Development

To test locally:

1. **Start SAM local API**:
   ```bash
   sam local start-api
   ```

2. **Invoke function locally**:
   ```bash
   sam local invoke ProcessEventsFunction --event events/api-event.json
   ```

## Cleanup

To delete the stack and all resources:

```bash
sam delete
```

## Security Considerations

- Firebase private key is stored as a NoEcho parameter
- Lambda function has minimal IAM permissions
- API Gateway includes CORS configuration
- SQS queue has message retention and visibility timeout configured