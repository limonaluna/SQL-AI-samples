# OAuth Authentication Enhancement Plan

Based on reviewing [jeffreygroneberg/mcp_oauth_template](https://github.com/jeffreygroneberg/mcp_oauth_template), we can enhance our MCP server with enterprise-grade OAuth 2.0 authentication.

## Current Implementation vs. OAuth Best Practices

### Current (API Key)
```typescript
// Simple bearer token validation
if (requestKey !== apiKey) {
  return res.status(403).json({ error: 'Forbidden' });
}
```

### Enhanced (OAuth 2.0 with Azure AD)
```csharp
// JWT token validation with claims
options.TokenValidationParameters = new TokenValidationParameters {
    ValidateIssuer = true,
    ValidateAudience = true,
    ValidateLifetime = true,
    ValidAudiences = [$"api://{appClientId}"],
    ValidIssuers = [$"https://sts.windows.net/{tenantId}/"],
};
```

## Recommended Enhancements

### 1. Add JWT Token Validation (TypeScript/Node.js)

**Install Dependencies:**
```bash
npm install jsonwebtoken jwks-rsa express-jwt
```

**Create OAuth Middleware:**
```typescript
// src/middleware/oauth.ts
import { expressjwt as jwt } from 'express-jwt';
import { expressJwtSecret } from 'jwks-rsa';

export function createOAuthMiddleware(tenantId: string, clientId: string) {
  return jwt({
    secret: expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`
    }),
    audience: `api://${clientId}`,
    issuer: `https://sts.windows.net/${tenantId}/`,
    algorithms: ['RS256']
  });
}
```

### 2. Add User Context Tracking

**Extract User Claims:**
```typescript
// src/middleware/userContext.ts
import { Request } from 'express';

export interface AuthenticatedUser {
  username: string;
  email?: string;
  oid: string; // Object ID
  tid: string; // Tenant ID
  roles?: string[];
}

export function getUserFromToken(req: Request): AuthenticatedUser | null {
  const user = (req as any).auth; // Set by express-jwt
  
  if (!user) return null;
  
  return {
    username: user.preferred_username || user.upn || user.name || user.sub,
    email: user.email,
    oid: user.oid,
    tid: user.tid,
    roles: user.roles || []
  };
}
```

**Add to Tool Responses:**
```typescript
async function executeReadData(args: any, user: AuthenticatedUser) {
  const { query } = args;
  const result = await request.query(query);
  
  return {
    success: true,
    message: `Retrieved ${result.recordset.length} record(s)`,
    data: result.recordset,
    recordCount: result.recordset.length,
    requestedBy: user.username,  // Track who requested
    requestedAt: new Date().toISOString()
  };
}
```

### 3. Add Audit Logging

```typescript
// src/utils/audit.ts
export async function logAuditEvent(
  user: AuthenticatedUser,
  action: string,
  resource: string,
  details: any
) {
  // Log to Application Insights, Azure Monitor, or database
  console.log({
    timestamp: new Date().toISOString(),
    user: user.username,
    userId: user.oid,
    tenantId: user.tid,
    action,
    resource,
    details,
  });
  
  // Optional: Write to audit table
  await sql.query`
    INSERT INTO AuditLog (UserId, UserName, Action, Resource, Details, Timestamp)
    VALUES (${user.oid}, ${user.username}, ${action}, ${resource}, ${JSON.stringify(details)}, GETUTCDATE())
  `;
}
```

### 4. Configuration Structure

**Environment Variables:**
```bash
# Azure AD OAuth Configuration
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-client-id
AZURE_SCOPES=api://your-client-id/mcp.read,api://your-client-id/mcp.write

# Fallback: Simple API Key (for development)
API_KEY=dev-key-for-local-testing
AUTH_MODE=oauth  # or 'apikey' for development
```

**Updated .env:**
```bash
# Authentication Mode: oauth | apikey
AUTH_MODE=oauth

# OAuth Configuration (Production)
AZURE_TENANT_ID=
AZURE_CLIENT_ID=
AZURE_SCOPES=api://your-client-id/mcp.read

# API Key (Development Fallback)
API_KEY=
```

### 5. Integration with MCP Server

**Update mcp-server.ts:**
```typescript
// Choose authentication strategy based on config
if (process.env.AUTH_MODE === 'oauth') {
  console.log('🔒 OAuth 2.0 authentication enabled');
  const tenantId = process.env.AZURE_TENANT_ID!;
  const clientId = process.env.AZURE_CLIENT_ID!;
  
  app.use('/sse', createOAuthMiddleware(tenantId, clientId));
  app.use('/sse', (req, res, next) => {
    const user = getUserFromToken(req);
    if (user) {
      (req as any).user = user;
    }
    next();
  });
} else {
  console.log('🔑 API Key authentication enabled (development mode)');
  app.use(apiKeyAuth);
}
```

## Implementation Priority

### Phase 1: Enhance Current API Key (Complete) ✅
- [x] API key middleware
- [x] Rate limiting
- [x] Multiple auth methods (header, bearer, query)

### Phase 2: Add OAuth Support (Recommended)
- [ ] Install JWT libraries
- [ ] Create OAuth middleware
- [ ] Add user context extraction
- [ ] Test with Azure AD tokens

### Phase 3: Add Audit Trail (Optional)
- [ ] Create audit log table
- [ ] Log all database operations
- [ ] Include user context in all responses
- [ ] Add audit log query tool

## Benefits of OAuth Enhancement

### Security
- ✅ No shared secrets (API keys)
- ✅ Token expiration and rotation
- ✅ Fine-grained permissions via scopes
- ✅ User identity verification
- ✅ Integration with Azure AD Conditional Access

### Compliance
- ✅ Audit trail of who accessed what
- ✅ Support for RBAC (Role-Based Access Control)
- ✅ Compliance with enterprise security policies
- ✅ Integration with Azure AD B2C for customer scenarios

### User Experience
- ✅ Single sign-on (SSO) integration
- ✅ No manual API key management
- ✅ Automatic token refresh
- ✅ Works seamlessly with Azure AI Foundry

## Decision: Current vs. Enhanced

### Keep Current (API Key) If:
- Simple deployment requirements
- Internal tool only
- Fast prototyping needed
- No user-level permissions needed

### Adopt OAuth If:
- Enterprise deployment
- Multi-user/multi-tenant scenarios
- Compliance requirements (SOC2, HIPAA, etc.)
- Integration with Azure AD required
- Fine-grained access control needed

## Recommendation

**For our SQL-AI-samples project:**

1. **Keep API key for now** (already implemented, works well)
2. **Document OAuth enhancement path** (this file)
3. **Implement OAuth in Phase 10** (after Azure deployment and Foundry integration)
4. **Add user tracking** to tool responses (can do now without full OAuth)

This gives us a working solution now with a clear upgrade path for enterprise scenarios.

## Example: Adding User Context Without Full OAuth

We can enhance our current implementation with user context even without OAuth:

```typescript
// Simple user context from API key mapping
const apiKeyToUser: Record<string, string> = {
  'foundry-key-123': 'foundry-agent@contoso.com',
  'admin-key-456': 'admin@contoso.com',
};

export function getUserFromApiKey(apiKey: string): string {
  return apiKeyToUser[apiKey] || 'unknown-user';
}

// In tool execution
const user = getUserFromApiKey(req.headers['x-api-key'] as string);
return {
  success: true,
  data: result.recordset,
  requestedBy: user,
  requestedAt: new Date().toISOString()
};
```

This provides audit trails without the complexity of full OAuth setup.

## Resources

- [OAuth Template Repository](https://github.com/jeffreygroneberg/mcp_oauth_template)
- [Azure AD Authentication for Node.js](https://learn.microsoft.com/azure/active-directory/develop/quickstart-v2-nodejs-webapp)
- [express-jwt Documentation](https://github.com/auth0/express-jwt)
- [MCP Authentication Spec](https://spec.modelcontextprotocol.io/specification/2024-11-05/basic/authentication/)
