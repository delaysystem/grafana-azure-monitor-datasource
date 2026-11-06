import {
  type AzureCredentials,
  type AzureWorkloadIdentityCredentials,
  getDatasourceCredentials,
  getDefaultAzureCloud,
  getClientSecret,
  resolveLegacyCloudName,
  updateDatasourceCredentials,
} from '@grafana/azure-sdk';
import { config } from '@grafana/runtime';

import { type AzureMonitorDataSourceInstanceSettings, type AzureMonitorDataSourceSettings } from './types/types';

// The SDK's workload identity credentials only carry the auth type and drop any tenant/client ID on
// load and save. The backend accepts them in jsonData.azureCredentials, so they are preserved here.
export type AzureWorkloadIdentityCredentialsWithIds = AzureWorkloadIdentityCredentials & {
  tenantId?: string;
  clientId?: string;
};

export const getWorkloadIdentityInMemoryEnabled = (): boolean =>
  !!(config.featureToggles as Record<string, boolean | undefined>).workloadIdentityInMemory;

export function getCredentials(
  options: AzureMonitorDataSourceSettings | AzureMonitorDataSourceInstanceSettings
): AzureCredentials {
  // Try to get the credentials from the datasource settings,
  // If not found, return the legacy azure monitor credentials if they exist or fallback to default credentials
  const creds = getDatasourceCredentials(options);
  if (creds) {
    return creds.authType === 'workloadidentity' && getWorkloadIdentityInMemoryEnabled()
      ? withWorkloadIdentityIds(creds, options.jsonData.azureCredentials)
      : creds;
  }

  return getLegacyCredentials(options) || getDefaultCredentials();
}

export function updateCredentials(
  options: AzureMonitorDataSourceSettings,
  credentials: AzureCredentials
): AzureMonitorDataSourceSettings {
  const updated = updateDatasourceCredentials(options, credentials);
  if (credentials.authType !== 'workloadidentity' || !getWorkloadIdentityInMemoryEnabled()) {
    return updated;
  }

  const { tenantId, clientId } = credentials as AzureWorkloadIdentityCredentialsWithIds;
  return {
    ...updated,
    jsonData: {
      ...updated.jsonData,
      azureCredentials: {
        ...updated.jsonData.azureCredentials,
        ...(tenantId && { tenantId }),
        ...(clientId && { clientId }),
      } as AzureCredentials,
    },
  };
}

function withWorkloadIdentityIds(credentials: AzureCredentials, saved: unknown): AzureCredentials {
  const { tenantId, clientId } = (saved ?? {}) as AzureWorkloadIdentityCredentialsWithIds;
  return { ...credentials, ...(tenantId && { tenantId }), ...(clientId && { clientId }) } as AzureCredentials;
}

function getLegacyCredentials(
  options: AzureMonitorDataSourceSettings | AzureMonitorDataSourceInstanceSettings
): AzureCredentials | undefined {
  try {
    // If authentication type isn't explicitly specified and datasource has client credentials,
    // then this is existing datasource which is configured for app registration (client secret)
    if (
      options.jsonData.azureAuthType === 'clientsecret' ||
      (!options.jsonData.azureAuthType && options.jsonData.tenantId && options.jsonData.clientId)
    ) {
      return {
        authType: 'clientsecret',
        tenantId: options.jsonData.tenantId,
        clientId: options.jsonData.clientId,
        azureCloud: resolveLegacyCloudName(options.jsonData.cloudName) || getDefaultAzureCloud(),
        clientSecret: getClientSecret(options),
      };
    }

    // If the authentication type is not set, then no legacy credentials exist so return undefined
    if (!options.jsonData.azureAuthType) {
      return undefined;
    }

    return { authType: options.jsonData.azureAuthType };
  } catch (e) {
    if (e instanceof Error) {
      console.error('Unable to restore legacy credentials: %s', e.message);
    }
    return undefined;
  }
}

function getDefaultCredentials(): AzureCredentials {
  if (config.azure.managedIdentityEnabled) {
    return { authType: 'msi' };
  } else if (config.azure.workloadIdentityEnabled) {
    return { authType: 'workloadidentity' };
  } else {
    return { authType: 'clientsecret', azureCloud: getDefaultAzureCloud() };
  }
}
