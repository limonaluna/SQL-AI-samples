#!/usr/bin/env node

import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import sql from 'mssql';
import { DefaultAzureCredential } from '@azure/identity';

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

// Global SQL connection
let globalSqlPool: sql.ConnectionPool | null = null;
let globalAccessToken: string | null = null;
let globalTokenExpiresOn: Date | null = null;

// Function to create SQL config with fresh access token
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

// Ensure SQL connection is established
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

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'mssql-mcp-server-foundry',
    version: '1.0.0'
  });
});

// Info endpoint - list available MCP tools
app.get('/info', (req: Request, res: Response) => {
  res.json({
    name: 'mssql-mcp-server',
    version: '1.0.0',
    description: 'HTTP-based MSSQL MCP Server for Azure AI Foundry',
    transport: 'http',
    tools: [
      {
        name: 'read_data',
        description: 'Execute SELECT queries on the database'
      },
      {
        name: 'list_table',
        description: 'List all tables in the database'
      },
      {
        name: 'describe_table',
        description: 'Get schema information for a specific table'
      }
    ]
  });
});

// Simple test endpoint for read_data
app.post('/api/read_data', async (req: Request, res: Response) => {
  try {
    await ensureSqlConnection();
    
    const { query } = req.body;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query is required and must be a string'
      });
    }

    // Basic validation: must start with SELECT
    if (!query.trim().toUpperCase().startsWith('SELECT')) {
      return res.status(400).json({
        success: false,
        error: 'Only SELECT queries are allowed'
      });
    }

    console.log(`Executing query: ${query.substring(0, 100)}...`);
    
    const request = new sql.Request();
    const result = await request.query(query);
    
    res.json({
      success: true,
      message: `Retrieved ${result.recordset.length} record(s)`,
      data: result.recordset,
      recordCount: result.recordset.length
    });

  } catch (error) {
    console.error('Error executing query:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// List tables endpoint
app.post('/api/list_table', async (req: Request, res: Response) => {
  try {
    await ensureSqlConnection();
    
    const { parameters } = req.body;
    
    const request = new sql.Request();
    const schemaFilter = parameters && parameters.length > 0 
      ? `AND TABLE_SCHEMA IN (${parameters.map((p: string) => `'${p}'`).join(", ")})` 
      : "";
    
    const query = `SELECT TABLE_SCHEMA + '.' + TABLE_NAME as [table] FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ${schemaFilter} ORDER BY TABLE_SCHEMA, TABLE_NAME`;
    
    const result = await request.query(query);
    
    res.json({
      success: true,
      message: 'List tables executed successfully',
      tables: result.recordset
    });

  } catch (error) {
    console.error('Error listing tables:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Describe table endpoint
app.post('/api/describe_table', async (req: Request, res: Response) => {
  try {
    await ensureSqlConnection();
    
    const { tableName } = req.body;
    
    if (!tableName || typeof tableName !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'tableName is required and must be a string'
      });
    }

    const request = new sql.Request();
    const query = `SELECT COLUMN_NAME as name, DATA_TYPE as type FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tableName`;
    request.input('tableName', sql.NVarChar, tableName);
    
    const result = await request.query(query);
    
    res.json({
      success: true,
      columns: result.recordset
    });

  } catch (error) {
    console.error('Error describing table:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Start server
async function startServer() {
  try {
    // Test database connection on startup
    await ensureSqlConnection();
    
    app.listen(PORT, () => {
      console.log('=================================');
      console.log('🚀 MSSQL MCP Server (Foundry)');
      console.log('=================================');
      console.log(`Server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`Info: http://localhost:${PORT}/info`);
      console.log(`\nAPI Endpoints:`);
      console.log(`  POST http://localhost:${PORT}/api/read_data`);
      console.log(`  POST http://localhost:${PORT}/api/list_table`);
      console.log(`  POST http://localhost:${PORT}/api/describe_table`);
      console.log('=================================');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server...');
  if (globalSqlPool) {
    await globalSqlPool.close();
  }
  process.exit(0);
});

startServer();
