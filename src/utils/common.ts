import { map } from 'lodash';
import { lastValueFrom } from 'rxjs';

import { AppEvents, type ScopedVars, type SelectableValue, type VariableWithMultiSupport } from '@grafana/data';
import { t } from '@grafana/i18n';
import {
  config,
  getAppEvents,
  getBackendSrv,
  logWarning,
  type TemplateSrv,
  type VariableInterpolation,
} from '@grafana/runtime';

import { type AzureAPIResponse, type AzureMonitorOption, type VariableOptionGroup } from '../types/types';

export const hasOption = (options: AzureMonitorOption[], value: string): boolean =>
  options.some((v) => (v.options ? hasOption(v.options, value) : v.value === value));

export const findOptions = (options: AzureMonitorOption[], values: string[] = []) => {
  if (values.length === 0) {
    return [];
  }
  const set = values.reduce((accum, item) => {
    accum.add(item);
    return accum;
  }, new Set());
  return options.filter((option) => set.has(option.value));
};

export const toOption = (v: { text: string; value: string }) => ({ value: v.value, label: v.text });

export const addValueToOptions = (
  values: Array<AzureMonitorOption | SelectableValue>,
  variableOptionGroup: VariableOptionGroup,
  value?: string
) => {
  const options = [...values, variableOptionGroup];

  const optionValues = values.map((m) => m.value.toLowerCase()).concat(variableOptionGroup.options.map((p) => p.value));
  if (value && !optionValues.includes(value.toLowerCase())) {
    options.push({ label: value, value });
  }

  return options;
};

// Route definitions shared with the backend.
// Check: /pkg/tsdb/azuremonitor/azuremonitor-resource-handler.go <registerRoutes>
export const routeNames = {
  azureMonitor: 'azuremonitor',
  logAnalytics: 'loganalytics',
  appInsights: 'appinsights',
  resourceGraph: 'resourcegraph',
};

// ARM listings now flow through the datasource resource passthrough (azuremonitor/ prefix +
// native api-version). The dedicated /resources/subscriptions and /resources/workspaces routes
// were removed from the backend.
export const paginatedRoutes = {
  subscriptions: `${routeNames.azureMonitor}/subscriptions?api-version=2019-03-01`,
  workspaces: (subscriptionId: string) =>
    `${routeNames.azureMonitor}/subscriptions/${subscriptionId}/providers/Microsoft.OperationalInsights/workspaces?api-version=2017-04-26-preview`,
} as const;

export interface ArmResourcePage<T> {
  value: T[];
  nextToken?: string;
  nextLink?: string;
  truncated: boolean;
}

// Server-side ARM pagination on the passthrough is gated by this feature flag. The installed
// @grafana/data does not type the flag yet, so read it through a cast (no ts-ignore).
export function isServerSidePaginationEnabled(): boolean {
  return (config.featureToggles as Record<string, boolean | undefined>).azureMonitorServerSidePagination === true;
}

// Flag ON: the backend advertises the continuation cursor via a `Link: <?nextToken=..>; rel="next"` header.
export function parseNextLinkToken(linkHeader: string): string | undefined {
  const match = /<\?([^>]*)>;\s*rel="next"/.exec(linkHeader);
  if (!match) {
    return undefined;
  }
  return new URLSearchParams(match[1]).get('nextToken') ?? undefined;
}

// Flag OFF: the raw ARM body carries an absolute `nextLink`; the $skiptoken is the continuation cursor.
export function skipTokenFromNextLink(nextLink?: string): string | undefined {
  if (!nextLink) {
    return undefined;
  }
  const queryIndex = nextLink.indexOf('?');
  const query = queryIndex >= 0 ? nextLink.slice(queryIndex + 1) : nextLink;
  return new URLSearchParams(query).get('$skiptoken') ?? undefined;
}

// Flag OFF: rewrite an absolute ARM nextLink to a passthrough-relative path before re-fetching.
export function nextLinkToPassthroughPath(nextLink: string): string {
  const url = new URL(nextLink);
  return `${routeNames.azureMonitor}${url.pathname}${url.search}`;
}

export async function fetchArmResourcePage<T>(
  datasourceUid: string,
  path: string,
  params: Record<string, string> = {}
): Promise<ArmResourcePage<T>> {
  const response = await lastValueFrom(
    getBackendSrv().fetch<AzureAPIResponse<T>>({
      url: `/api/datasources/uid/${datasourceUid}/resources/${path}`,
      params,
      method: 'GET',
    })
  );
  const value = response.data?.value ?? [];
  const linkHeader = response.headers.get('Link');
  const nextToken = linkHeader ? parseNextLinkToken(linkHeader) : undefined;
  const nextLink = response.data?.nextLink;
  const truncated = response.headers.get('X-Results-Truncated') === 'true';
  return { value, nextToken, nextLink, truncated };
}

// Full listing. Flag ON: ask the backend to page server-side (listAll=true) in one request and
// surface truncation. Flag OFF: follow the raw ARM nextLink chain from the client.
export async function fetchAllArmResources<T>(
  datasourceUid: string,
  path: string,
  params: Record<string, string> = {}
): Promise<T[]> {
  if (isServerSidePaginationEnabled()) {
    const { value, truncated } = await fetchArmResourcePage<T>(datasourceUid, path, { ...params, listAll: 'true' });
    if (truncated) {
      warnResultsTruncated();
    }
    return value;
  }

  const results: T[] = [];
  let nextPath: string | undefined = path;
  let nextParams: Record<string, string> | undefined = params;
  while (nextPath) {
    const { value, nextLink } = await fetchArmResourcePage<T>(datasourceUid, nextPath, nextParams);
    results.push(...value);
    nextPath = nextLink ? nextLinkToPassthroughPath(nextLink) : undefined;
    // The rewritten nextLink already carries api-version + $skiptoken; do not resend the initial params.
    nextParams = undefined;
  }
  return results;
}

// Incremental (one page at a time). Flag ON: listAll=false + the Link-header nextToken.
// Flag OFF: append the body nextLink's $skiptoken to the passthrough path (no listAll/nextToken params).
export async function fetchArmResourceIncrementalPage<T>(
  datasourceUid: string,
  basePath: string,
  nextToken?: string
): Promise<{ value: T[]; nextToken?: string }> {
  if (isServerSidePaginationEnabled()) {
    const params: Record<string, string> = { listAll: 'false' };
    if (nextToken) {
      params.nextToken = nextToken;
    }
    const { value, nextToken: next } = await fetchArmResourcePage<T>(datasourceUid, basePath, params);
    return { value, nextToken: next };
  }

  const path = nextToken
    ? `${basePath}${basePath.includes('?') ? '&' : '?'}$skiptoken=${encodeURIComponent(nextToken)}`
    : basePath;
  const { value, nextLink } = await fetchArmResourcePage<T>(datasourceUid, path);
  return { value, nextToken: skipTokenFromNextLink(nextLink) };
}

export function warnResultsTruncated(): void {
  logWarning('[azuremonitor] ARM listing truncated by the backend; some results may be omitted.');
  getAppEvents().publish({
    type: AppEvents.alertWarning.name,
    payload: [
      t('components.pagination.results-truncated-title', 'Azure Monitor'),
      t(
        'components.pagination.results-truncated-message',
        'Some results may be omitted because there were too many to load.'
      ),
    ],
  });
}

export function interpolateVariable(
  value: string | number | Array<string | number>,
  variable: VariableWithMultiSupport
) {
  if (typeof value === 'string') {
    // When enabling multiple responses, quote the value to mimic the array result below
    // even if only one response is selected. This does not apply if only the "include all"
    // option is enabled but with a custom value.
    if (variable.multi || (variable.includeAll && !variable.allValue)) {
      return "'" + value + "'";
    } else {
      return value;
    }
  }

  if (typeof value === 'number') {
    return value;
  }

  const quotedValues = map(value, (val) => {
    if (typeof value === 'number') {
      return value;
    }

    return "'" + val + "'";
  });
  return quotedValues.join(',');
}

export function replaceTemplateVariables<T extends { [K in keyof T]: string }>(
  templateSrv: TemplateSrv,
  query: T,
  scopedVars?: ScopedVars
) {
  const workingQueries: Array<{ [K in keyof T]: string }> = [{ ...query }];
  const keys = Object.keys(query) as Array<keyof T>;
  keys.forEach((key) => {
    const rawValue = workingQueries[0][key];
    let interpolated: VariableInterpolation[] = [];
    const replaced = templateSrv.replace(rawValue, scopedVars, 'raw', interpolated);
    if (interpolated.length > 0) {
      for (const variable of interpolated) {
        if (variable.found === false) {
          continue;
        }
        if (variable.value.includes(',')) {
          const multiple = variable.value.split(',');
          const currentQueries = [...workingQueries];
          multiple.forEach((value, i) => {
            currentQueries.forEach((q) => {
              if (i === 0) {
                q[key] = rawValue.replace(variable.match, value);
              } else {
                workingQueries.push({ ...q, [key]: rawValue.replace(variable.match, value) });
              }
            });
          });
        } else {
          workingQueries.forEach((q) => {
            q[key] = replaced;
          });
        }
      }
    } else {
      workingQueries.forEach((q) => {
        q[key] = replaced;
      });
    }
  });

  return workingQueries;
}
