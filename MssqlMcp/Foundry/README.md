# MSSQL MCP Server for Azure AI Foundry Agent Service

HTTP-based MCP server for Azure SQL Database, designed for Azure AI Foundry Agent Service integration.

## Status: ✅ Ready for Deployment

The server implements MCP protocol over SSE transport with authentication, ready for Azure deployment.

## Features

- ✅ **MCP Protocol over SSE**: Full Model Context Protocol support via Server-Sent Events
- ✅ **Authentication**: API key middleware with multiple auth methods
- ✅ **Rate Limiting**: Optional request throttling per API key
- ✅ **Azure SQL Integration**: Entra ID authentication with automatic token refresh
- ✅ **Containerized**: Docker support for easy deployment
- ✅ **Health Checks**: Built-in health monitoring
- ✅ **CORS**: Configured for Azure AI Foundry

## Quick Start

### Local Development

1. **Install dependencies:**
   ```bash
   cd MssqlMcp/Foundry
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your database settings
   ```

3. **Build and run:**
   ```bash
   npm run build
   npm start
   ```

4. **Test the server:**
   ```bash
   curl http://localhost:3000/health
   ```

### Docker Deployment

1. **Build the image:**
   ```bash
   docker build -t mssql-mcp-foundry .
   ```

2. **Run with docker-compose:**
   ```bash
   docker-compose up -d
   ```

3. **View logs:**
   ```bash
   docker-compose logs -f
   ```

## Endpoints

### Health & Info
- `GET /health` - Health check (always accessible)
- `GET /info` - Server information and available tools

### MCP Protocol
- `GET /sse` - Establish SSE connection for MCP communication
- `POST /sse` - Send MCP messages (requires session ID)

## Tools (via MCP)

### read_data
Execute SELECT queries on the database.

**Example:**
```json
{
  "name": "read_data",
  "arguments": {
    "query": "SELECT TOP 10 * FROM SalesLT.Customer"
  }
}
```

### list_table
List all tables, optionally filtered by schema.

**Example:**
```json
{
  "name": "list_table",
  "arguments": {
    "parameters": ["SalesLT"]
  }
}
```

### describe_table
Get schema information for a table.

**Example:**
```json
{
  "name": "describe_table",
  "arguments": {
    "tableName": "Customer"
  }
}
```

## Authentication

The server supports multiple authentication methods:

### 1. API Key Header
```bash
curl -H "x-api-key: your-secret-key" http://localhost:3000/sse
```

### 2. Bearer Token
```bash
curl -H "Authorization: Bearer your-secret-key" http://localhost:3000/sse
```

### 3. Query Parameter (Testing Only)
```bash
curl "http://localhost:3000/sse?apiKey=your-secret-key"
```

### Configuration

Set `API_KEY` in `.env` to enable authentication:
```bash
API_KEY=your-secret-api-key-here
ENABLE_RATE_LIMITING=true
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000
```

## Environment Variables

### Required
- `SERVER_NAME` - Azure SQL server name
- `DATABASE_NAME` - Database name

### Optional
- `PORT` - Server port (default: 3000)
- `API_KEY` - Enable authentication
- `ALLOWED_ORIGINS` - CORS origins (comma-separated)
- `CONNECTION_TIMEOUT` - SQL connection timeout in seconds
- `TRUST_SERVER_CERTIFICATE` - Accept self-signed certs (default: true)
- `ENABLE_RATE_LIMITING` - Enable rate limiting (default: false)
- `RATE_LIMIT_MAX` - Max requests per window (default: 100)
- `RATE_LIMIT_WINDOW_MS` - Rate limit window in ms (default: 60000)

## Architecture

```
┌─────────────────────┐
│  Azure AI Foundry   │
│    Agent Service    │
└──────────┬──────────┘
           │ MCP over HTTP/SSE
           ▼
┌─────────────────────┐
│   MCP Server        │
│  (This Project)     │
│                     │
│  - SSE Transport    │
│  - Tool Handlers    │
│  - SQL Connection   │
│  - Auth Middleware  │
└──────────┬──────────┘
           │ Entra ID Auth
           ▼
┌─────────────────────┐
│  Azure SQL Database │
│    (contoso)        │
└─────────────────────┘
```

## Deployment

### Azure Container Apps

1. Build and push to Azure Container Registry
2. Deploy to Azure Container Apps
3. Configure environment variables
4. Enable managed identity for SQL access

See `FOUNDRY_INTEGRATION.md` for detailed deployment instructions.

## Development

### Scripts
- `npm run build` - Compile TypeScript
- `npm start` - Run production server
- `npm run dev` - Run with auto-reload

### Testing
- `node dist/test-auth.ts` - Test authentication
- `node dist/test-mcp-client.ts` - Test MCP communication

## Comparison with Node Version

| Feature | Node (stdio) | Foundry (HTTP/SSE) |
|---------|-------------|---------------------|
| Transport | stdio | HTTP/SSE |
| Protocol | MCP | MCP |
| VS Code | ✅ | ❌ |
| Foundry Agent | ❌ | ✅ |
| Authentication | N/A | API Key |
| Rate Limiting | N/A | ✅ |
| Containerized | ❌ | ✅ |
| Port | N/A | 3000 |

## Security

- ✅ API key authentication
- ✅ Rate limiting
- ✅ CORS protection
- ✅ Non-root Docker user
- ✅ Entra ID for SQL access
- ✅ SELECT-only queries for read_data tool

## Next Steps

1. Deploy to Azure Container Apps
2. Integrate with Azure AI Foundry Agent
3. Add comprehensive logging
4. Add telemetry and monitoring

## Documentation

- `IMPLEMENTATION_PLAN.md` - Development roadmap
- `FOUNDRY_INTEGRATION.md` - Azure AI Foundry integration guide
- `../Node/README.md` - Original stdio version

## Support

- Both Node and Foundry versions are maintained
- The Node version remains unchanged and fully functional
- They can run simultaneously on the same machine
