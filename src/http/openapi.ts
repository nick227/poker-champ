export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Poker API",
    version: process.env.API_VERSION ?? "0.1.0",
    description: "Contract-first HTTP API for auth, economy, tournaments, lobby, profile, and admin.",
  },
  servers: [{ url: "/" }],
  tags: [
    { name: "health" },
    { name: "meta" },
    { name: "auth" },
    { name: "profile" },
    { name: "economy" },
    { name: "tournaments" },
    { name: "lobby" },
    { name: "admin" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "Bearer token",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: { error: { type: "string" } },
        required: ["error"],
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string" },
          email: { type: "string" },
          username: { type: "string", nullable: true },
          displayName: { type: "string" },
          role: { type: "string", enum: ["USER", "MODERATOR", "ADMIN"] },
          isBanned: { type: "boolean" },
          deletedAt: { type: "string", format: "date-time", nullable: true },
          trustLevel: { type: "integer" },
          bankrollCents: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
        required: ["id", "email", "displayName", "role", "isBanned", "trustLevel", "bankrollCents", "createdAt", "updatedAt"],
      },
      AuthResponse: {
        type: "object",
        properties: {
          token: { type: "string" },
          user: { $ref: "#/components/schemas/User" },
        },
        required: ["token", "user"],
      },
      LobbyTableSummary: {
        type: "object",
        properties: {
          tableId: { type: "string" },
          roomId: { type: "string" },
          name: { type: "string" },
          players: { type: "integer" },
          maxSeats: { type: "integer" },
          smallBlindCents: { type: "integer" },
          bigBlindCents: { type: "integer" },
          minBuyInCents: { type: "integer" },
          maxBuyInCents: { type: "integer" },
          visibility: { type: "string", enum: ["PUBLIC", "PRIVATE"] },
          runningSince: { type: "integer", nullable: true },
          createdAt: { type: "integer" },
        },
        required: [
          "tableId",
          "roomId",
          "name",
          "players",
          "maxSeats",
          "smallBlindCents",
          "bigBlindCents",
          "minBuyInCents",
          "maxBuyInCents",
          "visibility",
          "runningSince",
          "createdAt",
        ],
      },
    },
  },
  paths: {
    "/openapi.json": {
      get: {
        tags: ["meta"],
        operationId: "openapiSpec",
        responses: {
          "200": {
            description: "OpenAPI specification",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            },
          },
        },
      },
    },
    "/health": {
      get: {
        tags: ["health"],
        operationId: "healthCheck",
        responses: {
          "200": {
            description: "OK",
            content: {
              "text/plain": { schema: { type: "string", example: "OK" } },
            },
          },
        },
      },
    },
    "/api/auth/register": {
      post: {
        tags: ["auth"],
        operationId: "authRegister",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 1 },
                  displayName: { type: "string" },
                  username: { type: "string", minLength: 3, maxLength: 24 },
                },
                required: ["email", "password"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Registered",
            content: { "application/json": { schema: { $ref: "#/components/schemas/AuthResponse" } } },
          },
          "400": {
            description: "Bad request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["auth"],
        operationId: "authLogin",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 1 },
                },
                required: ["email", "password"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Logged in",
            content: { "application/json": { schema: { $ref: "#/components/schemas/AuthResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["auth"],
        operationId: "authMe",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Current user",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    user: { $ref: "#/components/schemas/User" },
                    openapiVersion: { type: "string" },
                  },
                  required: ["user", "openapiVersion"],
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/auth/logout": {
      post: {
        tags: ["auth"],
        operationId: "authLogout",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Logged out",
            content: {
              "application/json": {
                schema: { type: "object", properties: { success: { type: "boolean" } }, required: ["success"] },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/auth/logout-all": {
      post: {
        tags: ["auth"],
        operationId: "authLogoutAll",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Logged out all sessions",
            content: {
              "application/json": {
                schema: { type: "object", properties: { success: { type: "boolean" } }, required: ["success"] },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/profile": {
      get: {
        tags: ["profile"],
        operationId: "profileGet",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Current profile",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { user: { $ref: "#/components/schemas/User" } },
                  required: ["user"],
                },
              },
            },
          },
        },
      },
      patch: {
        tags: ["profile"],
        operationId: "profileUpdate",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { displayName: { type: "string", minLength: 1, maxLength: 80 } },
                required: ["displayName"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated profile",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { user: { $ref: "#/components/schemas/User" } },
                  required: ["user"],
                },
              },
            },
          },
          "400": {
            description: "Bad request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/economy/wallet": {
      get: {
        tags: ["economy"],
        operationId: "economyWallet",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Wallet balance",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { bankrollCents: { type: "integer" } },
                  required: ["bankrollCents"],
                },
              },
            },
          },
        },
      },
    },
    "/api/economy/transactions": {
      get: {
        tags: ["economy"],
        operationId: "economyTransactions",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 100 },
          },
        ],
        responses: {
          "200": {
            description: "Transaction list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                  },
                  required: ["items"],
                },
              },
            },
          },
        },
      },
    },
    "/api/economy/buy-in": {
      post: {
        tags: ["economy"],
        operationId: "economyBuyIn",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  tableId: { type: "string" },
                  amountCents: { type: "integer" },
                  externalRef: { type: "string" },
                },
                required: ["tableId", "amountCents"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Buy-in processed",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    newTableBalance: { type: "integer" },
                  },
                  required: ["success", "newTableBalance"],
                },
              },
            },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/economy/cash-out": {
      post: {
        tags: ["economy"],
        operationId: "economyCashOut",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  tableId: { type: "string" },
                  amountCents: { type: "integer" },
                  externalRef: { type: "string" },
                },
                required: ["tableId", "amountCents"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Cash-out processed",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                  },
                  required: ["success"],
                },
              },
            },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/tournaments": {
      get: {
        tags: ["tournaments"],
        operationId: "tournamentsList",
        parameters: [
          { name: "status", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Tournament list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    tournaments: {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                  },
                  required: ["tournaments"],
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["tournaments"],
        operationId: "tournamentsCreate",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  entryFeeCents: { type: "integer" },
                  startTime: { type: "string", format: "date-time" },
                },
                required: ["name", "entryFeeCents", "startTime"],
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Tournament created",
            content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
          },
          "403": {
            description: "Admin required",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/tournaments/{id}": {
      get: {
        tags: ["tournaments"],
        operationId: "tournamentsGet",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Tournament",
            content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/tournaments/{id}/register": {
      post: {
        tags: ["tournaments"],
        operationId: "tournamentsRegister",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Registered",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { success: { type: "boolean" } },
                  required: ["success"],
                },
              },
            },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/lobby/tables": {
      get: {
        tags: ["lobby"],
        operationId: "lobbyTables",
        responses: {
          "200": {
            description: "Table summaries",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    tables: {
                      type: "array",
                      items: { $ref: "#/components/schemas/LobbyTableSummary" },
                    },
                  },
                  required: ["tables"],
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["lobby"],
        operationId: "lobbyCreateTable",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", minLength: 1, maxLength: 80 },
                  maxSeats: { type: "integer", minimum: 2, maximum: 10 },
                  smallBlindCents: { type: "integer", minimum: 1 },
                  bigBlindCents: { type: "integer", minimum: 1 },
                  minBuyInCents: { type: "integer", minimum: 1 },
                  maxBuyInCents: { type: "integer", minimum: 1 },
                  visibility: { type: "string", enum: ["PUBLIC", "PRIVATE"] },
                  password: { type: "string" },
                },
                required: [
                  "name",
                  "maxSeats",
                  "smallBlindCents",
                  "bigBlindCents",
                  "minBuyInCents",
                  "maxBuyInCents",
                  "visibility",
                ],
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Table created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { tableId: { type: "string" }, roomId: { type: "string" } },
                  required: ["tableId", "roomId"],
                },
              },
            },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/admin/users": {
      get: {
        tags: ["admin"],
        operationId: "adminListUsers",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "page", in: "query", required: false, schema: { type: "integer", minimum: 1 } },
          { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1 } },
        ],
        responses: {
          "200": {
            description: "Paged users",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    users: { type: "array", items: { $ref: "#/components/schemas/User" } },
                    total: { type: "integer" },
                  },
                  required: ["users", "total"],
                },
              },
            },
          },
          "403": {
            description: "Admin required",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/admin/users/{id}/ban": {
      post: {
        tags: ["admin"],
        operationId: "adminBanUser",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Banned user",
            content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } },
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/admin/users/{id}/unban": {
      post: {
        tags: ["admin"],
        operationId: "adminUnbanUser",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Unbanned user",
            content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } },
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/admin/users/{id}/role": {
      patch: {
        tags: ["admin"],
        operationId: "adminSetRole",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { role: { type: "string", enum: ["USER", "MODERATOR", "ADMIN"] } },
                required: ["role"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated role",
            content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } },
          },
          "400": {
            description: "Bad request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/admin/users/{id}/delete": {
      post: {
        tags: ["admin"],
        operationId: "adminDeleteUser",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Soft-deleted user",
            content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } },
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/admin/users/{id}/restore": {
      post: {
        tags: ["admin"],
        operationId: "adminRestoreUser",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Restored user",
            content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } },
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
  },
} as const;
