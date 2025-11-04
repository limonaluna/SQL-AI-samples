# Implementation Plan: MCP Server for Azure AI Foundry

## Goal
Create an HTTP-based version of the MSSQL MCP server that works with Azure AI Foundry Agent Service, while keeping the existing VS Code stdio version fully functional.

## Strategy: Shared Code Architecture

We'll create a shared tools layer that both versions can use:

```
MssqlMcp/
├── Node/                          # EXISTING - Don't touch!
│   ├── src/
│   │   ├── index.ts              # Stdio transport
│   │   └── tools/                # Tool implementations
│   └── dist/
│
├── Shared/                        # NEW - Common code
│   ├── src/
│   │   ├── tools/                # Shared tool implementations
│   │   │   ├── CreateTableTool.ts
│   │   │   ├── ReadDataTool.ts
│   │   │   └── ...
│   │   ├── db/
│   │   │   └── connection.ts     # SQL connection logic
│   │   └── types/
│   │       └── index.ts          # Common type definitions
│   └── package.json
│
└── Foundry/                       # NEW - HTTP version
    ├── src/
    │   ├── server.ts              # HTTP + SSE transport
    │   ├── middleware/
    │   │   └── auth.ts            # API key authentication
    │   └── config/
    │       └── env.ts
    ├── deploy/                    # Azure deployment configs
    │   ├── Dockerfile
    │   └── container-app.bicep
    ├── client-samples/            # Example usage
    │   └── python/
    │       └── foundry_agent.py
    └── package.json
```

## Implementation Steps

### Phase 1: Setup ✅ COMPLETED
- [x] Create Foundry folder structure
- [x] Create planning documents
- [x] Create basic package.json for Foundry version
- [x] Verify existing Node version still works

### Phase 2: HTTP Server ✅ COMPLETED  
- [x] Create basic Express HTTP server in Foundry
- [x] Add health check endpoint
- [x] Test server starts and responds
- [x] Add CORS configuration
- [x] Add SQL connection management
- [x] Add simple /api/read_data endpoint
- [x] Verify both servers work simultaneously

### Phase 3: Core Tools ✅ COMPLETED
- [x] Add read_data tool with validation
- [x] Add list_table tool
- [x] Add describe_table tool
- [x] Test all tools via HTTP
- [x] Verify Node MCP server unchanged

### Phase 4: SSE Transport ✅ COMPLETED
- [x] Implement SSE endpoint for MCP protocol
- [x] Add MCP message handling with session management
- [x] Add GET /sse endpoint for establishing connections
- [x] Add POST /sse endpoint for message routing
- [x] Integrate all three tools (read_data, list_table, describe_table)
- [x] Build and compile successfully
- [ ] **TODO**: Fix background process testing (deferred to Azure deployment testing)

### Phase 5: Authentication ✅ COMPLETED
- [x] Create authentication middleware (src/middleware/auth.ts)
- [x] Add API key authentication support (x-api-key header, Bearer token, query param)
- [x] Add rate limiting functionality
- [x] Integrate middleware into mcp-server.ts
- [x] Update environment variable configuration
- [x] Create authentication test script (test-auth.ts)
- [x] Build successfully with all features

### Phase 6: Full Tool Integration - NEXT
- [ ] Verify all tools work with authentication
- [ ] Add read-only mode support
- [ ] Test all tool operations
- [ ] Add comprehensive error handling

### Phase 7: Containerization ✅ COMPLETED
- [x] Create Dockerfile with multi-stage build
- [x] Add .dockerignore file
- [x] Create docker-compose.yml for local testing
- [x] Configure health checks
- [x] Use non-root user for security
- [x] Update README with Docker instructions

### Phase 8: Azure Deployment - NEXT
- [ ] Create Azure Container Registry
- [ ] Build and push Docker image
- [ ] Create Bicep/ARM templates for Azure Container Apps
- [ ] Deploy to Azure Container Apps
- [ ] Configure environment variables
- [ ] Set up managed identity for SQL access
- [ ] Test public endpoint

### Phase 9: Foundry Integration (Step 9)
- [ ] Create Azure AI Foundry project
- [ ] Register MCP tool
- [ ] Create sample agent
- [ ] Test end-to-end

### Phase 10: Documentation & Migration Path (Step 10)
- [ ] Document both versions
- [ ] Create migration guide
- [ ] (Optional) Update Node version to use Shared code

## Safety Checkpoints

After each phase, we will:
1. ✅ Verify existing VS Code setup still works
2. ✅ Commit changes with clear messages
3. ✅ Test new functionality
4. ✅ Get your approval before proceeding

## Rollback Strategy

- All changes are in new folders (Shared/, Foundry/)
- Node/ folder remains untouched until Phase 10 (optional)
- Can delete new folders at any time without breaking existing setup
- Git history allows reverting any step

## Current Status

**Phase 1 - Step 1: ✅ Completed**
- Created Foundry folder structure
- Created planning documents

**Next Step: Create basic package.json for Foundry version**

Would you like me to proceed with the next step?
