# MSSQL MCP Server for Azure AI Foundry Agent Service

HTTP-based version of the MSSQL MCP server designed to work with Azure AI Foundry Agent Service.

## Status: ✅ Functional HTTP API

The server provides a REST API for database operations and is ready for basic integration.

## Quick Start

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
   # In PowerShell
   $body = @{ query = "SELECT TOP 5 * FROM SalesLT.Customer" } | ConvertTo-Json
   Invoke-RestMethod -Uri "http://localhost:3000/api/read_data" -Method Post -Body $body -ContentType "application/json"
   ```

## Available Endpoints

### GET /health
Health check endpoint
```bash
GET http://localhost:3000/health
```

### GET /info  
List available tools and server information
```bash
GET http://localhost:3000/info
```

### POST /api/read_data
Execute SELECT queries
```json
{
  "query": "SELECT TOP 5 CustomerID, FirstName, LastName FROM SalesLT.Customer"
}
```

### POST /api/list_table
List all database tables (optionally filtered by schema)
```json
{
  "parameters": ["SalesLT"]  // optional
}
```

### POST /api/describe_table
Get schema information for a table
```json
{
  "tableName": "Customer"
}
```

## Architecture

- **Transport**: HTTP with Express.js
- **Authentication**: Entra ID (DefaultAzureCredential)  
- **Database**: Azure SQL Database
- **Read-only mode**: Supported via READONLY env var

## Comparison with Node Version

| Feature | Node (stdio) | Foundry (HTTP) |
|---------|-------------|----------------|
| Transport | stdio | HTTP/REST |
| VS Code | ✅ | ❌ |
| Foundry Agent | ❌ | ✅ (next step) |
| Direct API calls | ❌ | ✅ |
| Port | N/A | 3000 |

## Next Steps

- [ ] Add MCP protocol over SSE transport
- [ ] Add API key authentication middleware
- [ ] Docker containerization  
- [ ] Azure Container Apps deployment
- [ ] Foundry Agent integration example

## Notes

- The original `Node/` version continues to work unchanged for VS Code
- Both versions can run simultaneously
- They share the same database but use different transport mechanisms
