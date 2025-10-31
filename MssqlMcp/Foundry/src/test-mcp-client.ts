#!/usr/bin/env node
/**
 * Simple MCP Client to test the SSE transport
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

async function testMcpServer() {
  console.log('🧪 Testing MCP Server with SSE Transport\n');
  
  try {
    // Create SSE transport
    const transport = new SSEClientTransport(new URL('http://localhost:3000/sse'));
    
    // Create MCP client
    const client = new Client(
      {
        name: 'test-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    // Connect to server
    console.log('📡 Connecting to MCP server...');
    await client.connect(transport);
    console.log('✅ Connected!\n');

    // List available tools
    console.log('📋 Listing available tools...');
    const toolsResponse = await client.listTools();
    console.log(`Found ${toolsResponse.tools.length} tools:\n`);
    
    toolsResponse.tools.forEach((tool, index) => {
      console.log(`${index + 1}. ${tool.name}`);
      console.log(`   Description: ${tool.description}`);
      console.log(`   Input Schema:`, JSON.stringify(tool.inputSchema, null, 2));
      console.log();
    });

    // Test: List tables
    console.log('🔧 Testing tool: list_table');
    const listTablesResult = await client.callTool({
      name: 'list_table',
      arguments: {}
    });
    console.log('Result:', (listTablesResult.content as any)[0]);
    console.log();

    // Test: Read data
    console.log('🔧 Testing tool: read_data');
    const readDataResult = await client.callTool({
      name: 'read_data',
      arguments: {
        query: 'SELECT TOP 3 CustomerID, FirstName, LastName FROM SalesLT.Customer'
      }
    });
    console.log('Result:', (readDataResult.content as any)[0]);
    console.log();

    // Test: Describe table
    console.log('🔧 Testing tool: describe_table');
    const describeResult = await client.callTool({
      name: 'describe_table',
      arguments: {
        tableName: 'Customer'
      }
    });
    console.log('Result:', (describeResult.content as any)[0]);
    console.log();

    console.log('✅ All tests passed!');
    
    // Close connection
    await client.close();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testMcpServer();
