// Azure Container Apps deployment for MSSQL MCP Server
@description('The location for all resources')
param location string = resourceGroup().location

@description('Name of the Container Apps Environment')
param environmentName string = 'mcp-env-${uniqueString(resourceGroup().id)}'

@description('Name of the Container App')
param containerAppName string = 'mssql-mcp-foundry'

@description('Container image to deploy')
param containerImage string

@description('Azure SQL Server name (without .database.windows.net)')
param sqlServerName string

@description('Azure SQL Database name')
param sqlDatabaseName string

@description('API key for authentication')
@secure()
param apiKey string

@description('Allowed CORS origins (comma-separated)')
param allowedOrigins string = 'https://ai.azure.com'

@description('Enable rate limiting')
param enableRateLimiting bool = true

@description('CPU cores for the container')
param cpu string = '0.5'

@description('Memory for the container')
param memory string = '1Gi'

@description('Minimum number of replicas')
param minReplicas int = 1

@description('Maximum number of replicas')
param maxReplicas int = 3

// Log Analytics Workspace for Container Apps Environment
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${environmentName}-logs'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// Container Apps Environment
resource environment 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: environmentName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// Managed Identity for the Container App
resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${containerAppName}-identity'
  location: location
}

// Container App
resource containerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: containerAppName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'http'
        corsPolicy: {
          allowedOrigins: split(allowedOrigins, ',')
          allowedMethods: ['GET', 'POST', 'OPTIONS']
          allowedHeaders: ['*']
          allowCredentials: true
        }
      }
      secrets: [
        {
          name: 'api-key'
          value: apiKey
        }
      ]
      registries: []
    }
    template: {
      containers: [
        {
          name: containerAppName
          image: containerImage
          resources: {
            cpu: json(cpu)
            memory: memory
          }
          env: [
            {
              name: 'SERVER_NAME'
              value: '${sqlServerName}.database.windows.net'
            }
            {
              name: 'DATABASE_NAME'
              value: sqlDatabaseName
            }
            {
              name: 'CONNECTION_TIMEOUT'
              value: '120'
            }
            {
              name: 'TRUST_SERVER_CERTIFICATE'
              value: 'true'
            }
            {
              name: 'PORT'
              value: '3000'
            }
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'ALLOWED_ORIGINS'
              value: allowedOrigins
            }
            {
              name: 'API_KEY'
              secretRef: 'api-key'
            }
            {
              name: 'ENABLE_RATE_LIMITING'
              value: string(enableRateLimiting)
            }
            {
              name: 'RATE_LIMIT_MAX'
              value: '100'
            }
            {
              name: 'RATE_LIMIT_WINDOW_MS'
              value: '60000'
            }
            {
              name: 'AZURE_CLIENT_ID'
              value: managedIdentity.properties.clientId
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 3000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 10
              periodSeconds: 30
              timeoutSeconds: 3
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: 3000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 5
              periodSeconds: 10
              timeoutSeconds: 3
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        rules: [
          {
            name: 'http-rule'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

// Outputs
output containerAppFQDN string = containerApp.properties.configuration.ingress.fqdn
output containerAppUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output managedIdentityPrincipalId string = managedIdentity.properties.principalId
output managedIdentityClientId string = managedIdentity.properties.clientId
