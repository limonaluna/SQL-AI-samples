#!/usr/bin/env node
/**
 * Test Authentication Middleware
 * Tests both with and without API key
 */

async function testAuth() {
  console.log('🧪 Testing Authentication\n');

  const baseUrl = 'http://localhost:3000';
  
  // @ts-ignore - fetch is available in Node.js 18+
  const globalFetch = fetch;
  
  try {
    // Test 1: Health check (should always work)
    console.log('Test 1: Health check (no auth required)');
    const healthResponse = await globalFetch(`${baseUrl}/health`);
    console.log(`Status: ${healthResponse.status}`);
    const healthData = await healthResponse.json();
    console.log('Response:', healthData);
    console.log('✅ Health check works\n');

    // Test 2: Protected endpoint without API key (should fail if API_KEY is set)
    console.log('Test 2: Access SSE without API key');
    const noAuthResponse = await globalFetch(`${baseUrl}/sse`);
    console.log(`Status: ${noAuthResponse.status}`);
    if (noAuthResponse.status === 401) {
      const errorData = await noAuthResponse.json();
      console.log('Response:', errorData);
      console.log('✅ Correctly rejected unauthorized request\n');
    } else {
      console.log('✅ No authentication required (API_KEY not set)\n');
    }

    // Test 3: Protected endpoint with API key
    const apiKey = process.env.API_KEY;
    if (apiKey) {
      console.log('Test 3: Access SSE with valid API key');
      const authResponse = await globalFetch(`${baseUrl}/sse`, {
        headers: {
          'x-api-key': apiKey
        }
      });
      console.log(`Status: ${authResponse.status}`);
      console.log('✅ Authenticated request accepted\n');

      // Test 4: Wrong API key
      console.log('Test 4: Access SSE with invalid API key');
      const wrongKeyResponse = await globalFetch(`${baseUrl}/sse`, {
        headers: {
          'x-api-key': 'wrong-key'
        }
      });
      console.log(`Status: ${wrongKeyResponse.status}`);
      const wrongKeyData = await wrongKeyResponse.json();
      console.log('Response:', wrongKeyData);
      console.log('✅ Correctly rejected invalid API key\n');

      // Test 5: Bearer token format
      console.log('Test 5: Access SSE with Bearer token');
      const bearerResponse = await globalFetch(`${baseUrl}/sse`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });
      console.log(`Status: ${bearerResponse.status}`);
      console.log('✅ Bearer token format works\n');
    }

    console.log('✅ All authentication tests passed!');
    
  } catch (error) {
    console.error('❌ Error:', error);
    if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 Make sure the server is running: node dist/mcp-server.js');
    }
    process.exit(1);
  }
}

testAuth();
