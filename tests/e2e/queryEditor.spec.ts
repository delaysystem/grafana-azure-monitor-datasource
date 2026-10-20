import { expect, test } from '@grafana/plugin-e2e';
import { type Page } from '@playwright/test';

import { AzureQueryType, LogsEditorMode, ResultFormat } from '../../src/dataquery';
import { components } from '../../src/e2e/selectors';
import type { AzureMonitorQuery } from '../../src/types/query';

import {
  PLACEHOLDER_DATA_SOURCE,
  PLACEHOLDER_SUBSCRIPTION,
  QUERY_DATA_URL,
  exploreUrl,
  mockSubscriptions,
} from './helpers';

const { queryEditor } = components;

const KQL_QUERY = 'AzureActivity | take 10';
const ARG_QUERY = 'Resources | project name, type | limit 5';

const ARG_FRAME_RESPONSE = {
  results: {
    A: {
      status: 200,
      frames: [
        {
          schema: {
            refId: 'A',
            fields: [
              { name: 'name', type: 'string' },
              { name: 'type', type: 'string' },
            ],
          },
          data: {
            values: [
              ['vm-e2e-1', 'storage-e2e-1'],
              ['microsoft.compute/virtualmachines', 'microsoft.storage/storageaccounts'],
            ],
          },
        },
      ],
    },
  },
};

const serviceSelect = (page: Page) => page.getByTestId(queryEditor.header.select).getByRole('combobox');

test.describe('Query editor', () => {
  let uid: string;

  test.beforeEach(async ({ createDataSource }) => {
    ({ uid } = await createDataSource(PLACEHOLDER_DATA_SOURCE));
  });

  test.afterEach(async ({ grafanaAPIClient }) => {
    await grafanaAPIClient.deleteDataSourceByUID(uid);
  });

  test.describe('rendering', () => {
    test('smoke: lists every service', { tag: '@plugins' }, async ({ page, explorePage, selectors }) => {
      await page.goto(exploreUrl(uid));
      await expect(page.getByTestId(queryEditor.metricsQueryEditor.container.input)).toBeVisible();

      await serviceSelect(page).click();
      await expect(explorePage.getByGrafanaSelector(selectors.components.Select.option)).toHaveText([
        'Metrics',
        'Logs',
        'Traces',
        'Azure Resource Graph',
      ]);
    });

    test('switches the editor when the service changes', async ({ page }) => {
      await page.goto(exploreUrl(uid));
      await expect(page.getByTestId(queryEditor.metricsQueryEditor.container.input)).toBeVisible();

      await serviceSelect(page).click();
      await page.getByRole('option', { name: 'Logs', exact: true }).click();
      await expect(page.getByTestId(queryEditor.logsQueryEditor.container.input)).toBeVisible();
      await expect(page.getByTestId(queryEditor.metricsQueryEditor.container.input)).toBeHidden();
    });

    for (const queryType of [AzureQueryType.AzureMonitor, AzureQueryType.LogAnalytics, AzureQueryType.AzureTraces]) {
      test(`renders the resource picker for ${queryType}`, async ({ page }) => {
        await page.goto(exploreUrl(uid, { queryType }));

        await expect(
          page.getByTestId(queryEditor.resourcePicker.select.button).getByRole('button', { name: 'Select a resource' })
        ).toBeVisible();
      });
    }
  });

  test.describe('Metrics', () => {
    test('shows the metric fields', async ({ page }) => {
      await page.goto(exploreUrl(uid, { queryType: AzureQueryType.AzureMonitor }));
      const editor = page.getByTestId(queryEditor.metricsQueryEditor.container.input);

      for (const label of ['Metric namespace', 'Metric', 'Aggregation', 'Time grain', 'Top', 'Legend format']) {
        await expect(editor.getByLabel(label, { exact: true })).toBeVisible();
      }
      await expect(editor.getByText('Dimensions', { exact: true })).toBeVisible();
    });
  });

  test.describe('Logs', () => {
    test('shows the KQL query from the URL', async ({ page }) => {
      await page.goto(
        exploreUrl(uid, {
          queryType: AzureQueryType.LogAnalytics,
          azureLogAnalytics: {
            query: KQL_QUERY,
            mode: LogsEditorMode.Raw,
            resultFormat: ResultFormat.Table,
            dashboardTime: true,
          },
        })
      );
      const editor = page.getByTestId(queryEditor.logsQueryEditor.container.input);

      await expect(editor.getByRole('textbox', { name: /editor content/i })).toHaveValue(KQL_QUERY);
      await expect(editor.getByRole('radio', { name: 'Dashboard' })).toBeChecked();
      await expect(page.getByTestId(queryEditor.logsQueryEditor.formatSelection.input)).toContainText('Table');
      await expect(page.getByRole('button', { name: 'Azure logs kick start your query button' })).toBeVisible();
    });
  });

  test.describe('Traces', () => {
    test('shows the event types, operation ID, filters and format', async ({ page }) => {
      await page.goto(exploreUrl(uid, { queryType: AzureQueryType.AzureTraces }));
      const editor = page.getByTestId(queryEditor.tracesQueryEditor.container.input);

      for (const eventType of ['Dependencies', 'Exceptions', 'Requests', 'Traces']) {
        await expect(editor.getByText(eventType, { exact: true })).toBeVisible();
      }
      await expect(editor.getByText('Operation ID', { exact: true })).toBeVisible();
      await expect(editor.getByText('Filters', { exact: true })).toBeVisible();
      await expect(page.getByTestId(queryEditor.logsQueryEditor.formatSelection.input)).toContainText('Table');
    });
  });

  test.describe('Azure Resource Graph', () => {
    const argQuery = (subscriptions?: string[]): Omit<AzureMonitorQuery, 'refId'> => ({
      queryType: AzureQueryType.AzureResourceGraph,
      subscriptions,
      azureResourceGraph: { query: ARG_QUERY, resultFormat: ResultFormat.Table },
    });

    test.beforeEach(async ({ page }) => {
      await mockSubscriptions(page);
    });

    test('selects the first subscription that Azure returns', async ({ page }) => {
      await page.goto(exploreUrl(uid, argQuery()));

      await expect(page.getByTestId(queryEditor.argsQueryEditor.subscriptions.input)).toContainText(
        PLACEHOLDER_SUBSCRIPTION.displayName
      );
      await expect(page.getByRole('textbox', { name: /editor content/i })).toHaveValue(ARG_QUERY);
    });

    test('sends the query and renders the returned frame', async ({ page }) => {
      await page.route(QUERY_DATA_URL, (route) => route.fulfill({ json: ARG_FRAME_RESPONSE }));
      const requestPromise = page.waitForRequest((request) => QUERY_DATA_URL.test(request.url()));

      await page.goto(exploreUrl(uid, argQuery([PLACEHOLDER_SUBSCRIPTION.subscriptionId])));
      const request = await requestPromise;

      expect(request.postData()).toContain(ARG_QUERY);
      expect(request.postData()).toContain(PLACEHOLDER_SUBSCRIPTION.subscriptionId);
      await expect(page.getByText('vm-e2e-1')).toBeVisible();
    });

    test('shows the error that the backend returns', async ({ page }) => {
      await page.route(QUERY_DATA_URL, (route) =>
        route.fulfill({
          status: 400,
          json: { results: { A: { status: 500, error: 'mocked resource graph failure', frames: [] } } },
        })
      );

      await page.goto(exploreUrl(uid, argQuery([PLACEHOLDER_SUBSCRIPTION.subscriptionId])));

      await expect(page.getByText('mocked resource graph failure')).toBeVisible();
    });
  });
});
