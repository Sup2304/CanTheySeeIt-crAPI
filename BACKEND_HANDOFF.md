# CanTheySeeIt — Universal Backend MVP

## Purpose

CanTheySeeIt helps developers test whether their applications enforce
user-defined access-control rules.

The backend is designed to analyze supported application source code,
identify API routes, generate test candidates, and execute permission
checks against a locally running application.

It is not specific to the grocery-shop demonstration or crAPI.

## Backend startup

Install dependencies:

npm install

Start the backend:

npm run start:universal

Backend address:

http://127.0.0.1:4200

## API endpoints

### GET /api/health

Checks whether the backend is running.

### POST /api/analyze

Request:

{
  "projectId": "demo-app"
}

The project must exist inside:

workspace/projects/<projectId>

Response includes:

- projectId
- analysis
- candidates

The analyzer currently supports basic Express-style
JavaScript and TypeScript routes.

### POST /api/test

Request:

{
  "baseUrl": "http://127.0.0.1:4300",
  "actors": [
    {
      "id": "anonymous",
      "headers": {}
    }
  ],
  "tests": [
    {
      "id": "TEST-001",
      "method": "GET",
      "path": "/api/products",
      "actor": "anonymous",
      "expected": "allow"
    }
  ]
}

Response includes:

- total
- passed
- failed
- inconclusive
- results

Each result includes:

- id
- actor
- status
- verdict
- reason

## Verdicts

PASS:
Observed behavior matches the confirmed expectation.

FAIL:
Observed behavior contradicts the confirmed expectation.

INCONCLUSIVE:
The available evidence does not establish either result.

## Integration contract

Suprita's upload component will eventually:

1. Receive an application ZIP.
2. Safely extract its contents.
3. Place the extracted project in workspace/projects.
4. Call POST /api/analyze using the projectId.
5. Display discovered routes and test candidates.
6. Collect confirmed permission rules and test accounts.
7. Call POST /api/test.
8. Display the returned results.

The backend does not currently upload or extract ZIP files.

## Important limitations

- Basic Express route discovery only.
- Not every framework or routing pattern is supported.
- Generated candidates are suggestions, not confirmed rules.
- Permission tests require a running application.
- Only local test targets are supported.
- Generic execution currently supports GET and HEAD.
- HTTP status codes alone cannot prove every access-control property.
- Complex authorization checks may require state or response-body verification.
- Uploaded applications must not be executed without appropriate isolation.
- This is a hackathon MVP, not a production security scanner.

## Verification

npm run typecheck

npx tsx --test tests/universalBackend.test.ts tests/permissionFailure.test.ts tests/edgeCases.test.ts

npm run test:crapi:mock

npm run test:unit

npm audit
