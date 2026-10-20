import {
  type CreateDataSourcePageArgs,
  type DashboardPage,
  type DataSourceConfigPage,
  type E2ESelectorGroups,
  type PanelEditPage,
  expect,
  test,
} from '@grafana/plugin-e2e';
import { type Locator, type Page } from '@playwright/test';

import { AzureQueryType, ResultFormat } from '../../src/dataquery';
import { components } from '../../src/e2e/selectors';

import {
  LIVE_CREDENTIALS_SKIP_REASON,
  PLUGIN_TYPE,
  QUERY_DATA_URL,
  VERSION_CONFLICT_FAIL_REASON,
  exploreUrl,
  fillClientSecretCredentials,
  readLiveCredentials,
} from './helpers';

// A trace records typed form values and API request bodies, so these tests never write one.
test.use({ trace: 'off' });

const credentials = readLiveCredentials();
test.skip(!credentials, LIVE_CREDENTIALS_SKIP_REASON);

interface QueryDataBody {
  results?: Record<string, { frames?: Array<{ data?: { values?: unknown[][] } }> }>;
}

const isQueryDataBody = (value: unknown): value is QueryDataBody =>
  typeof value === 'object' && value !== null && 'results' in value;

// Reads the body inside the predicate, because Chrome can evict the response buffer once the promise resolves.
const waitForFrames = async (page: Page): Promise<QueryDataBody> => {
  const captured: { body?: QueryDataBody } = {};
  await page.waitForResponse(async (response) => {
    if (!QUERY_DATA_URL.test(response.url()) || !response.ok()) {
      return false;
    }
    const body: unknown = await response.json().catch(() => undefined);
    if (!isQueryDataBody(body) || !body.results?.A?.frames?.length) {
      return false;
    }
    captured.body = body;
    return true;
  });
  if (!captured.body) {
    throw new Error('Query response matched without a body');
  }
  return captured.body;
};

test.describe('Config editor', () => {
  test.describe('save & test', () => {
    test.describe('with live credentials', () => {
      test('should pass the health check', async ({ createDataSourceConfigPage, page }) => {
        const configPage = await createDataSourceConfigPage({ type: PLUGIN_TYPE });
        await fillClientSecretCredentials(
          page,
          credentials?.tenantId ?? '',
          credentials?.clientId ?? '',
          credentials?.clientSecret ?? ''
        );

        const response = await configPage.saveAndTest();
        expect(response.ok()).toBe(true);
        await expect(configPage).toHaveAlert('success', {
          hasText: 'Successfully connected to all Azure Monitor endpoints.',
        });
      });
    });
  });
});

test.describe('Query editor with live data', () => {
  test.describe.configure({ mode: 'serial' });

  let uid: string | undefined;

  test.beforeEach(async ({ createDataSource }) => {
    ({ uid } = await createDataSource({
      type: PLUGIN_TYPE,
      jsonData: {
        azureCredentials: {
          authType: 'clientsecret',
          azureCloud: 'AzureCloud',
          tenantId: credentials?.tenantId,
          clientId: credentials?.clientId,
        },
      },
      secureJsonData: { clientSecret: credentials?.clientSecret },
    }));
  });

  test.afterEach(async ({ grafanaAPIClient }) => {
    if (uid) {
      await grafanaAPIClient.deleteDataSourceByUID(uid);
      uid = undefined;
    }
  });

  test('Azure Resource Graph: counts the resources in the first subscription', async ({ page }) => {
    const bodyPromise = waitForFrames(page);
    await page.goto(
      exploreUrl(uid ?? '', {
        queryType: AzureQueryType.AzureResourceGraph,
        azureResourceGraph: { query: 'Resources | summarize count()', resultFormat: ResultFormat.Table },
      })
    );

    const body = await bodyPromise;
    expect(body.results?.A?.frames?.[0]?.data?.values?.[0]?.[0]).toBeGreaterThan(0);
  });
});

const { configEditor, queryEditor, variableEditor } = components;

const DATA_SOURCE_NAME = `Azure Monitor E2E Tests - ${crypto.randomUUID()}`;
const ROOT_SUBSCRIPTION = 'grafanalabs-datasources-dev';
const RESOURCE_GROUP = 'cloud-plugins-e2e-test-azmon';
const STORAGE_ACCOUNT = 'azmonteststorage';
const LOG_ANALYTICS_WORKSPACE = 'az-mon-test-logs';
const APPLICATION_INSIGHTS = 'az-mon-test-ai-a';

interface VariableOptions {
  subscription?: string;
  resourceGroup?: string;
  namespace?: string;
  region?: string;
  resource?: string;
}

const chooseOption = async (input: Locator, value: string) => {
  await input.fill(value);
  await input.press('Enter');
};

const createLiveDataSourceInConfigEditor = async (
  createDataSourceConfigPage: (args: CreateDataSourcePageArgs) => Promise<DataSourceConfigPage>,
  page: Page,
  selectors: E2ESelectorGroups
) => {
  const configPage = await createDataSourceConfigPage({ type: PLUGIN_TYPE, name: DATA_SOURCE_NAME });
  await chooseOption(page.getByTestId(configEditor.azureCloud.input).locator('input'), 'Azure');
  await fillClientSecretCredentials(
    page,
    credentials?.tenantId ?? '',
    credentials?.clientId ?? '',
    credentials?.clientSecret ?? ''
  );
  await page.getByTestId(configEditor.loadSubscriptions.button).click();
  await page.getByTestId(configEditor.defaultSubscription.input).locator('input').fill('datasources');
  await configPage.getByGrafanaSelector(selectors.components.Select.option).filter({ hasText: 'datasources' }).click();

  const saveResponse = page.waitForResponse(
    (response) => response.request().method() === 'PUT' && /\/api\/datasources\/uid\//.test(response.url())
  );
  await page.getByRole('button', { name: 'Save & test' }).click();
  expect((await saveResponse).status()).toBe(200);
  await expect(configPage).toHaveAlert('success');
};

const selectDataSource = async (page: PanelEditPage | DashboardPage, selectors: E2ESelectorGroups) => {
  await page.getByGrafanaSelector(selectors.components.DataSourcePicker.inputV2).fill(DATA_SOURCE_NAME);
  await page
    .getByGrafanaSelector(selectors.components.DataSourcePicker.dataSourceList)
    .getByText(DATA_SOURCE_NAME)
    .click();
};

const pickResource = async (page: Page, name: string) => {
  await page.getByTestId(queryEditor.resourcePicker.select.button).click();
  await expect(page.getByText(ROOT_SUBSCRIPTION)).toBeVisible({ timeout: 30_000 });
  await chooseOption(page.getByTestId(queryEditor.resourcePicker.search.input), name);
  await expect(page.getByText(name)).toBeVisible({ timeout: 30_000 });
  await page.getByText(name).click();
  await page.getByTestId(queryEditor.resourcePicker.apply.button).click();
};

const addAzureMonitorVariable = async (
  page: Page,
  dashboardPage: DashboardPage,
  selectors: E2ESelectorGroups,
  name: string,
  type: AzureQueryType,
  isFirst: boolean,
  options: VariableOptions = {}
) => {
  await dashboardPage.getByGrafanaSelector(selectors.components.NavToolbar.editDashboard.settingsButton).click();
  await dashboardPage.getByGrafanaSelector(selectors.components.Tab.title('Variables')).click();
  if (isFirst) {
    await dashboardPage
      .getByGrafanaSelector(selectors.pages.Dashboard.Settings.Variables.List.addVariableCTAV2)
      .click();
  } else {
    await page.getByTestId(selectors.pages.Dashboard.Settings.Variables.List.newButton).click();
  }

  const nameInput = dashboardPage.getByGrafanaSelector(
    selectors.pages.Dashboard.Settings.Variables.Edit.General.generalNameInputV2
  );
  await nameInput.clear();
  await nameInput.fill(name);
  await selectDataSource(dashboardPage, selectors);
  await chooseOption(
    page.getByTestId(variableEditor.queryType.input).locator('input'),
    type.replace('Azure', '').trim()
  );

  const optionInputs: Array<[string | undefined, string]> = [
    [options.subscription, variableEditor.subscription.input],
    [options.resourceGroup, variableEditor.resourceGroup.input],
    [options.namespace, variableEditor.namespace.input],
    [options.region, variableEditor.region.input],
    [options.resource, variableEditor.resource.input],
  ];
  for (const [value, testId] of optionInputs) {
    if (value) {
      await chooseOption(page.getByTestId(testId).locator('input'), value);
    }
  }

  await dashboardPage
    .getByGrafanaSelector(selectors.pages.Dashboard.Settings.Variables.Edit.General.submitButton)
    .click();
  await dashboardPage.getByGrafanaSelector(selectors.components.NavToolbar.editDashboard.backToDashboardButton).click();
};

const setVariableValue = async (
  dashboardPage: DashboardPage,
  selectors: E2ESelectorGroups,
  name: string,
  value: string
) => {
  const input = dashboardPage
    .getByGrafanaSelector(selectors.pages.Dashboard.SubMenu.submenuItemLabels(name))
    .locator('..')
    .locator('input');
  await input.fill(value);
  await input.press('ArrowDown');
  await input.press('Enter');
};

test.describe('Azure Monitor datasource', () => {
  test('create dashboard, add panel for metrics, log analytics, ARG, and traces queries', async ({
    createDataSourceConfigPage,
    gotoDashboardPage,
    selectors,
    page,
  }) => {
    test.fail(true, VERSION_CONFLICT_FAIL_REASON);
    test.setTimeout(120_000);
    await createLiveDataSourceInConfigEditor(createDataSourceConfigPage, page, selectors);
    const dashboardPage = await gotoDashboardPage({
      timeRange: { from: 'now-6h', to: 'now', zone: 'Coordinated Universal Time' },
    });
    const queryTypeSelect = page.getByTestId(queryEditor.header.select).locator('input');
    const formatSelection = page.getByTestId(queryEditor.logsQueryEditor.formatSelection.input).locator('input');

    const metricsPanel = await dashboardPage.addPanel();
    await selectDataSource(metricsPanel, selectors);
    await pickResource(page, STORAGE_ACCOUNT);
    await expect(page.getByText('microsoft.storage/storageaccounts')).toBeVisible();
    await chooseOption(
      page.getByTestId(queryEditor.metricsQueryEditor.metricName.input).locator('input'),
      'Used capacity'
    );
    await metricsPanel.backToDashboard();

    const logsPanel = await dashboardPage.addPanel();
    await selectDataSource(logsPanel, selectors);
    await chooseOption(queryTypeSelect, 'Logs');
    await pickResource(page, LOG_ANALYTICS_WORKSPACE);
    await logsPanel
      .getByGrafanaSelector(selectors.components.CodeEditor.container)
      .locator('textarea')
      .fill('AzureDiagnostics', { force: true });
    await chooseOption(formatSelection, 'Time series');
    await logsPanel.backToDashboard();

    const resourceGraphPanel = await dashboardPage.addPanel();
    await selectDataSource(resourceGraphPanel, selectors);
    await chooseOption(queryTypeSelect, 'Azure Resource Graph');
    await chooseOption(
      page.getByTestId(queryEditor.argsQueryEditor.subscriptions.input).locator('input'),
      'datasources'
    );
    await resourceGraphPanel
      .getByGrafanaSelector(selectors.components.CodeEditor.container)
      .locator('textarea')
      .fill(`Resources | where resourceGroup == '${RESOURCE_GROUP}' | project name, resourceGroup`);
    await resourceGraphPanel.backToDashboard();

    const tracesPanel = await dashboardPage.addPanel();
    await selectDataSource(tracesPanel, selectors);
    await chooseOption(queryTypeSelect, 'Traces');
    await pickResource(page, APPLICATION_INSIGHTS);
    await chooseOption(formatSelection, 'Trace');
  });

  test('create dashboard with template variables', async ({
    createDataSourceConfigPage,
    gotoDashboardPage,
    page,
    selectors,
  }) => {
    test.fail(true, VERSION_CONFLICT_FAIL_REASON);
    test.setTimeout(120_000);
    await createLiveDataSourceInConfigEditor(createDataSourceConfigPage, page, selectors);
    const dashboardPage = await gotoDashboardPage({ timeRange: { from: 'now-6h', to: 'now' } });

    await addAzureMonitorVariable(
      page,
      dashboardPage,
      selectors,
      'subscription',
      AzureQueryType.SubscriptionsQuery,
      true
    );
    await addAzureMonitorVariable(
      page,
      dashboardPage,
      selectors,
      'resourceGroups',
      AzureQueryType.ResourceGroupsQuery,
      false,
      {
        subscription: '$subscription',
      }
    );
    await addAzureMonitorVariable(page, dashboardPage, selectors, 'namespaces', AzureQueryType.NamespacesQuery, false, {
      subscription: '$subscription',
      resourceGroup: '$resourceGroups',
    });
    await addAzureMonitorVariable(page, dashboardPage, selectors, 'region', AzureQueryType.LocationsQuery, false, {
      subscription: '$subscription',
    });
    await addAzureMonitorVariable(
      page,
      dashboardPage,
      selectors,
      'resource',
      AzureQueryType.ResourceNamesQuery,
      false,
      {
        subscription: '$subscription',
        resourceGroup: '$resourceGroups',
        namespace: '$namespaces',
        region: '$region',
      }
    );

    await dashboardPage
      .getByGrafanaSelector(selectors.pages.Dashboard.SubMenu.submenuItemLabels('subscription'))
      .locator('..')
      .locator('input')
      .click();
    await dashboardPage
      .getByGrafanaSelector(selectors.components.Select.option)
      .filter({ hasText: ROOT_SUBSCRIPTION })
      .click();
    await setVariableValue(dashboardPage, selectors, 'resourceGroups', RESOURCE_GROUP);
    await setVariableValue(dashboardPage, selectors, 'namespaces', 'microsoft.storage/storageaccounts');
    await setVariableValue(dashboardPage, selectors, 'region', 'uk west');
    await setVariableValue(dashboardPage, selectors, 'resource', STORAGE_ACCOUNT);

    const panel = await dashboardPage.addPanel();
    await selectDataSource(panel, selectors);
    await page.getByTestId(queryEditor.resourcePicker.select.button).click();
    await page.getByTestId(queryEditor.resourcePicker.advanced.collapse).click();
    const { advanced } = queryEditor.resourcePicker;
    await page.getByTestId(advanced.subscription.input).locator('input').fill('$subscription');
    await page.getByTestId(advanced.resourceGroup.input).locator('input').fill('$resourceGroups');
    await page.getByTestId(advanced.namespace.input).locator('input').fill('$namespaces');
    await page.getByTestId(advanced.region.input).locator('input').fill('$region');
    await page.getByTestId(advanced.resource.input).locator('input').fill('$resource');
    await page.getByTestId(queryEditor.resourcePicker.apply.button).click();
    await chooseOption(
      page.getByTestId(queryEditor.metricsQueryEditor.metricName.input).locator('input'),
      'Transactions'
    );
  });
});
