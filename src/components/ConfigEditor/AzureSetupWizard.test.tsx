import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import selectEvent from 'react-select-event';

import { AzureSetupWizard } from './AzureSetupWizard';
import { accountCommand } from './azureSetup';

const account = {
  tenantId: '11111111-1111-1111-1111-111111111111',
  subscriptionId: '22222222-2222-2222-2222-222222222222',
  subscriptionName: 'Test subscription',
};
const credentials = {
  tenant: account.tenantId,
  appId: '33333333-3333-3333-3333-333333333333',
  password: 'test-only-placeholder',
};

function setup(getSubscriptions = jest.fn().mockResolvedValue([{ value: account.subscriptionId }])) {
  const onCredentialsChange = jest.fn();
  const result = render(
    <AzureSetupWizard
      environment="cloud-shell"
      onCredentialsChange={onCredentialsChange}
      getSubscriptions={getSubscriptions}
    />
  );
  return { ...result, onCredentialsChange, getSubscriptions };
}

function detectAccount() {
  fireEvent.change(screen.getByLabelText('Azure account output'), { target: { value: JSON.stringify(account) } });
  fireEvent.click(screen.getByRole('button', { name: 'Detect Azure account' }));
}

function createAccess() {
  detectAccount();
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
}

function importCredentials() {
  fireEvent.change(screen.getByLabelText('Created credentials output'), {
    target: { value: JSON.stringify(credentials) },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Import credentials' }));
}

describe('AzureSetupWizard', () => {
  it('provides Cloud Shell, account discovery, copy action, and all three stages', () => {
    setup();
    expect(screen.getByRole('link', { name: 'Open Azure Cloud Shell' })).toHaveAttribute(
      'href',
      'https://shell.azure.com/'
    );
    expect(screen.getByText(accountCommand)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy command' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Setup stages' }).children).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    detectAccount();
    expect(screen.getByText('Azure account detected')).toBeInTheDocument();
    expect(screen.getByText(account.tenantId)).toBeInTheDocument();
    expect(screen.getByText(`${account.subscriptionName} (${account.subscriptionId})`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('blocks malformed input without echoing the input in an error, and invalidates edited metadata', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Azure account output'), { target: { value: 'not-json' } });
    fireEvent.click(screen.getByRole('button', { name: 'Detect Azure account' }));
    expect(screen.getByRole('alert')).not.toHaveTextContent('not-json');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    detectAccount();
    fireEvent.change(screen.getByLabelText('Azure account output'), { target: { value: '{}' } });
    expect(screen.queryByText('Azure account detected')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('imports discovered identifiers and credentials, clears secret output, and verifies only on request', async () => {
    const { onCredentialsChange, getSubscriptions } = setup();
    createAccess();
    expect(screen.getByText(`az account set --subscription '${account.subscriptionId}'`)).toBeInTheDocument();
    expect(screen.getByText(/az ad sp create-for-rbac/)).toHaveTextContent('--role Reader');
    expect(onCredentialsChange).not.toHaveBeenCalled();
    importCredentials();
    expect(onCredentialsChange).toHaveBeenCalledWith(
      {
        authType: 'clientsecret',
        azureCloud: 'AzureCloud',
        tenantId: account.tenantId,
        clientId: credentials.appId,
        clientSecret: credentials.password,
      },
      account.subscriptionId
    );
    expect(screen.queryByLabelText('Created credentials output')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(credentials.password);
    expect(getSubscriptions).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save and verify access' }));
    await screen.findByText('Azure access verified');
    expect(getSubscriptions).toHaveBeenCalledTimes(1);
  });

  it('rejects credentials for another tenant without applying them', () => {
    const { onCredentialsChange } = setup();
    createAccess();
    fireEvent.change(screen.getByLabelText('Created credentials output'), {
      target: { value: JSON.stringify({ ...credentials, tenant: account.subscriptionId }) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Import credentials' }));
    expect(onCredentialsChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Save and verify access' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('alert').every((alert) => !alert.textContent?.includes(credentials.password))).toBe(
      true
    );
  });

  it('discovers and selects resource groups without typing Azure identifiers', async () => {
    setup();
    detectAccount();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await selectEvent.select(screen.getByLabelText('Access scope'), 'One resource group', { container: document.body });
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(screen.getByText(/az group list/)).toHaveTextContent(account.subscriptionId);
    fireEvent.change(screen.getByLabelText('Resource groups output'), { target: { value: '["monitoring", "other"]' } });
    fireEvent.click(screen.getByRole('button', { name: 'Detect resource groups' }));
    await selectEvent.select(screen.getByLabelText('Resource group'), 'other', { container: document.body });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText(/az ad sp create-for-rbac/)).toHaveTextContent(
      `/subscriptions/${account.subscriptionId}/resourceGroups/other`
    );
  });

  it('discards resource group selection when a different account is detected', async () => {
    setup();
    detectAccount();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await selectEvent.select(screen.getByLabelText('Access scope'), 'One resource group', { container: document.body });
    fireEvent.change(screen.getByLabelText('Resource groups output'), { target: { value: '["monitoring"]' } });
    fireEvent.click(screen.getByRole('button', { name: 'Detect resource groups' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.change(screen.getByLabelText('Azure account output'), {
      target: { value: JSON.stringify({ ...account, subscriptionId: credentials.appId }) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Detect Azure account' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByLabelText('Resource groups output')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it.each(['empty', 'wrong-subscription', 'network'])(
    'handles %s verification failures and supports retry',
    async (failure) => {
      const getSubscriptions = jest.fn();
      if (failure === 'network') {
        getSubscriptions.mockRejectedValueOnce(new Error('backend error'));
      } else {
        getSubscriptions.mockResolvedValueOnce(failure === 'empty' ? [] : [{ value: credentials.appId }]);
      }
      getSubscriptions.mockResolvedValueOnce([{ value: account.subscriptionId }]);
      setup(getSubscriptions);
      createAccess();
      importCredentials();
      fireEvent.click(screen.getByRole('button', { name: 'Save and verify access' }));
      await screen.findByText('Could not verify Azure access');
      fireEvent.click(screen.getByRole('button', { name: 'Save and verify access' }));
      await screen.findByText('Azure access verified');
      expect(getSubscriptions).toHaveBeenCalledTimes(2);
    }
  );

  it('prevents duplicate verification requests while a request is pending', async () => {
    let resolve: (value: Array<{ value: string }>) => void = () => {};
    const getSubscriptions = jest.fn(
      () =>
        new Promise<Array<{ value: string }>>((done) => {
          resolve = done;
        })
    );
    setup(getSubscriptions);
    createAccess();
    importCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'Save and verify access' }));
    expect(screen.getByRole('button', { name: 'Save and verify access' })).toBeDisabled();
    resolve([{ value: account.subscriptionId }]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save and verify access' })).toBeEnabled());
  });
});
