import { expect, test } from '@grafana/plugin-e2e';

import { components } from '../../src/e2e/selectors';
import type { AzureMonitorDataSourceJsonData, AzureMonitorDataSourceSecureJsonData } from '../../src/types/types';

import {
  PLACEHOLDER_CLIENT_ID,
  PLACEHOLDER_SUBSCRIPTION,
  PLACEHOLDER_TENANT_ID,
  PLUGIN_TYPE,
  PROVISIONED_FILE,
  fillClientSecretCredentials,
  isCloudRun,
  mockSubscriptions,
} from './helpers';

const { configEditor } = components;

test.describe('Config editor', () => {
  test.describe('rendering', () => {
    test('smoke: should render config editor', { tag: '@plugins' }, async ({ createDataSourceConfigPage, page }) => {
      await createDataSourceConfigPage({ type: PLUGIN_TYPE });

      await expect(page.getByText(/^Type\s*Azure Monitor$/)).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Authentication', exact: true })).toBeVisible();
    });

    test('should render the app registration fields with required-field errors', async ({
      createDataSourceConfigPage,
      page,
    }) => {
      await createDataSourceConfigPage({ type: PLUGIN_TYPE });

      await expect(page.getByTestId(configEditor.authType.select)).toContainText('App Registration (Client Secret)');
      await expect(page.getByRole('combobox', { name: 'Azure Cloud' })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Tenant ID' })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Client ID' })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Client Secret' })).toBeVisible();
      await expect(page.getByText('Tenant ID is required')).toBeVisible();
      await expect(page.getByText('Client ID is required')).toBeVisible();
      await expect(page.getByText('Client secret is required')).toBeVisible();
      await expect(page.getByRole('combobox', { name: 'Default Subscription' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Load Subscriptions' })).toBeDisabled();
    });

    test('should offer the client secret and client certificate authentication types', async ({
      createDataSourceConfigPage,
      page,
      selectors,
    }) => {
      const configPage = await createDataSourceConfigPage({ type: PLUGIN_TYPE });

      await page.getByTestId(configEditor.authType.select).getByRole('combobox').click();
      await expect(configPage.getByGrafanaSelector(selectors.components.Select.option)).toHaveText([
        'App Registration (Client Secret)',
        'App Registration (Client Certificate)',
      ]);
    });

    test('should render the Features section', async ({ createDataSourceConfigPage, page }) => {
      await createDataSourceConfigPage({ type: PLUGIN_TYPE });

      await expect(page.getByRole('heading', { name: 'Features', exact: true })).toBeVisible();
      await expect(page.getByRole('switch', { name: 'Basic Logs' })).not.toBeChecked();
      await expect(page.getByRole('switch', { name: 'Auxiliary Logs' })).not.toBeChecked();
    });

    test('should render the Additional settings section', async ({ createDataSourceConfigPage, page }) => {
      await createDataSourceConfigPage({ type: PLUGIN_TYPE });

      await page.getByRole('button', { name: 'Expand section Additional settings' }).click();
      await expect(page.getByRole('heading', { name: 'Advanced HTTP settings', exact: true })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Allowed cookies' })).toBeVisible();
      await expect(page.getByRole('spinbutton', { name: 'Logs timeout in seconds' })).toBeVisible();
      await expect(page.getByRole('spinbutton', { name: 'Metrics timeout in seconds' })).toBeVisible();
      await expect(page.getByRole('spinbutton', { name: 'Resource Graph timeout in seconds' })).toBeVisible();
    });
  });

  test.describe('provisioned datasource', () => {
    test.beforeEach(() => {
      test.skip(isCloudRun, 'The shared Cloud instance does not apply the local provisioning.');
    });

    test('should load the provisioned app registration', async ({
      readProvisionedDataSource,
      gotoDataSourceConfigPage,
      page,
    }) => {
      await mockSubscriptions(page);
      const ds = await readProvisionedDataSource<AzureMonitorDataSourceJsonData, AzureMonitorDataSourceSecureJsonData>({
        fileName: PROVISIONED_FILE,
      });
      const credentials = ds.jsonData.azureCredentials;
      if (credentials?.authType !== 'clientsecret') {
        throw new Error(`${PROVISIONED_FILE} must provision client secret credentials`);
      }
      await gotoDataSourceConfigPage(ds.uid);

      await expect(page.getByTestId(configEditor.authType.select)).toContainText('App Registration (Client Secret)');
      await expect(page.getByRole('textbox', { name: 'Tenant ID' })).toHaveValue(credentials.tenantId ?? '');
      await expect(page.getByRole('textbox', { name: 'Client ID' })).toHaveValue(credentials.clientId ?? '');
      await expect(page.getByRole('textbox', { name: 'Client Secret' })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Reset' })).toBeVisible();
    });

    test('should select the provisioned default subscription from the loaded subscriptions', async ({
      readProvisionedDataSource,
      gotoDataSourceConfigPage,
      page,
    }) => {
      await mockSubscriptions(page);
      const ds = await readProvisionedDataSource<AzureMonitorDataSourceJsonData>({ fileName: PROVISIONED_FILE });
      expect(ds.jsonData.subscriptionId).toBe(PLACEHOLDER_SUBSCRIPTION.subscriptionId);
      await gotoDataSourceConfigPage(ds.uid);

      await expect(page.getByTestId(configEditor.defaultSubscription.input)).toContainText(
        PLACEHOLDER_SUBSCRIPTION.displayName
      );
    });

    test('should show an error when subscriptions fail to load', async ({
      readProvisionedDataSource,
      gotoDataSourceConfigPage,
      page,
    }) => {
      await mockSubscriptions(page, 500);
      const ds = await readProvisionedDataSource({ fileName: PROVISIONED_FILE });
      await gotoDataSourceConfigPage(ds.uid);

      await expect(page.getByRole('alert', { name: 'Error requesting subscriptions' })).toBeVisible();
    });
  });

  test.describe('save & test', () => {
    test('should show an error alert when the health check fails', async ({ createDataSourceConfigPage, page }) => {
      const configPage = await createDataSourceConfigPage({ type: PLUGIN_TYPE });
      await fillClientSecretCredentials(
        page,
        PLACEHOLDER_TENANT_ID,
        PLACEHOLDER_CLIENT_ID,
        'placeholder-client-secret'
      );
      await configPage.mockHealthCheckResponse({ status: 'ERROR', message: 'mocked health check failure' }, 400);

      await configPage.saveAndTest();
      await expect(configPage).toHaveAlert('error', { hasText: 'mocked health check failure' });
    });

    test('should show an error alert when Azure rejects the credentials', async ({
      createDataSourceConfigPage,
      page,
    }) => {
      const configPage = await createDataSourceConfigPage({ type: PLUGIN_TYPE });
      await fillClientSecretCredentials(
        page,
        PLACEHOLDER_TENANT_ID,
        PLACEHOLDER_CLIENT_ID,
        'placeholder-client-secret'
      );

      const response = await configPage.saveAndTest();
      expect(response.ok()).toBe(false);
      await expect(configPage).toHaveAlert('error', { hasText: 'One or more health checks failed' });
    });
  });
});
