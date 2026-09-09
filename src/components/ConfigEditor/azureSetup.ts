import { AzureCloud, type AzureClientSecretCredentials } from '@grafana/azure-sdk';

export interface AzureAccount {
  tenantId: string;
  subscriptionId: string;
  subscriptionName: string;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const accountCommand =
  'az account show --query "{tenantId:tenantId, subscriptionId:id, subscriptionName:name}" -o json';

export function parseAccount(output: string): AzureAccount {
  const value = JSON.parse(output);
  if (
    !value ||
    typeof value.tenantId !== 'string' ||
    !uuid.test(value.tenantId) ||
    typeof value.subscriptionId !== 'string' ||
    !uuid.test(value.subscriptionId) ||
    typeof value.subscriptionName !== 'string' ||
    !value.subscriptionName.trim()
  ) {
    throw new Error('Invalid account metadata');
  }
  return {
    tenantId: value.tenantId,
    subscriptionId: value.subscriptionId,
    subscriptionName: value.subscriptionName,
  };
}

export function parseResourceGroups(output: string): string[] {
  const value = JSON.parse(output);
  if (
    !Array.isArray(value) ||
    !value.every((name) => typeof name === 'string' && /^[\p{L}\p{N}_.()-]{1,90}$/u.test(name))
  ) {
    throw new Error('Invalid resource groups');
  }
  return [...new Set<string>(value)];
}

export function accessScope(account: AzureAccount, resourceGroup?: string): string {
  return `/subscriptions/${account.subscriptionId}${resourceGroup ? `/resourceGroups/${resourceGroup}` : ''}`;
}

export function createAccessCommand(account: AzureAccount, resourceGroup?: string): string {
  return `az ad sp create-for-rbac --role Reader --scopes '${accessScope(account, resourceGroup)}' --query "{tenant:tenant, appId:appId, password:password}" -o json`;
}

export function parseCreatedCredentials(output: string, account: AzureAccount): AzureClientSecretCredentials {
  const value = JSON.parse(output);
  if (
    !value ||
    typeof value.tenant !== 'string' ||
    value.tenant.toLowerCase() !== account.tenantId.toLowerCase() ||
    typeof value.appId !== 'string' ||
    !uuid.test(value.appId) ||
    typeof value.password !== 'string' ||
    !value.password.trim()
  ) {
    throw new Error('Invalid credentials or tenant mismatch');
  }
  return {
    authType: 'clientsecret',
    azureCloud: AzureCloud.Public,
    tenantId: account.tenantId,
    clientId: value.appId,
    clientSecret: value.password,
  };
}
