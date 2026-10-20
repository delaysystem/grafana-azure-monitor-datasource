import { expect, test } from '@grafana/plugin-e2e';
import { type Page } from '@playwright/test';

import { AzureQueryType, ResultFormat } from '../../src/dataquery';

import {
  LIVE_CREDENTIALS_SKIP_REASON,
  PLUGIN_TYPE,
  QUERY_DATA_URL,
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
