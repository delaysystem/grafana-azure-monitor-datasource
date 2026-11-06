import { type AzureCredentials } from '@grafana/azure-sdk';
import { config } from '@grafana/runtime';

import { getCredentials, updateCredentials } from './credentials';
import { type AzureMonitorDataSourceSettings } from './types/types';

const dsOptions = (azureCredentials: object) =>
  ({
    jsonData: { azureCredentials: { authType: 'workloadidentity', ...azureCredentials } },
    secureJsonData: {},
    secureJsonFields: {},
  }) as unknown as AzureMonitorDataSourceSettings;

const setToggle = (enabled: boolean) => {
  config.featureToggles = {
    ...config.featureToggles,
    workloadIdentityInMemory: enabled,
  } as typeof config.featureToggles;
};

describe('workload identity tenant and client IDs', () => {
  beforeEach(() => {
    config.azure.workloadIdentityEnabled = true;
    setToggle(true);
  });

  it('should restore saved tenantId and clientId', () => {
    const options = dsOptions({ tenantId: 'tenant-1', clientId: 'client-1' });

    expect(getCredentials(options)).toEqual({
      authType: 'workloadidentity',
      tenantId: 'tenant-1',
      clientId: 'client-1',
    });
  });

  it('should persist tenantId and clientId in azureCredentials', () => {
    const credentials = { authType: 'workloadidentity', tenantId: 'tenant-1', clientId: 'client-1' };

    const updated = updateCredentials(dsOptions({}), credentials as AzureCredentials);

    expect(updated.jsonData.azureCredentials).toEqual(credentials);
  });

  it('should omit tenantId and clientId when they are cleared', () => {
    const credentials = { authType: 'workloadidentity', tenantId: '', clientId: '' };

    const updated = updateCredentials(
      dsOptions({ tenantId: 'tenant-1', clientId: 'client-1' }),
      credentials as AzureCredentials
    );

    expect(updated.jsonData.azureCredentials).toEqual({ authType: 'workloadidentity' });
  });

  it('should ignore tenantId and clientId when the feature toggle is off', () => {
    setToggle(false);
    const options = dsOptions({ tenantId: 'tenant-1', clientId: 'client-1' });

    expect(getCredentials(options)).toEqual({ authType: 'workloadidentity' });

    const updated = updateCredentials(options, {
      authType: 'workloadidentity',
      tenantId: 'tenant-1',
      clientId: 'client-1',
    } as AzureCredentials);
    expect(updated.jsonData.azureCredentials).toEqual({ authType: 'workloadidentity' });
  });
});
