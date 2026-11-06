import { type ChangeEvent } from 'react';

import { type AzureCredentials } from '@grafana/azure-sdk';
import { t } from '@grafana/i18n';
import { Field, Input } from '@grafana/ui';

import { type AzureWorkloadIdentityCredentialsWithIds } from '../../credentials';
import { selectors } from '../../e2e/selectors';

export interface WorkloadIdentityCredentialsProps {
  credentials: AzureWorkloadIdentityCredentialsWithIds;
  onCredentialsChange: (updatedCredentials: AzureCredentials) => void;
  disabled?: boolean;
}

export const WorkloadIdentityCredentials = (props: WorkloadIdentityCredentialsProps) => {
  const { credentials, onCredentialsChange, disabled } = props;

  const onTenantIdChange = (event: ChangeEvent<HTMLInputElement>) => {
    onCredentialsChange({ ...credentials, tenantId: event.target.value } as AzureCredentials);
  };

  const onClientIdChange = (event: ChangeEvent<HTMLInputElement>) => {
    onCredentialsChange({ ...credentials, clientId: event.target.value } as AzureCredentials);
  };

  return (
    <>
      <Field
        label={t('components.workload-identity-credentials.label-tenant-id', 'Directory (tenant) ID')}
        data-testid={selectors.components.configEditor.tenantID.input}
        htmlFor="workload-identity-tenant-id"
        noMargin
      >
        <Input
          id="workload-identity-tenant-id"
          aria-label={t('components.workload-identity-credentials.aria-label-tenant-id', 'Tenant ID')}
          className="width-30"
          placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
          value={credentials.tenantId || ''}
          onChange={onTenantIdChange}
          disabled={disabled}
        />
      </Field>
      <Field
        label={t('components.workload-identity-credentials.label-client-id', 'Application (client) ID')}
        data-testid={selectors.components.configEditor.clientID.input}
        htmlFor="workload-identity-client-id"
        noMargin
      >
        <Input
          id="workload-identity-client-id"
          aria-label={t('components.workload-identity-credentials.aria-label-client-id', 'Client ID')}
          className="width-30"
          placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
          value={credentials.clientId || ''}
          onChange={onClientIdChange}
          disabled={disabled}
        />
      </Field>
    </>
  );
};
