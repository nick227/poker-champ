# 🎯 HAND HISTORY OPENAPI ENDPOINTS

## Current Gap
The history service is calling endpoints that don't exist in `openapi.json`:
- `/api/history/overview`
- `/api/history/hands`
- `/api/history/hands/{handId}`

## Recommended OpenAPI Additions

### 1. Add "history" tag
```json
{
  "name": "history",
  "description": "Hand history and replay endpoints"
}
```

### 2. Add History Overview Endpoint
```json
"/api/history/overview": {
  "get": {
    "tags": ["history"],
    "summary": "Get player's hand history overview",
    "security": [{"bearerAuth": []}],
    "responses": {
      "200": {
        "description": "History overview",
        "content": {
          "application/json": {
            "schema": { "$ref": "#/components/schemas/HistoryOverview" }
          }
        }
      }
    }
  }
}
```

### 3. Add Hands List Endpoint
```json
"/api/history/hands": {
  "get": {
    "tags": ["history"],
    "summary": "Get paginated hand history",
    "security": [{"bearerAuth": []}],
    "parameters": [
      {
        "name": "cursor",
        "in": "query",
        "schema": { "type": "string" }
      },
      {
        "name": "limit", 
        "in": "query",
        "schema": { "type": "integer", "default": 50 }
      }
    ],
    "responses": {
      "200": {
        "description": "Paginated hands",
        "content": {
          "application/json": {
            "schema": { "$ref": "#/components/schemas/HandsResponse" }
          }
        }
      }
    }
  }
}
```

### 4. Add Hand Detail Endpoint
```json
"/api/history/hands/{handId}": {
  "get": {
    "tags": ["history"],
    "summary": "Get detailed hand information with snapshots",
    "security": [{"bearerAuth": []}],
    "parameters": [
      {
        "name": "handId",
        "in": "path",
        "required": true,
        "schema": { "type": "string" }
      }
    ],
    "responses": {
      "200": {
        "description": "Hand detail with replay snapshots",
        "content": {
          "application/json": {
            "schema": { "$ref": "#/components/schemas/HandHistoryDetail" }
          }
        }
      }
    }
  }
}
```

### 5. Add Required Schemas
```json
"HistoryOverview": {
  "type": "object",
  "properties": {
    "totalHands": { "type": "integer" },
    "totalProfitCents": { "type": "integer" },
    "winningHands": { "type": "integer" },
    "winRate": { "type": "number" },
    "avgPotCents": { "type": "integer" },
    "biggestPotCents": { "type": "integer" }
  }
},

"HandsResponse": {
  "type": "object", 
  "properties": {
    "hands": {
      "type": "array",
      "items": { "$ref": "#/components/schemas/HandHistoryListItem" }
    },
    "nextCursor": { "type": "string", "nullable": true }
  }
},

"HandHistoryListItem": {
  "type": "object",
  "properties": {
    "id": { "type": "string" },
    "playedAt": { "type": "string", "format": "date-time" },
    "tableName": { "type": "string" },
    "netResultCents": { "type": "integer" },
    "bigBlindCents": { "type": "integer" },
    "potCents": { "type": "integer" },
    "heroActionSummary": { "type": "string" }
  }
},

"HandHistoryDetail": {
  "type": "object",
  "properties": {
    "id": { "type": "string" },
    "snapshots": {
      "type": "array",
      "items": { "$ref": "#/components/schemas/TableSnapshotPayload" }
    },
    "boardCards": { "type": "array", "items": { "type": "string" } },
    "bigBlindCents": { "type": "integer" },
    "reason": { "type": "string", "nullable": true },
    "players": {
      "type": "array",
      "items": { "$ref": "#/components/schemas/HandHistoryPlayer" }
    },
    "actions": {
      "type": "array", 
      "items": { "$ref": "#/components/schemas/HandHistoryAction" }
    },
    "payouts": {
      "type": "array",
      "items": { "$ref": "#/components/schemas/HandHistoryPayout" }
    }
  }
}
```

## Priority Assessment

### 🚨 **HIGH PRIORITY** (Blocking POC)
- `/api/history/hands/{handId}` - Required for replay POC
- Must include `snapshots` field with `TableSnapshotPayload[]`

### 🔶 **MEDIUM PRIORITY** (Nice to have)
- `/api/history/hands` - For hand history list
- `/api/history/overview` - For stats dashboard

### 🔵 **LOW PRIORITY** (Future)
- Any lesson/coaching endpoints (future work)

## Recommendation

**Add the hand detail endpoint first** since that's what the replay POC needs. The other endpoints can be added later for full hand history functionality.

The key is ensuring the `HandHistoryDetail` schema includes the `snapshots` field that our replay system depends on.
