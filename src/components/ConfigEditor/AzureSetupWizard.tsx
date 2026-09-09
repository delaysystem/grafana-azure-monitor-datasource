import { useState } from 'react';

import { type AzureCredentials } from '@grafana/azure-sdk';
import { type SelectableValue } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { Alert, Button, ClipboardButton, Field, Select, Stack, TextArea, TextLink } from '@grafana/ui';

import {
  accessScope,
  accountCommand,
  type AzureAccount,
  createAccessCommand,
  parseAccount,
  parseCreatedCredentials,
  parseResourceGroups,
} from './azureSetup';

export type ExecutionEnvironment = 'cloud-shell' | 'local-terminal';

interface Props {
  environment: ExecutionEnvironment;
  onCredentialsChange: (credentials: AzureCredentials, subscriptionId: string) => void;
  getSubscriptions: () => Promise<Array<SelectableValue<string>>>;
  onVerificationChange?: (pending: boolean) => void;
}

function Command({ command }: { command: string }) {
  return (
    <Stack direction="column" gap={1}>
      <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{command}</pre>
      <ClipboardButton type="button" variant="secondary" getText={() => command}>
        <Trans i18nKey="components.azure-setup.copy-command">Copy command</Trans>
      </ClipboardButton>
    </Stack>
  );
}

export function AzureSetupWizard({ environment, onCredentialsChange, getSubscriptions, onVerificationChange }: Props) {
  const [stage, setStage] = useState(1);
  const [accountOutput, setAccountOutput] = useState('');
  const [account, setAccount] = useState<AzureAccount>();
  const [scopeType, setScopeType] = useState<'subscription' | 'resource-group'>('subscription');
  const [groupOutput, setGroupOutput] = useState('');
  const [groups, setGroups] = useState<string[]>([]);
  const [resourceGroup, setResourceGroup] = useState<string>();
  const [credentialOutput, setCredentialOutput] = useState('');
  const [imported, setImported] = useState(false);
  const [verification, setVerification] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');

  function detectAccount() {
    try {
      const detected = parseAccount(accountOutput);
      setAccount(detected);
      setGroups([]);
      setGroupOutput('');
      setResourceGroup(undefined);
      setError('');
    } catch {
      setAccount(undefined);
      setError(
        t(
          'components.azure-setup.invalid-account',
          'Paste the complete JSON output from the account command, including valid tenantId, subscriptionId, and subscriptionName fields.'
        )
      );
    }
  }

  function importGroups() {
    try {
      const detected = parseResourceGroups(groupOutput);
      setGroups(detected);
      setResourceGroup(detected[0]);
      setError(
        detected.length ? '' : t('components.azure-setup.no-groups', 'No resource groups found in this subscription.')
      );
    } catch {
      setGroups([]);
      setResourceGroup(undefined);
      setError(
        t('components.azure-setup.invalid-groups', 'Paste the complete JSON array from the resource groups command.')
      );
    }
  }

  function importCredentials() {
    if (!account) {
      return;
    }
    try {
      const credentials = parseCreatedCredentials(credentialOutput, account);
      onCredentialsChange(credentials, account.subscriptionId);
      setCredentialOutput('');
      setImported(true);
      setError('');
    } catch {
      setError(
        t(
          'components.azure-setup.invalid-credentials',
          'Paste the complete JSON output from the create command. It must contain appId, password, and the detected tenant.'
        )
      );
    }
  }

  async function verify() {
    setVerification('pending');
    onVerificationChange?.(true);
    try {
      const subscriptions = await getSubscriptions();
      setVerification(
        subscriptions.some(
          (subscription) => subscription.value?.toLowerCase() === account?.subscriptionId.toLowerCase()
        )
          ? 'success'
          : 'error'
      );
    } catch {
      setVerification('error');
    } finally {
      onVerificationChange?.(false);
    }
  }

  function goToStage(next: number) {
    setError('');
    setCredentialOutput('');
    setStage(next);
  }

  return (
    <Stack direction="column" gap={2}>
      <ol aria-label={t('components.azure-setup.stages', 'Setup stages')}>
        <li aria-current={stage === 1 ? 'step' : undefined}>
          <Trans i18nKey="components.azure-setup.identify">Identify Azure</Trans>
        </li>
        <li aria-current={stage === 2 ? 'step' : undefined}>
          <Trans i18nKey="components.azure-setup.choose-access">Choose access</Trans>
        </li>
        <li aria-current={stage === 3 ? 'step' : undefined}>
          <Trans i18nKey="components.azure-setup.create-verify">Create Grafana access and verify</Trans>
        </li>
      </ol>
      {stage === 1 && (
        <>
          {environment === 'cloud-shell' ? (
            <>
              <p>
                <Trans i18nKey="components.azure-setup.cloud-shell-help">
                  Azure CLI is already available and authenticated in Azure Cloud Shell. Select Bash.
                </Trans>
              </p>
              <TextLink href="https://shell.azure.com" external>
                <Trans i18nKey="components.azure-setup.open-cloud-shell">Open Azure Cloud Shell</Trans>
              </TextLink>
            </>
          ) : (
            <>
              <p>
                <Trans i18nKey="components.azure-setup.local-help">
                  Use a local Bash-compatible terminal with Azure CLI installed, then sign in to your Azure account.
                </Trans>
              </p>
              <TextLink href="https://learn.microsoft.com/cli/azure/install-azure-cli" external>
                <Trans i18nKey="components.azure-setup.install-cli">Install Azure CLI</Trans>
              </TextLink>
              <Command command="az login" />
            </>
          )}
          <p>
            <Trans i18nKey="components.azure-setup.public-cloud">
              This guided setup uses Azure public cloud. For other Azure clouds, use existing Azure credentials.
            </Trans>
          </p>
          <Command command={accountCommand} />
          <Field
            label={t('components.azure-setup.account-output', 'Azure account output')}
            description={t('components.azure-setup.account-output-help', 'This output is non-secret account metadata.')}
            htmlFor="azure-account-output"
          >
            <TextArea
              id="azure-account-output"
              aria-label={t('components.azure-setup.account-output', 'Azure account output')}
              rows={6}
              value={accountOutput}
              onChange={(event) => {
                setAccountOutput(event.currentTarget.value);
                setAccount(undefined);
                setError('');
              }}
            />
          </Field>
          <Button type="button" onClick={detectAccount} disabled={!accountOutput.trim()}>
            <Trans i18nKey="components.azure-setup.detect-account">Detect Azure account</Trans>
          </Button>
          {account && (
            <Alert severity="success" title={t('components.azure-setup.account-detected', 'Azure account detected')}>
              <dl>
                <dt>
                  <Trans i18nKey="components.azure-setup.tenant">Tenant</Trans>
                </dt>
                <dd>{account.tenantId}</dd>
                <dt>
                  <Trans i18nKey="components.azure-setup.subscription">Subscription</Trans>
                </dt>
                <dd>
                  {account.subscriptionName} ({account.subscriptionId})
                </dd>
              </dl>
            </Alert>
          )}
          <Button type="button" onClick={() => goToStage(2)} disabled={!account}>
            <Trans i18nKey="components.azure-setup.continue">Continue</Trans>
          </Button>
        </>
      )}
      {stage === 2 && account && (
        <>
          <p>
            <Trans i18nKey="components.azure-setup.reader-help">
              Grafana will receive the built-in Reader role. This allows reading monitoring data, not changing Azure
              resources. Choose the subscription or limit access to one resource group.
            </Trans>
          </p>
          <Field label={t('components.azure-setup.access-scope', 'Access scope')} htmlFor="azure-access-scope">
            <Select<'subscription' | 'resource-group'>
              inputId="azure-access-scope"
              value={scopeType}
              options={[
                { value: 'subscription', label: account.subscriptionName },
                { value: 'resource-group', label: t('components.azure-setup.resource-group', 'One resource group') },
              ]}
              onChange={(value) => {
                setScopeType(value.value ?? 'subscription');
                setError('');
              }}
            />
          </Field>
          {scopeType === 'resource-group' && (
            <>
              <Command command={`az group list --subscription '${account.subscriptionId}' --query "[].name" -o json`} />
              <Field
                label={t('components.azure-setup.groups-output', 'Resource groups output')}
                htmlFor="azure-groups-output"
              >
                <TextArea
                  id="azure-groups-output"
                  rows={4}
                  value={groupOutput}
                  onChange={(event) => {
                    setGroupOutput(event.currentTarget.value);
                    setGroups([]);
                    setResourceGroup(undefined);
                  }}
                />
              </Field>
              <Button type="button" onClick={importGroups} disabled={!groupOutput.trim()}>
                <Trans i18nKey="components.azure-setup.detect-groups">Detect resource groups</Trans>
              </Button>
              <Field label={t('components.azure-setup.group', 'Resource group')} htmlFor="azure-resource-group">
                <Select
                  inputId="azure-resource-group"
                  value={resourceGroup}
                  options={groups.map((name) => ({ value: name, label: name }))}
                  onChange={(value) => setResourceGroup(value.value)}
                />
              </Field>
            </>
          )}
          <Stack gap={1}>
            <Button type="button" variant="secondary" onClick={() => goToStage(1)}>
              <Trans i18nKey="components.azure-setup.back">Back</Trans>
            </Button>
            <Button
              type="button"
              onClick={() => goToStage(3)}
              disabled={scopeType === 'resource-group' && !resourceGroup}
            >
              <Trans i18nKey="components.azure-setup.continue">Continue</Trans>
            </Button>
          </Stack>
        </>
      )}
      {stage === 3 && account && (
        <>
          <p>
            <Trans i18nKey="components.azure-setup.selected-scope">Read-only access (Reader) to:</Trans>
          </p>
          <code>{accessScope(account, scopeType === 'resource-group' ? resourceGroup : undefined)}</code>
          {!imported ? (
            <>
              <Alert
                severity="info"
                title={t('components.azure-setup.azure-permissions', 'Azure permissions required')}
              >
                <Trans i18nKey="components.azure-setup.permissions-help">
                  You need permission to create app registrations and assign roles at the selected scope. If Azure
                  denies access, ask your Azure administrator to run these commands. Grafana does not need administrator
                  access.
                </Trans>
              </Alert>
              <p>
                <Trans i18nKey="components.azure-setup.same-terminal">
                  Run each command in the same terminal. The create command creates an application, service principal,
                  client secret, and Reader role assignment. Run it only once and retain its output until import
                  succeeds. The secret expires after one year by default and must be rotated.
                </Trans>
              </p>
              <Command command={`az account set --subscription '${account.subscriptionId}'`} />
              <Command
                command={createAccessCommand(account, scopeType === 'resource-group' ? resourceGroup : undefined)}
              />
              <Alert
                severity="warning"
                title={t('components.azure-setup.secret-output', 'This output contains a secret')}
              >
                <Trans i18nKey="components.azure-setup.secret-help">
                  Paste it only here, not into tickets or chat. Grafana stores the client secret securely when saved.
                  Clear the output from your terminal and clipboard after importing.
                </Trans>
              </Alert>
              <Field
                label={t('components.azure-setup.credentials-output', 'Created credentials output')}
                htmlFor="azure-credentials-output"
              >
                <TextArea
                  id="azure-credentials-output"
                  rows={6}
                  autoComplete="off"
                  spellCheck={false}
                  value={credentialOutput}
                  onChange={(event) => {
                    setCredentialOutput(event.currentTarget.value);
                    setError('');
                  }}
                />
              </Field>
              <p>
                <Trans i18nKey="components.azure-setup.replace-credentials">
                  Importing replaces this data source&apos;s Azure credentials and default subscription.
                </Trans>
              </p>
              <Stack gap={1}>
                <Button type="button" variant="secondary" onClick={() => goToStage(2)}>
                  <Trans i18nKey="components.azure-setup.back">Back</Trans>
                </Button>
                <Button type="button" onClick={importCredentials} disabled={!credentialOutput.trim()}>
                  <Trans i18nKey="components.azure-setup.import-credentials">Import credentials</Trans>
                </Button>
              </Stack>
            </>
          ) : (
            <>
              <p>
                <Trans i18nKey="components.azure-setup.imported">
                  Credentials imported. Save and verify to test Azure authentication and subscription discovery.
                </Trans>
              </p>
              <Button type="button" onClick={verify} disabled={verification === 'pending'}>
                <Trans i18nKey="components.azure-setup.save-verify">Save and verify access</Trans>
              </Button>
              {verification === 'success' && (
                <Alert severity="success" title={t('components.azure-setup.verified', 'Azure access verified')}>
                  <Trans i18nKey="components.azure-setup.verified-help">
                    Grafana authenticated and discovered your subscription. Access to individual metrics and logs
                    depends on the selected scope and Azure resource permissions.
                  </Trans>
                </Alert>
              )}
              {verification === 'error' && (
                <Alert
                  severity="error"
                  title={t('components.azure-setup.verify-failed', 'Could not verify Azure access')}
                >
                  <Trans i18nKey="components.azure-setup.retry-help">
                    Role assignments can take several minutes to propagate. Wait and retry without creating another
                    application. If this continues, check the Reader assignment with your Azure administrator, or use
                    existing Azure credentials to correct the configuration.
                  </Trans>
                </Alert>
              )}
            </>
          )}
        </>
      )}
      {error && <Alert severity="error" title={error} />}
    </Stack>
  );
}
