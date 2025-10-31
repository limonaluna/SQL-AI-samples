# Azure AI Foundry Integration Guide

## Overview

This document describes the MCP (Model Context Protocol) server implementation for Azure AI Foundry Agent Service integration. The server provides MSSQL database tools over HTTP/SSE transport.

## Current Status

### ✅ Completed

1. **HTTP REST API Implementation** (`src/server.ts`)
   - Express-based HTTP server
   - Three core tools as REST endpoints:
     - `POST /api/read_data` - Execute SELECT queries
     - `POST /api/list_table` - List database tables
     - `POST /api/describe_table` - Get table schema
   - Health check endpoint: `GET /health`
   - CORS support for Azure AI Foundry
   - Entra ID authentication with token refresh

2. **MCP over SSE Implementation** (`src/mcp-server.ts`)
   - Server-Sent Events (SSE) transport for MCP protocol
   - Session management for multiple concurrent connections
   - Three tools exposed via MCP:
     - `read_data` - Execute SELECT queries
     - `list_table` - List database tables  
     - `describe_table` - Get table schema
   - Proper GET/POST endpoint handling
   - MCP SDK v1.0.0 integration

### 🔄 In Progress

- SSE connection testing with MCP client
- Session ID management and routing

### 📋 Next Steps

1. **Complete SSE Testing**
   - Fix connection issues between client and server
   - Verify MCP protocol communication
   - Test all three tools via SSE transport

2. **Add Authentication Middleware**
   ```typescript
   // Example API key authentication
   app.use((req, res, next) => {
     const apiKey = req.headers['x-api-key'];
     if (apiKey !== process.env.API_KEY) {
       return res.status(401).json({ error: 'Unauthorized' });
     }
     next();
   });
   ```

3. **Docker Containerization**
   ```dockerfile
   FROM node:22-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --production
   COPY dist/ ./dist/
   EXPOSE 3000
   CMD ["node", "dist/mcp-server.js"]
   ```

4. **Azure Deployment**
   - Create Azure Container Apps environment
   - Deploy containerized MCP server
   - Configure managed identity for SQL access
   - Set up environment variables

5. **Azure AI Foundry Integration**
   - Create Azure AI Foundry project
   - Register MCP server as external tool
   - Configure agent to use MSSQL tools
   - Test end-to-end scenarios

## Architecture

### Option 1: MCP over HTTP/SSE (Current Implementation)

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
└──────────┬──────────┘
           │ Entra ID Auth
           ▼
┌─────────────────────┐
│  Azure SQL Database │
│    (contoso)        │
└─────────────────────┘
```

### Endpoints

- `GET /health` - Health check
- `GET /sse` - Establish SSE connection for MCP
- `POST /sse` - Send MCP messages

### Environment Variables

```bash
# Azure SQL Database
SERVER_NAME=mcp-ilona.database.windows.net
DATABASE_NAME=contoso
CONNECTION_TIMEOUT=120
TRUST_SERVER_CERTIFICATE=true

# HTTP Server
PORT=3000
NODE_ENV=production

# CORS
ALLOWED_ORIGINS=https://ai.azure.com,https://your-foundry-instance.azurewebsites.net

# Authentication (to be added)
API_KEY=your-secret-api-key
```

## Tools Specification

### 1. read_data

Execute SELECT queries on the database.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "SQL SELECT query to execute"
    }
  },
  "required": ["query"]
}
```

**Example:**
```json
{
  "query": "SELECT TOP 10 * FROM SalesLT.Customer"
}
```

### 2. list_table

List all tables in the database, optionally filtered by schema.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "parameters": {
      "type": "array",
      "description": "Optional schema names to filter",
      "items": { "type": "string" }
    }
  }
}
```

**Example:**
```json
{
  "parameters": ["SalesLT"]
}
```

### 3. describe_table

Get schema information for a specific table.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "tableName": {
      "type": "string",
      "description": "Name of the table to describe"
    }
  },
  "required": ["tableName"]
}
```

**Example:**
```json
{
  "tableName": "Customer"
}
```

## Testing

### Manual Testing with Curl

```powershell
# Health check
curl http://localhost:3000/health

# Establish SSE connection (keep this running in one terminal)
curl -N http://localhost:3000/sse

# In another terminal, send MCP message
$sessionId = "<session-id-from-sse-response>"
curl -X POST http://localhost:3000/sse `
  -H "Content-Type: application/json" `
  -H "x-mcp-session-id: $sessionId" `
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }'
```

### Automated Testing

```powershell
# Run test client
cd c:\sources\gh\SQL-AI-samples\MssqlMcp\Foundry
node dist/test-mcp-client.js
```

## Troubleshooting

### Server Won't Start

1. Check port 3000 is not in use:
   ```powershell
   Get-NetTCPConnection -LocalPort 3000
   ```

2. Check environment variables:
   ```powershell
   Get-Content .env
   ```

3. Check Azure credentials:
   ```powershell
   az login
   az account show
   ```

### SSE Connection Fails

1. Verify server is running:
   ```powershell
   Invoke-RestMethod http://localhost:3000/health
   ```

2. Check CORS settings in `.env`:
   ```
   ALLOWED_ORIGINS=http://localhost:3000
   ```

3. Verify SSE endpoint responds:
   ```powershell
   curl -v http://localhost:3000/sse
   ```

### SQL Connection Fails

1. Check Azure SQL firewall rules
2. Verify Entra ID authentication is configured
3. Check managed identity has SQL permissions:
   ```sql
   CREATE USER [your-app-name] FROM EXTERNAL PROVIDER;
   ALTER ROLE db_datareader ADD MEMBER [your-app-name];
   ALTER ROLE db_datawriter ADD MEMBER [your-app-name];
   ```

## Development

### Build

```powershell
npm run build
```

### Run Locally

```powershell
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

### Code Structure

```
MssqlMcp/Foundry/
├── src/
│   ├── mcp-server.ts       # MCP over SSE implementation (MAIN)
│   ├── server.ts           # REST API implementation (LEGACY)
│   └── test-mcp-client.ts  # Test client for MCP server
├── dist/                   # Compiled JavaScript
├── .env                    # Environment variables
├── package.json           # Dependencies
├── tsconfig.json          # TypeScript configuration
└── README.md              # Project documentation
```

## References

- [Model Context Protocol Specification](https://spec.modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Azure AI Foundry Documentation](https://learn.microsoft.com/azure/ai-foundry/)
- [Azure SQL Database with Entra ID](https://learn.microsoft.com/azure/azure-sql/database/authentication-aad-overview)

## Support

For issues or questions:
1. Check this documentation
2. Review the implementation plan: `IMPLEMENTATION_PLAN.md`
3. Check the main README: `README.md`
4. Review MCP SDK documentation

## Next Actions

1. **Fix SSE Connection Issues**
   - Debug why client can't connect to SSE endpoint
   - Verify session ID management
   - Test MCP protocol communication

2. **Deploy to Azure**
   - Create Dockerfile
   - Set up Azure Container Apps
   - Configure managed identity
   - Deploy and test

3. **Integrate with Foundry**
   - Create Foundry project
   - Register MCP tools
   - Test with Foundry agent
   - Document usage patterns
