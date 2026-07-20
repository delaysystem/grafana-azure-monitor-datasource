import { of } from 'rxjs';

import { AppEvents } from '@grafana/data';
import { config, logWarning } from '@grafana/runtime';

import { initialCustomVariableModelState } from '../mocks/variables';

import {
  fetchAllArmResources,
  fetchArmResourceIncrementalPage,
  fetchArmResourcePage,
  hasOption,
  interpolateVariable,
  isServerSidePaginationEnabled,
  nextLinkToPassthroughPath,
  parseNextLinkToken,
  skipTokenFromNextLink,
  warnResultsTruncated,
} from './common';

const publish = jest.fn();
const fetchMock = jest.fn();

jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  logWarning: jest.fn(),
  getAppEvents: jest.fn(() => ({ publish })),
  getBackendSrv: jest.fn(() => ({ fetch: fetchMock })),
}));

const featureToggles = config.featureToggles as Record<string, boolean | undefined>;

// Flag ON: normalized { value } body plus Link / X-Results-Truncated headers.
function mockFetchResponse<T>(value: T[], headers: Record<string, string> = {}) {
  return of({
    data: { value },
    headers: new Headers(headers),
  });
}

// Flag OFF: raw ARM body ({ value, nextLink }) with no Link header.
function mockRawFetchResponse<T>(value: T[], nextLink?: string) {
  return of({
    data: { value, nextLink },
    headers: new Headers({}),
  });
}

const SUBSCRIPTIONS_PATH = 'azuremonitor/subscriptions?api-version=2019-03-01';
const SUBSCRIPTIONS_URL = '/api/datasources/uid/abc/resources/azuremonitor/subscriptions?api-version=2019-03-01';

describe('AzureMonitor: hasOption', () => {
  it('can find an option in flat array', () => {
    const options = [
      { value: 'a', label: 'a' },
      { value: 'b', label: 'b' },
      { value: 'c', label: 'c' },
    ];

    expect(hasOption(options, 'b')).toBeTruthy();
  });

  it('can not find an option in flat array', () => {
    const options = [
      { value: 'a', label: 'a' },
      { value: 'b', label: 'b' },
      { value: 'c', label: 'c' },
    ];

    expect(hasOption(options, 'not-there')).not.toBeTruthy();
  });

  it('can find an option in a nested group', () => {
    const options = [
      { value: 'a', label: 'a' },
      { value: 'b', label: 'b' },
      {
        label: 'c',
        value: 'c',
        options: [
          { value: 'c-a', label: 'c-a' },
          { value: 'c-b', label: 'c-b' },
          { value: 'c-c', label: 'c-c' },
        ],
      },
      { value: 'd', label: 'd' },
    ];

    expect(hasOption(options, 'c-b')).toBeTruthy();
  });
});

describe('AzureMonitor: parseNextLinkToken', () => {
  it('extracts the nextToken from a Link: rel="next" header', () => {
    expect(parseNextLinkToken('<?nextToken=page2>; rel="next"')).toBe('page2');
  });

  it('extracts the nextToken alongside other params', () => {
    expect(parseNextLinkToken('<?nextToken=page2&subscriptionId=sub-1>; rel="next"')).toBe('page2');
  });

  it('returns undefined when the header does not match', () => {
    expect(parseNextLinkToken('garbage')).toBeUndefined();
  });

  it('returns undefined when there is no nextToken param', () => {
    expect(parseNextLinkToken('<?subscriptionId=sub-1>; rel="next"')).toBeUndefined();
  });
});

describe('AzureMonitor: skipTokenFromNextLink', () => {
  it('extracts the $skiptoken from an absolute ARM nextLink', () => {
    expect(
      skipTokenFromNextLink('https://management.azure.com/subscriptions?api-version=2019-03-01&$skiptoken=abc%3D')
    ).toBe('abc=');
  });

  it('returns undefined when there is no nextLink or no $skiptoken', () => {
    expect(skipTokenFromNextLink(undefined)).toBeUndefined();
    expect(skipTokenFromNextLink('https://management.azure.com/subscriptions?api-version=2019-03-01')).toBeUndefined();
  });
});

describe('AzureMonitor: nextLinkToPassthroughPath', () => {
  it('rewrites an absolute ARM nextLink to a passthrough-relative path', () => {
    expect(
      nextLinkToPassthroughPath(
        'https://management.azure.com/subscriptions?api-version=2019-03-01&$skiptoken=tok2'
      )
    ).toBe('azuremonitor/subscriptions?api-version=2019-03-01&$skiptoken=tok2');
  });
});

describe('AzureMonitor: isServerSidePaginationEnabled', () => {
  afterEach(() => {
    delete featureToggles['azureMonitorServerSidePagination'];
  });

  it('is true only when the feature flag is exactly true', () => {
    expect(isServerSidePaginationEnabled()).toBe(false);
    featureToggles['azureMonitorServerSidePagination'] = true;
    expect(isServerSidePaginationEnabled()).toBe(true);
  });
});

describe('AzureMonitor: fetchArmResourcePage', () => {
  beforeEach(() => {
    fetchMock.mockClear();
  });

  it('requests the passthrough resource endpoint with the given params', async () => {
    fetchMock.mockReturnValue(mockFetchResponse([{ id: 1 }, { id: 2 }]));

    const page = await fetchArmResourcePage<{ id: number }>('abc', SUBSCRIPTIONS_PATH, { listAll: 'true' });

    expect(fetchMock).toHaveBeenCalledWith({
      url: SUBSCRIPTIONS_URL,
      params: { listAll: 'true' },
      method: 'GET',
    });
    expect(page.value).toEqual([{ id: 1 }, { id: 2 }]);
    expect(page.nextToken).toBeUndefined();
    expect(page.truncated).toBe(false);
  });

  it('surfaces the continuation token from the Link header', async () => {
    fetchMock.mockReturnValue(mockFetchResponse([{ id: 1 }], { Link: '<?nextToken=page2>; rel="next"' }));

    const page = await fetchArmResourcePage<{ id: number }>('abc', SUBSCRIPTIONS_PATH, { listAll: 'false' });

    expect(page.value).toEqual([{ id: 1 }]);
    expect(page.nextToken).toBe('page2');
  });

  it('surfaces the raw ARM body nextLink', async () => {
    fetchMock.mockReturnValue(
      mockRawFetchResponse([{ id: 1 }], 'https://management.azure.com/subscriptions?api-version=2019-03-01&$skiptoken=t')
    );

    const page = await fetchArmResourcePage<{ id: number }>('abc', SUBSCRIPTIONS_PATH);

    expect(page.nextLink).toBe('https://management.azure.com/subscriptions?api-version=2019-03-01&$skiptoken=t');
    expect(page.nextToken).toBeUndefined();
  });

  it('flags truncation from the X-Results-Truncated header', async () => {
    fetchMock.mockReturnValue(mockFetchResponse([{ id: 1 }], { 'X-Results-Truncated': 'true' }));

    const page = await fetchArmResourcePage<{ id: number }>('abc', SUBSCRIPTIONS_PATH, { listAll: 'true' });

    expect(page.truncated).toBe(true);
  });
});

describe('AzureMonitor: fetchAllArmResources', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    publish.mockClear();
  });

  afterEach(() => {
    delete featureToggles['azureMonitorServerSidePagination'];
  });

  describe('flag ON (server-side pagination)', () => {
    beforeEach(() => {
      featureToggles['azureMonitorServerSidePagination'] = true;
    });

    it('requests eager listing (listAll=true) in a single request and returns the value array', async () => {
      fetchMock.mockReturnValue(mockFetchResponse([{ id: 1 }, { id: 2 }]));

      const value = await fetchAllArmResources<{ id: number }>('abc', SUBSCRIPTIONS_PATH);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith({
        url: SUBSCRIPTIONS_URL,
        params: { listAll: 'true' },
        method: 'GET',
      });
      expect(value).toEqual([{ id: 1 }, { id: 2 }]);
      expect(publish).not.toHaveBeenCalled();
    });

    it('warns when the backend truncated the listing', async () => {
      fetchMock.mockReturnValue(mockFetchResponse([{ id: 1 }], { 'X-Results-Truncated': 'true' }));

      await fetchAllArmResources<{ id: number }>('abc', SUBSCRIPTIONS_PATH);

      expect(publish).toHaveBeenCalledWith(expect.objectContaining({ type: AppEvents.alertWarning.name }));
    });
  });

  describe('flag OFF (raw ARM nextLink following)', () => {
    it('follows the body nextLink chain, rewriting each to a passthrough path, and does not send listAll', async () => {
      fetchMock
        .mockReturnValueOnce(
          mockRawFetchResponse(
            [{ id: 1 }],
            'https://management.azure.com/subscriptions?api-version=2019-03-01&$skiptoken=tok2'
          )
        )
        .mockReturnValueOnce(mockRawFetchResponse([{ id: 2 }]));

      const value = await fetchAllArmResources<{ id: number }>('abc', SUBSCRIPTIONS_PATH);

      expect(value).toEqual([{ id: 1 }, { id: 2 }]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][0]).toEqual({ url: SUBSCRIPTIONS_URL, params: {}, method: 'GET' });
      expect(fetchMock.mock.calls[1][0].url).toBe(`${SUBSCRIPTIONS_URL}&$skiptoken=tok2`);
      expect(fetchMock.mock.calls[1][0].params).toEqual({});
    });
  });
});

describe('AzureMonitor: fetchArmResourceIncrementalPage', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  afterEach(() => {
    delete featureToggles['azureMonitorServerSidePagination'];
  });

  it('flag ON: sends listAll=false + nextToken and returns the Link-header cursor', async () => {
    featureToggles['azureMonitorServerSidePagination'] = true;
    fetchMock.mockReturnValue(mockFetchResponse([{ id: 2 }], { Link: '<?nextToken=page3>; rel="next"' }));

    const page = await fetchArmResourceIncrementalPage<{ id: number }>('abc', SUBSCRIPTIONS_PATH, 'page2');

    expect(page.value).toEqual([{ id: 2 }]);
    expect(page.nextToken).toBe('page3');
    expect(fetchMock).toHaveBeenCalledWith({
      url: SUBSCRIPTIONS_URL,
      params: { listAll: 'false', nextToken: 'page2' },
      method: 'GET',
    });
  });

  it('flag OFF: appends the $skiptoken to the path and derives the next cursor from the body nextLink', async () => {
    fetchMock.mockReturnValue(
      mockRawFetchResponse(
        [{ id: 1 }],
        'https://management.azure.com/subscriptions?api-version=2019-03-01&$skiptoken=fromBody'
      )
    );

    const page = await fetchArmResourceIncrementalPage<{ id: number }>('abc', SUBSCRIPTIONS_PATH, 'prevTok');

    expect(page.value).toEqual([{ id: 1 }]);
    expect(page.nextToken).toBe('fromBody');
    expect(fetchMock.mock.calls[0][0].url).toBe(`${SUBSCRIPTIONS_URL}&$skiptoken=prevTok`);
    expect(fetchMock.mock.calls[0][0].params).toEqual({});
  });
});

describe('AzureMonitor: warnResultsTruncated', () => {
  beforeEach(() => {
    jest.mocked(logWarning).mockClear();
    publish.mockClear();
  });

  it('logs and publishes an alert-warning app event', () => {
    warnResultsTruncated();

    expect(logWarning).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ type: AppEvents.alertWarning.name }));
  });
});

describe('When interpolating variables', () => {
  describe('and value is a string', () => {
    it('should return an unquoted value', () => {
      expect(interpolateVariable('abc', initialCustomVariableModelState)).toEqual('abc');
    });
  });

  describe('and value is a number', () => {
    it('should return an unquoted value', () => {
      expect(interpolateVariable(1000, initialCustomVariableModelState)).toEqual(1000);
    });
  });

  describe('and value is an array of strings', () => {
    it('should return comma separated quoted values', () => {
      expect(interpolateVariable(['a', 'b', 'c'], initialCustomVariableModelState)).toEqual("'a','b','c'");
    });
  });

  describe('and variable allows multi-value and value is a string', () => {
    it('should return a quoted value', () => {
      const variable = { ...initialCustomVariableModelState, multi: true };
      expect(interpolateVariable('abc', variable)).toEqual("'abc'");
    });
  });

  describe('and variable contains single quote', () => {
    it('should return a quoted value', () => {
      const variable = { ...initialCustomVariableModelState, multi: true };
      expect(interpolateVariable("a'bc", variable)).toEqual("'a'bc'");
    });
  });

  describe('and variable allows all and value is a string', () => {
    it('should return a quoted value', () => {
      const variable = { ...initialCustomVariableModelState, includeAll: true };
      expect(interpolateVariable('abc', variable)).toEqual("'abc'");
    });

    it('should not return a quoted value if the all value is modified', () => {
      const variable = { ...initialCustomVariableModelState, includeAll: true, allValue: 'All' };
      expect(interpolateVariable('abc', variable)).toEqual('abc');
    });

    it('should return a quoted value if multi is selected even if the allValue is set', () => {
      const variable = { ...initialCustomVariableModelState, includeAll: true, multi: true, allValue: 'All' };
      expect(interpolateVariable('abc', variable)).toEqual("'abc'");
    });
  });
});
