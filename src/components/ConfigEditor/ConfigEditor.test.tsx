import { fireEvent, render, screen } from '@testing-library/react';

import { getBackendSrv } from '@grafana/runtime';

import { ConfigEditor } from './ConfigEditor';

jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  getBackendSrv: jest.fn(),
}));

describe('AppInsights ConfigEditor', () => {
  const baseOptions = {
    id: 21,
    uid: 'y',
    orgId: 1,
    name: 'Azure Monitor-10-10',
    type: 'grafana-azure-monitor-datasource',
    typeLogoUrl: '',
    typeName: 'Azure',
    access: 'proxy',
    url: '',
    user: '',
    database: '',
    basicAuth: false,
    basicAuthUser: '',
    withCredentials: false,
    isDefault: false,
    jsonData: {},
    secureJsonFields: {},
    version: 1,
    readOnly: false,
  };

  const jsonData = {
    subscriptionId: '44987801-6nn6-49he-9b2d-9106972f9789',
    azureLogAnalyticsSameAs: true,
    cloudName: 'azuremonitor',
  };

  const onOptionsChange = jest.fn();
  const putMock = jest.fn().mockResolvedValue({ datasource: { version: 2 } });

  beforeEach(() => {
    onOptionsChange.mockClear();
    putMock.mockClear();
    (getBackendSrv as jest.Mock).mockReturnValue({ put: putMock });
  });

  it('should not render application insights config for new data sources', () => {
    const options = {
      ...baseOptions,
      jsonData,
    };
    render(<ConfigEditor options={options} onOptionsChange={onOptionsChange} />);

    expect(screen.queryByText('Azure Application Insights')).not.toBeInTheDocument();
  });

  it('should render per-service timeout fields correctly', () => {
    const options = {
      ...baseOptions,
      jsonData,
    };
    render(
      <ConfigEditor
        options={{
          ...options,
          jsonData: { ...options.jsonData, logsTimeout: 180, metricsTimeout: 30, resourceGraphTimeout: 30 },
        }}
        onOptionsChange={onOptionsChange}
      />
    );

    expect(screen.getByLabelText('Logs timeout in seconds')).toBeInTheDocument();
    expect(screen.getByLabelText('Metrics timeout in seconds')).toBeInTheDocument();
    expect(screen.getByLabelText('Resource Graph timeout in seconds')).toBeInTheDocument();
  });

  it('should accept a typed timeout value', () => {
    const options = { ...baseOptions, jsonData: { ...jsonData, logsTimeout: 10 } };
    render(<ConfigEditor options={options} onOptionsChange={onOptionsChange} />);

    fireEvent.change(screen.getByLabelText('Logs timeout in seconds'), { target: { value: '200' } });

    expect(onOptionsChange).toHaveBeenCalledWith(
      expect.objectContaining({ jsonData: expect.objectContaining({ logsTimeout: 200 }) })
    );
  });

  it('should clear the timeout instead of saving NaN when the input is invalid', () => {
    const options = { ...baseOptions, jsonData: { ...jsonData, logsTimeout: 180 } };
    render(<ConfigEditor options={options} onOptionsChange={onOptionsChange} />);

    fireEvent.change(screen.getByLabelText('Logs timeout in seconds'), { target: { value: '-5' } });

    expect(onOptionsChange).toHaveBeenCalledWith(
      expect.objectContaining({ jsonData: expect.objectContaining({ logsTimeout: undefined }) })
    );
  });

  it('should migrate the legacy timeout into all three fields and auto-save, once', () => {
    const options = {
      ...baseOptions,
      jsonData,
    };
    render(
      <ConfigEditor
        options={{ ...options, jsonData: { ...options.jsonData, timeout: 10 } }}
        onOptionsChange={onOptionsChange}
      />
    );

    expect(putMock).toHaveBeenCalledTimes(1);
    const [url, body] = putMock.mock.calls[0];
    expect(url).toBe(`/api/datasources/uid/${options.uid}`);
    expect(body.jsonData.timeout).toBeUndefined();
    expect(body.jsonData.logsTimeout).toBe(10);
    expect(body.jsonData.metricsTimeout).toBe(10);
    expect(body.jsonData.resourceGraphTimeout).toBe(10);
  });

  it('should keep an explicit per-service value and only backfill the others during migration', () => {
    const options = {
      ...baseOptions,
      jsonData,
    };
    render(
      <ConfigEditor
        options={{ ...options, jsonData: { ...options.jsonData, timeout: 10, logsTimeout: 200 } }}
        onOptionsChange={onOptionsChange}
      />
    );

    expect(putMock).toHaveBeenCalledTimes(1);
    const [, body] = putMock.mock.calls[0];
    expect(body.jsonData.timeout).toBeUndefined();
    expect(body.jsonData.logsTimeout).toBe(200);
    expect(body.jsonData.metricsTimeout).toBe(10);
    expect(body.jsonData.resourceGraphTimeout).toBe(10);
  });

  it('should not migrate or save anything when there is no legacy timeout to migrate', () => {
    const options = {
      ...baseOptions,
      jsonData,
    };
    render(<ConfigEditor options={options} onOptionsChange={onOptionsChange} />);

    for (const call of onOptionsChange.mock.calls) {
      expect(call[0].jsonData.logsTimeout).toBeUndefined();
      expect(call[0].jsonData.metricsTimeout).toBeUndefined();
      expect(call[0].jsonData.resourceGraphTimeout).toBeUndefined();
    }
    expect(putMock).not.toHaveBeenCalled();
  });

  it('should not auto-migrate or save a read-only (e.g. provisioned) datasource', () => {
    const options = {
      ...baseOptions,
      readOnly: true,
      jsonData,
    };
    render(
      <ConfigEditor
        options={{ ...options, jsonData: { ...options.jsonData, timeout: 10 } }}
        onOptionsChange={onOptionsChange}
      />
    );

    for (const call of onOptionsChange.mock.calls) {
      expect(call[0].jsonData.logsTimeout).toBeUndefined();
      expect(call[0].jsonData.metricsTimeout).toBeUndefined();
      expect(call[0].jsonData.resourceGraphTimeout).toBeUndefined();
    }
    expect(putMock).not.toHaveBeenCalled();
  });

  it('should render cookies correctly', () => {
    const options = {
      ...baseOptions,
      jsonData,
    };
    render(
      <ConfigEditor
        options={{ ...options, jsonData: { ...options.jsonData, keepCookies: ['cookie1', 'cookie2'] } }}
        onOptionsChange={onOptionsChange}
      />
    );

    expect(screen.getByText('cookie1')).toBeInTheDocument();
    expect(screen.getByText('cookie2')).toBeInTheDocument();
  });
});
