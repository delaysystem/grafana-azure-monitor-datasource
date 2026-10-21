import { OpenFeatureProvider } from '@openfeature/react-sdk';
import { memo, useEffect, useState, type ChangeEvent } from 'react';

import { type DataSourcePluginOptionsEditorProps, type SelectableValue } from '@grafana/data';
import { t } from '@grafana/i18n';
import { ConfigSection, ConfigSubSection, DataSourceDescription } from '@grafana/plugin-ui';
import { getBackendSrv, isFetchError, config } from '@grafana/runtime';
import { Alert, Divider, InlineField, Input, SecureSocksProxySettings, TagsInput } from '@grafana/ui';

import ResponseParser from '../../azure_monitor/response_parser';
import { OPEN_FEATURE_DOMAIN } from '../../featureFlags';
import {
  type AzureAPIResponse,
  type AzureMonitorDataSourceJsonData,
  type AzureMonitorDataSourceSecureJsonData,
  type AzureMonitorDataSourceSettings,
  type Subscription,
} from '../../types/types';
import { fetchAllArmPages, routeNames } from '../../utils/common';

import { MonitorConfig } from './MonitorConfig';
import { useDraftOptions } from './useDraftOptions';

export type Props = DataSourcePluginOptionsEditorProps<
  AzureMonitorDataSourceJsonData,
  AzureMonitorDataSourceSecureJsonData
>;

interface ErrorMessage {
  title: string;
  description: string;
  details?: string;
}

export const ConfigEditor = memo(function ConfigEditor(props: Props) {
  const { options, onOptionsChange } = props;
  const [error, setError] = useState<ErrorMessage | undefined>(undefined);

  const baseURL = `/api/datasources/uid/${options.uid}/resources/${routeNames.azureMonitor}/subscriptions`;

  const { latest, update: updateOptions, save: saveOptions } = useDraftOptions(options, onOptionsChange);

  // One-time migration: if this datasource still has the
  // deprecated shared `timeout`, copy it into any per-service field that
  // isn't already explicitly set, drop `timeout`, and save immediately - no
  // user action required.
  useEffect(() => {
    const current = latest.current;
    if (current.readOnly) {
      return;
    }

    if (current.jsonData.timeout === undefined) {
      return;
    }

    const { timeout, ...jsonData } = current.jsonData;
    const migrated: AzureMonitorDataSourceSettings = {
      ...current,
      jsonData: {
        ...jsonData,
        logsTimeout: jsonData.logsTimeout ?? timeout,
        metricsTimeout: jsonData.metricsTimeout ?? timeout,
        resourceGraphTimeout: jsonData.resourceGraphTimeout ?? timeout,
      },
    };

    updateOptions(() => migrated);
    // A failed save leaves the migration unsaved, so the next save retries it.
    saveOptions().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onCookiesChange(cookies: string[]): void {
    updateOptions((options) => ({
      ...options,
      jsonData: {
        ...options.jsonData,
        keepCookies: cookies,
      },
    }));
  }

  function onTimeoutFieldChange(field: 'logsTimeout' | 'metricsTimeout' | 'resourceGraphTimeout') {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const raw = event.currentTarget.value;
      const parsed = Number(raw);
      const value = raw === '' || !Number.isFinite(parsed) || parsed < 0 ? undefined : parsed;
      updateOptions((options) => ({
        ...options,
        jsonData: {
          ...options.jsonData,
          [field]: value,
        },
      }));
    };
  }

  async function getSubscriptions(): Promise<Array<SelectableValue<string>>> {
    const query = `?api-version=2019-03-01`;
    const resourcePath = `/api/datasources/uid/${options.uid}/resources/${routeNames.azureMonitor}`;
    try {
      await saveOptions();
      const value = await fetchAllArmPages<Subscription>(resourcePath, baseURL + query, async (path) => {
        const response = await getBackendSrv()
          .fetch<AzureAPIResponse<Subscription>>({ url: path, method: 'GET' })
          .toPromise();
        return response?.data;
      });

      setError(undefined);
      return ResponseParser.parseSubscriptionsForSelect({ value });
    } catch (err) {
      if (isFetchError(err)) {
        setError({
          title: 'Error requesting subscriptions',
          description: 'Could not request subscriptions from Azure. Check your credentials and try again.',
          details: err?.data?.message,
        });
      }
      return [];
    }
  }

  return (
    <OpenFeatureProvider domain={OPEN_FEATURE_DOMAIN}>
      <DataSourceDescription
        dataSourceName="Azure Monitor"
        docsLink="https://grafana.com/docs/grafana/latest/datasources/azure-monitor/"
        hasRequiredFields
      />
      <Divider />
      <MonitorConfig options={options} updateOptions={updateOptions} getSubscriptions={getSubscriptions} />
      {error && (
        <Alert severity="error" title={error.title} topSpacing={2}>
          <p>{error.description}</p>
          {error.details && <details style={{ whiteSpace: 'pre-wrap' }}>{error.details}</details>}
        </Alert>
      )}
      <>
        <Divider />
        <ConfigSection
          title={t('components.config-editor.title-additional-settings', 'Additional settings')}
          description={t(
            'components.config-editor.description-additional-settings',
            'Additional settings are optional settings that can be configured for more control over your data source. This includes Secure Socks Proxy, request timeout, and forwarded cookies.'
          )}
          isCollapsible={true}
          isInitiallyOpen={
            options.jsonData.enableSecureSocksProxy !== undefined ||
            options.jsonData.timeout !== undefined ||
            options.jsonData.logsTimeout !== undefined ||
            options.jsonData.metricsTimeout !== undefined ||
            options.jsonData.resourceGraphTimeout !== undefined ||
            options.jsonData.keepCookies !== undefined
          }
        >
          <ConfigSubSection
            title={t('components.config-editor.title-advanced-http-settings', 'Advanced HTTP settings')}
            description={
              <>
                {t(
                  'components.config-editor.description-advanced-http-settings-logs',
                  'Logs and Traces queries use the Logs timeout.'
                )}
                <br />
                {t(
                  'components.config-editor.description-advanced-http-settings-metrics',
                  'Metrics and Azure Portal links use the Metrics timeout.'
                )}
              </>
            }
          >
            <InlineField
              htmlFor="advanced-http-cookies"
              label={t('components.config-editor.label-allowed-cookies', 'Allowed cookies')}
              labelWidth={24}
              tooltip={t(
                'components.config-editor.tooltip-allowed-cookies',
                'Grafana proxy deletes forwarded cookies by default. Specify cookies by name that should be forwarded to the data source.'
              )}
              disabled={options.readOnly}
              grow
            >
              <TagsInput
                id="advanced-http-cookies"
                placeholder={t('components.config-editor.placeholder-new-cookie', 'New cookie (hit enter to add)')}
                tags={options.jsonData.keepCookies}
                onChange={onCookiesChange}
              />
            </InlineField>
            <InlineField
              htmlFor="advanced-http-logs-timeout"
              label={t('components.config-editor.label-logs-timeout', 'Logs timeout')}
              labelWidth={24}
              tooltip={t(
                'components.config-editor.tooltip-logs-timeout',
                'HTTP request timeout for Logs and Traces queries, in seconds. Default: 180s (3 minutes).'
              )}
              disabled={options.readOnly}
              grow
            >
              <Input
                id="advanced-http-logs-timeout"
                type="number"
                min={0}
                placeholder={t('components.config-editor.placeholder-logs-timeout', '180')}
                aria-label={t('components.config-editor.aria-label-logs-timeout', 'Logs timeout in seconds')}
                value={options.jsonData.logsTimeout ?? ''}
                onChange={onTimeoutFieldChange('logsTimeout')}
              />
            </InlineField>
            <InlineField
              htmlFor="advanced-http-metrics-timeout"
              label={t('components.config-editor.label-metrics-timeout', 'Metrics timeout')}
              labelWidth={24}
              tooltip={t(
                'components.config-editor.tooltip-metrics-timeout',
                'HTTP request timeout for Metrics queries, in seconds. Also used when building Azure Portal links. Default: 30s'
              )}
              disabled={options.readOnly}
              grow
            >
              <Input
                id="advanced-http-metrics-timeout"
                type="number"
                min={0}
                placeholder={t('components.config-editor.placeholder-metrics-timeout', '30')}
                aria-label={t('components.config-editor.aria-label-metrics-timeout', 'Metrics timeout in seconds')}
                value={options.jsonData.metricsTimeout ?? ''}
                onChange={onTimeoutFieldChange('metricsTimeout')}
              />
            </InlineField>
            <InlineField
              htmlFor="advanced-http-resource-graph-timeout"
              label={t('components.config-editor.label-resource-graph-timeout', 'Resource Graph timeout')}
              labelWidth={24}
              tooltip={t(
                'components.config-editor.tooltip-resource-graph-timeout',
                'HTTP request timeout for Resource Graph queries, in seconds. Default: 30s'
              )}
              disabled={options.readOnly}
              grow
            >
              <Input
                id="advanced-http-resource-graph-timeout"
                type="number"
                min={0}
                placeholder={t('components.config-editor.placeholder-resource-graph-timeout', '30')}
                aria-label={t(
                  'components.config-editor.aria-label-resource-graph-timeout',
                  'Resource Graph timeout in seconds'
                )}
                value={options.jsonData.resourceGraphTimeout ?? ''}
                onChange={onTimeoutFieldChange('resourceGraphTimeout')}
              />
            </InlineField>
          </ConfigSubSection>
          {config.secureSocksDSProxyEnabled && (
            <SecureSocksProxySettings options={options} onOptionsChange={(next) => updateOptions(() => next)} />
          )}
        </ConfigSection>
      </>
    </OpenFeatureProvider>
  );
});
