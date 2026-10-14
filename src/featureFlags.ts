import { OFREPWebProvider } from '@openfeature/ofrep-web-provider';
import { useBooleanFlagValue } from '@openfeature/react-sdk';
import { MultiProvider, OpenFeature } from '@openfeature/web-sdk';

import { config, createOpenFeatureLocalStorageProvider, createOpenFeatureOFREPWebProvider } from '@grafana/runtime';

import pluginJson from './plugin.json';

// OpenFeature is a window-global singleton, so evaluations go through a
// plugin-scoped domain to stay isolated from Grafana core and other plugins.
export const OPEN_FEATURE_DOMAIN = pluginJson.id;

// Registered in pkg/services/featuremgmt/registry.go.
export const BATCH_API_FLAG = 'datasources.azureMonitorBatchAPI';

/**
 * Registers read-only proxies of Grafana's own providers under the plugin's
 * domain. Grafana initializes the underlying providers before plugins load, so
 * the proxies resolve synchronously with no extra flag fetch. Call once at
 * plugin module load.
 */
export function initFeatureFlags(): void {
  // Register when the domain does not already have a provider,
  // so module re-evaluation does not reset OpenFeature state.
  if (OpenFeature.getProvider(OPEN_FEATURE_DOMAIN) === OpenFeature.getProvider()) {
    // Only newer Grafana versions export the shared provider factories;
    // use them if available, or fallback to our own OFREP provider.
    if (
      typeof createOpenFeatureLocalStorageProvider === 'function' &&
      typeof createOpenFeatureOFREPWebProvider === 'function'
    ) {
      OpenFeature.setProvider(
        OPEN_FEATURE_DOMAIN,
        new MultiProvider([
          { provider: createOpenFeatureLocalStorageProvider() },
          { provider: createOpenFeatureOFREPWebProvider() },
        ]),
      );
    } else {
      OpenFeature.setProvider(
        OPEN_FEATURE_DOMAIN,
        new OFREPWebProvider({
          baseUrl: `${config.appSubUrl || ''}/apis/features.grafana.app/v0alpha1/namespaces/${config.namespace}`,
          disableVisibilityRefresh: true, // Do not refresh
          cacheMode: 'disabled', // Do not write to localStorage
          timeoutMs: 10_000, // Timeout after 10 seconds
        }),
        {
          // Standard context used by all plugins
          targetingKey: config.namespace,
          ...config.openFeatureContext,
        },
      );
    }
  }
}

/**
 * Synchronous read of the Metrics Batch API flag.
 */
export function isBatchAPIFlagEnabled(): boolean {
  return OpenFeature.getClient(OPEN_FEATURE_DOMAIN).getBooleanValue(BATCH_API_FLAG, true);
}

/** React hook for the flag; re-renders when the provider (re)initializes. */
export function useBatchAPIFlag(): boolean {
  return useBooleanFlagValue(BATCH_API_FLAG, true);
}
