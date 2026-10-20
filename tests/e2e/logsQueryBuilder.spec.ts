import { expect, test } from '@grafana/plugin-e2e';

import { AzureQueryType, LogsEditorMode, ResultFormat } from '../../src/dataquery';
import { components } from '../../src/e2e/selectors';

import { PLACEHOLDER_DATA_SOURCE, exploreUrl } from './helpers';

const { queryEditor } = components;

// featureToggles is worker-scoped, so Playwright accepts it only at the top level of a spec file.
test.use({ featureToggles: { azureMonitorLogsBuilderEditor: true } });

test.describe('Logs query builder', () => {
  let uid: string;

  test.beforeEach(async ({ createDataSource }) => {
    ({ uid } = await createDataSource(PLACEHOLDER_DATA_SOURCE));
  });

  test.afterEach(async ({ grafanaAPIClient }) => {
    await grafanaAPIClient.deleteDataSourceByUID(uid);
  });

  test('asks before it discards a KQL query to switch to Builder', async ({ page }) => {
    await page.goto(
      exploreUrl(uid, {
        queryType: AzureQueryType.LogAnalytics,
        azureLogAnalytics: {
          query: 'AzureActivity | take 10',
          mode: LogsEditorMode.Raw,
          resultFormat: ResultFormat.Table,
        },
      })
    );
    await expect(page.getByRole('radio', { name: 'KQL' })).toBeChecked();

    await page.getByRole('radio', { name: 'Builder' }).click();
    await expect(page.getByRole('dialog', { name: 'Switch editor mode?' })).toBeVisible();
    await page.getByRole('button', { name: 'Switch to Builder' }).click();

    await expect(page.getByRole('radio', { name: 'Builder' })).toBeChecked();
    await expect(page.getByTestId(queryEditor.logsQueryBuilder.container.input)).toBeVisible();
  });
});
