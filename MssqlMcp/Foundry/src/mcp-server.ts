#!/usr/bin/env node

import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import sql from 'mssql';
import { DefaultAzureCredential } from '@azure/identity';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { apiKeyAuth, rateLimiter } from './middleware/auth.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
  credentials: true
}));
app.use(express.json());

// Authentication middleware (optional based on API_KEY env var)
if (process.env.API_KEY) {
  console.log('🔒 API Key authentication enabled');
  app.use(apiKeyAuth);
  
  // Optional: Rate limiting
  if (process.env.ENABLE_RATE_LIMITING === 'true') {
    const maxRequests = parseInt(process.env.RATE_LIMIT_MAX || '100');
    const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000');
    console.log(`⏱️  Rate limiting enabled: ${maxRequests} requests per ${windowMs}ms`);
    app.use(rateLimiter(maxRequests, windowMs));
  }
} else {
  console.log('⚠️  WARNING: Running without authentication - set API_KEY for production');
}

// Global SQL connection
let globalSqlPool: sql.ConnectionPool | null = null;
let globalAccessToken: string | null = null;
let globalTokenExpiresOn: Date | null = null;

// SQL Configuration
async function createSqlConfig(): Promise<{ config: sql.config, token: string, expiresOn: Date }> {
  const credential = new DefaultAzureCredential();
  const accessToken = await credential.getToken('https://database.windows.net/.default');

  const trustServerCertificate = process.env.TRUST_SERVER_CERTIFICATE?.toLowerCase() === 'true';
  const connectionTimeout = process.env.CONNECTION_TIMEOUT ? parseInt(process.env.CONNECTION_TIMEOUT, 10) : 30;

  return {
    config: {
      server: process.env.SERVER_NAME!,
      database: process.env.DATABASE_NAME!,
      options: {
        encrypt: true,
        trustServerCertificate
      },
      authentication: {
        type: 'azure-active-directory-access-token',
        options: {
          token: accessToken?.token!,
        },
      },
      connectionTimeout: connectionTimeout * 1000,
    },
    token: accessToken?.token!,
    expiresOn: accessToken?.expiresOnTimestamp ? new Date(accessToken.expiresOnTimestamp) : new Date(Date.now() + 30 * 60 * 1000)
  };
}

async function ensureSqlConnection() {
  if (
    globalSqlPool &&
    globalSqlPool.connected &&
    globalAccessToken &&
    globalTokenExpiresOn &&
    globalTokenExpiresOn > new Date(Date.now() + 2 * 60 * 1000)
  ) {
    return;
  }

  const { config, token, expiresOn } = await createSqlConfig();
  globalAccessToken = token;
  globalTokenExpiresOn = expiresOn;

  if (globalSqlPool && globalSqlPool.connected) {
    await globalSqlPool.close();
  }

  globalSqlPool = await sql.connect(config);
  console.log('✅ Connected to SQL Database');
}

// MCP Server Setup
const mcpServer = new Server(
  {
    name: 'mssql-mcp-server-foundry',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool Definitions
const tools = [
  {
    name: 'read_data',
    description: 'Execute SELECT queries on the database',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'SQL SELECT query to execute'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'list_table',
    description: 'List all tables in the database',
    inputSchema: {
      type: 'object',
      properties: {
        parameters: {
          type: 'array',
          description: 'Optional schema names to filter',
          items: { type: 'string' }
        }
      }
    }
  },
  {
    name: 'describe_table',
    description: 'Get schema information for a specific table',
    inputSchema: {
      type: 'object',
      properties: {
        tableName: {
          type: 'string',
          description: 'Name of the table to describe'
        }
      },
      required: ['tableName']
    }
  }
];

// MCP Request Handlers
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools
}));

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    await ensureSqlConnection();
    let result;

    switch (name) {
      case 'read_data':
        result = await executeReadData(args);
        break;
      case 'list_table':
        result = await executeListTable(args);
        break;
      case 'describe_table':
        result = await executeDescribeTable(args);
        break;
      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
      isError: true,
    };
  }
});

// Tool Implementations
async function executeReadData(args: any) {
  const { query } = args;
  
  if (!query || typeof query !== 'string') {
    throw new Error('Query is required and must be a string');
  }

  if (!query.trim().toUpperCase().startsWith('SELECT')) {
    throw new Error('Only SELECT queries are allowed');
  }

  const request = new sql.Request();
  const result = await request.query(query);
  
  return {
    success: true,
    message: `Retrieved ${result.recordset.length} record(s)`,
    data: result.recordset,
    recordCount: result.recordset.length,
    executedAt: new Date().toISOString()
  };
}

async function executeListTable(args: any) {
  const { parameters } = args || {};
  
  const request = new sql.Request();
  const schemaFilter = parameters && parameters.length > 0 
    ? `AND TABLE_SCHEMA IN (${parameters.map((p: string) => `'${p}'`).join(", ")})` 
    : "";
  
  const query = `SELECT TABLE_SCHEMA + '.' + TABLE_NAME as [table] FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ${schemaFilter} ORDER BY TABLE_SCHEMA, TABLE_NAME`;
  
  const result = await request.query(query);
  
  return {
    success: true,
    message: 'List tables executed successfully',
    tables: result.recordset,
    tableCount: result.recordset.length,
    executedAt: new Date().toISOString()
  };
}

async function executeDescribeTable(args: any) {
  const { tableName } = args;
  
  if (!tableName || typeof tableName !== 'string') {
    throw new Error('tableName is required and must be a string');
  }

  const request = new sql.Request();
  const query = `SELECT COLUMN_NAME as name, DATA_TYPE as type FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tableName`;
  request.input('tableName', sql.NVarChar, tableName);
  
  const result = await request.query(query);
  
  return {
    success: true,
    tableName: tableName,
    columns: result.recordset,
    columnCount: result.recordset.length,
    executedAt: new Date().toISOString()
  };
}

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'mssql-mcp-server-foundry',
    version: '1.0.0',
    protocol: 'MCP over SSE'
  });
});

// Store active transports by session ID
const transports = new Map<string, SSEServerTransport>();

// SSE endpoint for MCP - GET to establish connection
app.get('/sse', async (req: Request, res: Response) => {
  console.log('📡 New SSE connection established (GET)');
  
  const transport = new SSEServerTransport('/sse', res);
  
  // Store the transport by its session ID
  transports.set(transport.sessionId, transport);
  
  // Clean up on close
  transport.onclose = () => {
    console.log('📡 SSE connection closed');
    transports.delete(transport.sessionId);
  };
  
  // Connect to MCP server
  await mcpServer.connect(transport);
  
  // Start the SSE stream
  await transport.start();
});

// POST endpoint for MCP messages
app.post('/sse', async (req: Request, res: Response) => {
  console.log('📨 Received MCP POST message');
  
  // Get session ID from header or query param
  const sessionId = (req.headers['x-mcp-session-id'] as string) || req.query.sessionId as string;
  
  if (!sessionId) {
    res.status(400).json({ error: 'Missing session ID' });
    return;
  }
  
  const transport = transports.get(sessionId);
  if (!transport) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  
  // Handle the POST message
  await transport.handlePostMessage(req as any, res as any, req.body);
});

// Start server
async function startServer() {
  try {
    await ensureSqlConnection();
    
    app.listen(PORT, () => {
      console.log('=================================');
      console.log('🚀 MSSQL MCP Server (Foundry)');
      console.log('=================================');
      console.log(`Server running on port ${PORT}`);
      console.log(`Protocol: MCP over SSE`);
      console.log(`\nEndpoints:`);
      console.log(`  GET  http://localhost:${PORT}/health`);
      console.log(`  GET  http://localhost:${PORT}/sse (MCP SSE)`);
      console.log(`  POST http://localhost:${PORT}/message (MCP)`);
      console.log('=================================');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server...');
  if (globalSqlPool) {
    await globalSqlPool.close();
  }
  process.exit(0);
});

startServer();
