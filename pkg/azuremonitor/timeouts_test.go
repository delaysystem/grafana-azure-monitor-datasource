package azuremonitor

import (
	"testing"
	"time"

	"github.com/grafana/grafana-azure-monitor-datasource/pkg/azuremonitor/types"
	"github.com/stretchr/testify/assert"
)

func floatPtr(v float64) *float64 {
	return &v
}

func durationPtr(d time.Duration) *time.Duration {
	return &d
}

func TestLegacyTimeout(t *testing.T) {
	t.Run("returns nil when timeout is not set", func(t *testing.T) {
		assert.Nil(t, legacyTimeout(map[string]any{}))
	})

	t.Run("returns nil when timeout is negative", func(t *testing.T) {
		assert.Nil(t, legacyTimeout(map[string]any{"timeout": float64(-5)}))
	})

	t.Run("preserves an explicit zero instead of treating it as unset", func(t *testing.T) {
		got := legacyTimeout(map[string]any{"timeout": float64(0)})
		assert.NotNil(t, got)
		assert.Equal(t, time.Duration(0), *got)
	})

	t.Run("returns the duration when timeout is set", func(t *testing.T) {
		got := legacyTimeout(map[string]any{"timeout": float64(45)})
		assert.Equal(t, 45*time.Second, *got)
	})
}

func TestResolveTimeout(t *testing.T) {
	t.Run("uses the per-service field when set", func(t *testing.T) {
		settings := types.AzureMonitorSettings{LogsTimeout: floatPtr(90)}
		got := resolveTimeout(types.RouteAzureLogAnalytics, settings, durationPtr(10*time.Second))
		assert.Equal(t, 90*time.Second, got)
	})

	t.Run("uses the logs field for traces and trace exemplar", func(t *testing.T) {
		settings := types.AzureMonitorSettings{LogsTimeout: floatPtr(90)}
		assert.Equal(t, 90*time.Second, resolveTimeout(types.RouteAzureTraces, settings, durationPtr(10*time.Second)))
		assert.Equal(t, 90*time.Second, resolveTimeout(types.RouteTraceExemplar, settings, durationPtr(10*time.Second)))
	})

	t.Run("uses the metrics field for portal", func(t *testing.T) {
		settings := types.AzureMonitorSettings{MetricsTimeout: floatPtr(90)}
		assert.Equal(t, 90*time.Second, resolveTimeout(types.RouteAzurePortal, settings, durationPtr(10*time.Second)))
	})

	t.Run("falls back to legacy timeout when per-service field is unset", func(t *testing.T) {
		settings := types.AzureMonitorSettings{}
		got := resolveTimeout(types.RouteAzureLogAnalytics, settings, durationPtr(45*time.Second))
		assert.Equal(t, 45*time.Second, got)
	})

	t.Run("falls back to legacy timeout when per-service field is unset, for traces/trace exemplar/portal", func(t *testing.T) {
		settings := types.AzureMonitorSettings{}
		assert.Equal(t, 45*time.Second, resolveTimeout(types.RouteAzureTraces, settings, durationPtr(45*time.Second)))
		assert.Equal(t, 45*time.Second, resolveTimeout(types.RouteTraceExemplar, settings, durationPtr(45*time.Second)))
		assert.Equal(t, 45*time.Second, resolveTimeout(types.RouteAzurePortal, settings, durationPtr(45*time.Second)))
	})

	t.Run("falls back to per-service default when neither is set", func(t *testing.T) {
		settings := types.AzureMonitorSettings{}
		assert.Equal(t, defaultLogsTimeout, resolveTimeout(types.RouteAzureLogAnalytics, settings, nil))
		assert.Equal(t, defaultMetricsTimeout, resolveTimeout(types.RouteAzureMonitor, settings, nil))
		assert.Equal(t, defaultMetricsTimeout, resolveTimeout(types.RouteAzureMonitorBatchMetrics, settings, nil))
		assert.Equal(t, defaultLogsTimeout, resolveTimeout(types.RouteAzureTraces, settings, nil))
		assert.Equal(t, defaultLogsTimeout, resolveTimeout(types.RouteTraceExemplar, settings, nil))
		assert.Equal(t, defaultResourceGraphTimeout, resolveTimeout(types.RouteAzureResourceGraph, settings, nil))
		assert.Equal(t, defaultMetricsTimeout, resolveTimeout(types.RouteAzurePortal, settings, nil))
	})

	t.Run("preserves an explicit per-service zero instead of falling back to the default", func(t *testing.T) {
		settings := types.AzureMonitorSettings{LogsTimeout: floatPtr(0)}
		assert.Equal(t, time.Duration(0), resolveTimeout(types.RouteAzureLogAnalytics, settings, nil))
	})

	t.Run("preserves an explicit legacy zero instead of falling back to the default", func(t *testing.T) {
		settings := types.AzureMonitorSettings{}
		assert.Equal(t, time.Duration(0), resolveTimeout(types.RouteAzureLogAnalytics, settings, durationPtr(0)))
	})

	t.Run("resolves logs, metrics, and resource graph independently", func(t *testing.T) {
		settings := types.AzureMonitorSettings{
			LogsTimeout:          floatPtr(200),
			MetricsTimeout:       floatPtr(15),
			ResourceGraphTimeout: floatPtr(20),
		}
		assert.Equal(t, 200*time.Second, resolveTimeout(types.RouteAzureLogAnalytics, settings, nil))
		assert.Equal(t, 200*time.Second, resolveTimeout(types.RouteAzureTraces, settings, nil))
		assert.Equal(t, 200*time.Second, resolveTimeout(types.RouteTraceExemplar, settings, nil))
		assert.Equal(t, 15*time.Second, resolveTimeout(types.RouteAzureMonitor, settings, nil))
		assert.Equal(t, 15*time.Second, resolveTimeout(types.RouteAzurePortal, settings, nil))
		assert.Equal(t, 20*time.Second, resolveTimeout(types.RouteAzureResourceGraph, settings, nil))
	})

	t.Run("returns zero (no override) for routes outside logs/metrics/traces/portal/resource graph", func(t *testing.T) {
		settings := types.AzureMonitorSettings{LogsTimeout: floatPtr(200)}
		assert.Equal(t, time.Duration(0), resolveTimeout("some other route", settings, durationPtr(5*time.Second)))
	})
}
