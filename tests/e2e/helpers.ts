import { type Page } from '@playwright/test';

import type { AzureMonitorQuery } from '../../src/types/query';

export const PLUGIN_TYPE = 'grafana-azure-monitor-datasource';
export const PROVISIONED_FILE = 'datasources.yml';

// GRAFANA_URL is set only by the Cloud cron workflow (playwright-cloud).
export const isCloudRun = !!process.env.GRAFANA_URL;

export const PLACEHOLDER_TENANT_ID = '00000000-0000-0000-0000-000000000001';
export const PLACEHOLDER_CLIENT_ID = '00000000-0000-0000-0000-000000000002';
export const PLACEHOLDER_SUBSCRIPTION = {
  subscriptionId: '00000000-0000-0000-0000-000000000003',
  displayName: 'E2E subscription',
};

export const placeholderJsonData = {
  azureCredentials: {
    authType: 'clientsecret',
    azureCloud: 'AzureCloud',
    tenantId: PLACEHOLDER_TENANT_ID,
    clientId: PLACEHOLDER_CLIENT_ID,
  },
  subscriptionId: PLACEHOLDER_SUBSCRIPTION.subscriptionId,
};

export const PLACEHOLDER_DATA_SOURCE = {
  type: PLUGIN_TYPE,
  jsonData: placeholderJsonData,
  secureJsonData: { clientSecret: 'placeholder-client-secret' },
};

const FROM_ISO = '2026-10-20T12:00:00.000Z';
const TO_ISO = '2026-10-20T13:00:00.000Z';

/** Builds an Explore URL that loads one query for the data source over a fixed time range. */
export const exploreUrl = (uid: string, query: Omit<AzureMonitorQuery, 'refId'> = {}) => {
  const panes = JSON.stringify({
    explore: {
      datasource: uid,
      queries: [{ refId: 'A', datasource: { type: PLUGIN_TYPE, uid }, ...query }],
      range: { from: FROM_ISO, to: TO_ISO },
    },
  });
  return `/explore?orgId=1&schemaVersion=1&panes=${encodeURIComponent(panes)}`;
};

const SUBSCRIPTIONS_URL = /\/resources\/azuremonitor\/subscriptions\b/;

/** Answers the subscriptions resource call with the placeholder subscription, or with an ARM error. */
export const mockSubscriptions = async (page: Page, status: 200 | 500 = 200) => {
  await page.route(SUBSCRIPTIONS_URL, (route) =>
    route.fulfill(
      status === 200
        ? { json: { value: [PLACEHOLDER_SUBSCRIPTION] } }
        : { status, json: { message: 'mocked subscriptions failure' } }
    )
  );
};

export interface LiveCredentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export const LIVE_CREDENTIALS_SKIP_REASON =
  'Requires DS_INSTANCE_TENANT_ID, DS_INSTANCE_CLIENT_ID and DS_INSTANCE_CLIENT_SECRET';

/** Returns the app registration that the Cloud cron workflow injects, or undefined when any part is unset. */
export const readLiveCredentials = (): LiveCredentials | undefined => {
  const tenantId = process.env.DS_INSTANCE_TENANT_ID;
  const clientId = process.env.DS_INSTANCE_CLIENT_ID;
  const clientSecret = process.env.DS_INSTANCE_CLIENT_SECRET;
  return tenantId && clientId && clientSecret ? { tenantId, clientId, clientSecret } : undefined;
};
