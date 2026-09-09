import { useMemo, useState } from 'react';
import { useEffectOnce } from 'react-use';

import { type AzureCredentials } from '@grafana/azure-sdk';
import { type SelectableValue } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { ConfigSection } from '@grafana/plugin-ui';
import { config } from '@grafana/runtime';
import { Button, Stack } from '@grafana/ui';

import { getCredentials, updateCredentials } from '../../credentials';
import { useBatchAPIFlag } from '../../featureFlags';
import { trackAzureMonitorBatchAPIToggled } from '../../tracking';
import { type AzureMonitorDataSourceSettings } from '../../types/types';

import { AzureCredentialsForm, getAzureCloudOptions } from './AzureCredentialsForm';
import { AzureSetupWizard, type ExecutionEnvironment } from './AzureSetupWizard';
import { BasicLogsToggle } from './BasicLogsToggle';
import { BatchAPIToggle } from './BatchAPIToggle';
import { DefaultSubscription } from './DefaultSubscription';

export interface Props {
  options: AzureMonitorDataSourceSettings;
  updateOptions: (optionsFunc: (options: AzureMonitorDataSourceSettings) => AzureMonitorDataSourceSettings) => void;
  getSubscriptions: () => Promise<Array<SelectableValue<string>>>;
}

export const MonitorConfig = (props: Props) => {
  const { updateOptions, getSubscriptions, options } = props;
  const [subscriptions, setSubscriptions] = useState<Array<SelectableValue<string>>>([]);
  const [verifying, setVerifying] = useState(false);
  const credentials = useMemo(() => getCredentials(props.options), [props.options]);
  const [setupMethod, setSetupMethod] = useState<ExecutionEnvironment | 'manual' | undefined>(() =>
    options.readOnly ||
    credentials.authType !== 'clientsecret' ||
    credentials.tenantId ||
    credentials.clientId ||
    credentials.clientSecret
      ? 'manual'
      : undefined
  );
  const batchFlagEnabled = useBatchAPIFlag();

  const onCredentialsChange = (credentials: AzureCredentials, subscriptionId?: string): void => {
    if (!subscriptionId) {
      setSubscriptions([]);
    }
    updateOptions((options: AzureMonitorDataSourceSettings) =>
      updateCredentials({ ...options, jsonData: { ...options.jsonData, subscriptionId } }, credentials)
    );
  };

  const onSubscriptionsChange = (receivedSubscriptions: Array<SelectableValue<string>>) =>
    setSubscriptions(receivedSubscriptions);

  const onSubscriptionChange = (subscriptionId?: string) =>
    updateOptions((options) => ({ ...options, jsonData: { ...options.jsonData, subscriptionId } }));

  const onBasicLogsEnabledChange = (enableBasicLogs: boolean) =>
    updateOptions((options) => ({ ...options, jsonData: { ...options.jsonData, basicLogsEnabled: enableBasicLogs } }));

  const onBatchAPIEnabledChange = (batchAPIEnabled: boolean) => {
    trackAzureMonitorBatchAPIToggled({ grafana_version: config.buildInfo.version, enabled: batchAPIEnabled });
    updateOptions((options) => ({ ...options, jsonData: { ...options.jsonData, batchAPIEnabled } }));
  };

  // The auth type needs to be set on the first load of the data source
  useEffectOnce(() => {
    if (!options.jsonData.authType || !credentials.authType) {
      onCredentialsChange(credentials, options.jsonData.subscriptionId);
    }
  });

  return (
    <>
      {!options.readOnly && (
        <ConfigSection
          title={t('components.monitor-config.setup-access', 'Set up Azure access')}
          description={t(
            'components.monitor-config.setup-access-help',
            'Use your existing Azure account to create read-only Azure access for Grafana.'
          )}
        >
          <Stack direction="column" gap={2}>
            <Stack direction="column" gap={1}>
              <Button
                type="button"
                variant="secondary"
                aria-pressed={setupMethod === 'cloud-shell'}
                disabled={verifying}
                onClick={() => setSetupMethod('cloud-shell')}
              >
                <Trans i18nKey="components.monitor-config.cloud-shell">Azure Cloud Shell — recommended</Trans>
              </Button>
              <Button
                type="button"
                variant="secondary"
                aria-pressed={setupMethod === 'local-terminal'}
                disabled={verifying}
                onClick={() => setSetupMethod('local-terminal')}
              >
                <Trans i18nKey="components.monitor-config.local-terminal">Local terminal</Trans>
              </Button>
              <Button
                type="button"
                variant="secondary"
                aria-pressed={setupMethod === 'manual'}
                disabled={verifying}
                onClick={() => setSetupMethod('manual')}
              >
                <Trans i18nKey="components.monitor-config.manual-credentials">Use existing Azure credentials</Trans>
              </Button>
            </Stack>
            {(setupMethod === 'cloud-shell' || setupMethod === 'local-terminal') && (
              <AzureSetupWizard
                environment={setupMethod}
                onCredentialsChange={onCredentialsChange}
                getSubscriptions={getSubscriptions}
                onVerificationChange={setVerifying}
              />
            )}
          </Stack>
        </ConfigSection>
      )}
      {(setupMethod === 'manual' || options.readOnly) && (
        <AzureCredentialsForm
          managedIdentityEnabled={config.azure.managedIdentityEnabled}
          workloadIdentityEnabled={config.azure.workloadIdentityEnabled}
          userIdentityEnabled={config.azure.userIdentityEnabled && !!config.featureToggles.azureMonitorEnableUserAuth}
          credentials={credentials}
          azureCloudOptions={getAzureCloudOptions()}
          onCredentialsChange={onCredentialsChange}
          disabled={props.options.readOnly}
        >
          <DefaultSubscription
            subscriptions={subscriptions}
            credentials={credentials}
            getSubscriptions={getSubscriptions}
            disabled={props.options.readOnly}
            onSubscriptionsChange={onSubscriptionsChange}
            onSubscriptionChange={onSubscriptionChange}
            options={options.jsonData}
          />
        </AzureCredentialsForm>
      )}
      <ConfigSection title={t('components.monitor-config.title-features', 'Features')}>
        <Stack direction="column" gap={4}>
          <BasicLogsToggle options={options.jsonData} onBasicLogsEnabledChange={onBasicLogsEnabledChange} />
          {batchFlagEnabled && (
            <BatchAPIToggle options={options.jsonData} onBatchAPIEnabledChange={onBatchAPIEnabledChange} />
          )}
        </Stack>
      </ConfigSection>
    </>
  );
};
