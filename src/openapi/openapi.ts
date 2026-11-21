// Swagger reads this contract through /openapi.json and /api-docs; it documents routes, not runtime validation.
// Response schema for safe user profiles; nullable fields support accounts created before profile details existed.
const userSchema = {
  type: 'object',
  required: ['id', 'fullName', 'role', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    fullName: { type: 'string', maxLength: 100 },
    address: { type: 'string', maxLength: 500, nullable: true },
    phoneNumber: { type: 'string', maxLength: 30, nullable: true },
    username: { type: 'string', maxLength: 32, nullable: true },
    email: { type: 'string', format: 'email', maxLength: 254, nullable: true },
    role: { type: 'string', enum: ['USER', 'ADMIN', 'SUPERADMIN'] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
} as const;

// Common error shape returned by the Express error middleware.
const errorSchema = {
  type: 'object',
  properties: { error: { type: 'string' }, details: { type: 'array', items: { type: 'object' } } },
} as const;

/** Complete HTTP contract served by system.route.ts; Swagger uses it to render Try it out forms. */
export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Audit Logging System API',
    version: '1.0.0',
    description: 'User CRUD API with transactional outbox-backed audit events.',
  },
  servers: [{ url: 'http://localhost:3000', description: 'Local development server' }],
  tags: [
    { name: 'Auth', description: 'Public registration and JWT login' },
    { name: 'Users', description: 'Create and manage users' },
    { name: 'Audit', description: 'Inspect audit queue and persisted events' },
    { name: 'System', description: 'Health endpoints' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      User: userSchema,
      // Body used by both public registration and admin-created regular users.
      UserInput: {
        type: 'object', required: ['fullName', 'address', 'phoneNumber', 'email', 'password'],
        properties: {
          fullName: { type: 'string', minLength: 1, maxLength: 100 },
          address: { type: 'string', minLength: 1, maxLength: 500 },
          phoneNumber: { type: 'string', minLength: 5, maxLength: 30 },
          email: { type: 'string', format: 'email', maxLength: 254 },
          password: { type: 'string', minLength: 12, maxLength: 72, format: 'password' },
        },
      },
      // Separate from UserInput because only a superadmin may create this role.
      AdminInput: {
        type: 'object', required: ['fullName', 'username', 'password'],
        properties: {
          fullName: { type: 'string', minLength: 1, maxLength: 100 },
          username: { type: 'string', minLength: 3, maxLength: 32, pattern: '^[a-zA-Z0-9._-]+$' },
          email: { type: 'string', format: 'email', maxLength: 254 },
          address: { type: 'string', maxLength: 500 },
          phoneNumber: { type: 'string', minLength: 5, maxLength: 30 },
          password: { type: 'string', minLength: 12, maxLength: 72, format: 'password' },
        },
      },
      // All fields are optional, but at least one must be present for a meaningful PATCH.
      UserUpdate: {
        type: 'object', minProperties: 1,
        properties: {
          fullName: { type: 'string', minLength: 1, maxLength: 100 },
          username: { type: 'string', minLength: 3, maxLength: 32, pattern: '^[a-zA-Z0-9._-]+$' },
          address: { type: 'string', minLength: 1, maxLength: 500 },
          phoneNumber: { type: 'string', minLength: 5, maxLength: 30 },
          email: { type: 'string', format: 'email', maxLength: 254 },
        },
      },
      // Never expose a reset password in a response or audit record.
      PasswordReset: {
        type: 'object', required: ['password'],
        properties: { password: { type: 'string', minLength: 12, maxLength: 72, format: 'password' } },
      },
      // Clients must provide exactly one identity; service validation enforces the same rule.
      LoginInput: {
        type: 'object', required: ['password'],
        oneOf: [
          { required: ['email'], not: { required: ['username'] } },
          { required: ['username'], not: { required: ['email'] } },
        ],
        properties: {
          email: { type: 'string', format: 'email' },
          username: { type: 'string', minLength: 3, maxLength: 32 },
          password: { type: 'string', minLength: 12, maxLength: 72, format: 'password' },
        },
      },
      // Public projection returned by login; never includes the stored password hash.
      AuthToken: {
        type: 'object', required: ['accessToken', 'tokenType', 'expiresIn', 'user'],
        properties: {
          accessToken: { type: 'string' },
          tokenType: { type: 'string', example: 'Bearer' },
          expiresIn: { type: 'integer', example: 900 },
          user: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              email: { type: 'string', format: 'email', nullable: true },
              username: { type: 'string', nullable: true },
              role: { type: 'string', enum: ['USER', 'ADMIN', 'SUPERADMIN'] },
            },
          },
        },
      },
      Error: errorSchema,
      // Shape of permanent audit rows returned from the audit database.
      AuditLog: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          eventId: { type: 'string', format: 'uuid' },
          eventType: { type: 'string' },
          actorId: { type: 'string', format: 'uuid', nullable: true },
          actorType: { type: 'string', enum: ['USER', 'SYSTEM', 'ANONYMOUS'] },
          resourceType: { type: 'string' },
          resourceId: { type: 'string', format: 'uuid', nullable: true },
          outcome: { type: 'string', enum: ['SUCCESS', 'FAILURE'] },
          metadata: { type: 'object', nullable: true, additionalProperties: true },
          occurredAt: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
    parameters: {
      userId: { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/auth/register': {
      post: {
        security: [],
        tags: ['Auth'],
        summary: 'Register a user account',
        description: 'Public registration. New accounts always receive the USER role; registration success and failure are audited.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UserInput' } } } },
        responses: {
          '201': { description: 'User registered', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
          '400': { description: 'Invalid registration details', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '409': { description: 'Email already exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/auth/login': {
      post: {
        security: [],
        tags: ['Auth'],
        summary: 'Exchange email or username and password for a short-lived access token',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginInput' } } } },
        responses: {
          '200': { description: 'JWT access token', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthToken' } } } },
          '400': { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '401': { description: 'Invalid email/username or password', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/users': {
      post: {
        tags: ['Users'], summary: 'Create a user',
        description: 'Administrator only. New accounts receive the USER role.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UserInput' } } } },
        responses: {
          '201': { description: 'User created', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
          '400': { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '409': { description: 'Email already exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      get: {
        tags: ['Users'], summary: 'List users', description: 'Administrator only. The read is audited.',
        responses: { '200': { description: 'Users', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/User' } } } } } },
      },
    },
    '/users/admins': {
      post: {
        tags: ['Users'],
        summary: 'Create an administrator account',
        description: 'Superadmin only. Username and password are required; email is optional. The admin can log in using username or email. Creation attempts are audited with the superadmin as actor.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminInput' } } } },
        responses: {
          '201': { description: 'Administrator created', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
          '400': { description: 'Invalid administrator details', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '409': { description: 'Email or username already exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/users/{id}': {
      parameters: [{ $ref: '#/components/parameters/userId' }],
      get: {
        tags: ['Users'], summary: 'Get a user', description: 'The account owner or an administrator. The read is audited.',
        responses: {
          '200': { description: 'User', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
          '404': { description: 'User not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      patch: {
        tags: ['Users'], summary: 'Update a user', description: 'Administrator only. Profile and login email updates are audited.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UserUpdate' } } } },
        responses: {
          '200': { description: 'User updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
          '400': { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'User not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '409': { description: 'Email already exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      delete: {
        tags: ['Users'], summary: 'Delete a user', description: 'Administrator only.',
        responses: {
          '204': { description: 'User deleted' },
          '404': { description: 'User not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/users/{id}/password': {
      parameters: [{ $ref: '#/components/parameters/userId' }],
      patch: {
        tags: ['Users'], summary: 'Reset a user password', description: 'Administrator only. The password is hashed and never returned.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PasswordReset' } } } },
        responses: {
          '204': { description: 'Password reset' },
          '400': { description: 'Invalid password', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'User not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/audit-logs': {
      get: {
        tags: ['Audit'], summary: 'List persisted audit events', description: 'Superadmin only.',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
          { name: 'eventType', in: 'query', schema: { type: 'string' } },
          { name: 'actorId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Audit event page',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: { type: 'array', items: { $ref: '#/components/schemas/AuditLog' } },
                    page: { type: 'integer' },
                    limit: { type: 'integer' },
                    total: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/queue-stats': {
      get: { tags: ['Audit'], summary: 'Show Redis queue job counts', description: 'Superadmin only.', responses: { '200': { description: 'Queue counts' } } },
    },
    '/health': {
      get: {
        security: [],
        tags: ['System'],
        summary: 'Check API health',
        responses: {
          '200': {
            description: 'API is ready',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { status: { type: 'string' } } },
              },
            },
          },
        },
      },
    },
  },
} as const;
