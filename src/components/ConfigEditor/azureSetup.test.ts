import { updateCredentials } from '../../credentials';
import { createMockDatasourceSettings } from '../../mocks/datasourceSettings';

import {
  accessScope,
  createAccessCommand,
  parseAccount,
  parseCreatedCredentials,
  parseResourceGroups,
} from './azureSetup';

const account = {
  tenantId: '11111111-1111-1111-1111-111111111111',
  subscriptionId: '22222222-2222-2222-2222-222222222222',
  subscriptionName: 'Test subscription',
};
const output = {
  tenant: account.tenantId,
  appId: '33333333-3333-3333-3333-333333333333',
  password: 'test-only-placeholder',
};

describe('Azure CLI onboarding', () => {
  it('extracts non-secret account metadata without requiring individual identifiers', () => {
    expect(parseAccount(JSON.stringify({ ...account, ignored: true }))).toEqual(account);
  });

  it.each([
    '',
    'not json',
    'null',
    '[]',
    '{}',
    JSON.stringify({ ...account, tenantId: 123 }),
    JSON.stringify({ ...account, subscriptionId: 'invalid' }),
    JSON.stringify({ ...account, subscriptionName: ' ' }),
    JSON.stringify({ ...account, tenantId: '$(touch /tmp/injected)' }),
    JSON.stringify({ ...account, subscriptionId: "'; echo injected; '" }),
  ])('rejects invalid or unsafe account metadata: %s', (value) => {
    expect(() => parseAccount(value)).toThrow();
  });

  it('discovers resource group names, removes duplicates, and accepts an empty list', () => {
    expect(parseResourceGroups('["monitoring", "生产", "monitoring"]')).toEqual(['monitoring', '生产']);
    expect(parseResourceGroups('[]')).toEqual([]);
  });

  it.each(['null', '{}', '[null]', '[1]', '[""]', '["../other"]', '["$(whoami)"]', '["a\\u0027; echo injected"]'])(
    'rejects malformed or unsafe resource group output: %s',
    (value) => {
      expect(() => parseResourceGroups(value)).toThrow();
    }
  );

  it('uses individual CLI commands and a fixed Reader role at only the chosen scope', () => {
    expect(accessScope(account)).toBe(`/subscriptions/${account.subscriptionId}`);
    expect(createAccessCommand(account, 'monitoring')).toBe(
      `az ad sp create-for-rbac --role Reader --scopes '/subscriptions/${account.subscriptionId}/resourceGroups/monitoring' --query "{tenant:tenant, appId:appId, password:password}" -o json`
    );
  });

  it('imports credentials through secureJsonData without persisting the CLI output or password in jsonData', () => {
    const credentials = parseCreatedCredentials(JSON.stringify(output), account);
    const updated = updateCredentials(createMockDatasourceSettings(), credentials);
    expect(credentials.clientId).toBe(output.appId);
    expect(updated.secureJsonData?.azureClientSecret).toBe(output.password);
    expect(JSON.stringify(updated.jsonData)).not.toContain(output.password);
    expect(JSON.stringify(updated.jsonData)).not.toContain('"password"');
  });

  it.each([
    'null',
    '{}',
    JSON.stringify({ ...output, tenant: account.subscriptionId }),
    JSON.stringify({ ...output, appId: 'invalid' }),
    JSON.stringify({ ...output, password: '' }),
    JSON.stringify({ ...output, password: 123 }),
  ])('rejects incomplete credentials or credentials for a different tenant', (value) => {
    expect(() => parseCreatedCredentials(value, account)).toThrow();
  });
});
