package schema_test

import (
	_ "embed"
	"testing"

	"github.com/grafana/dsconfig/schema"
	"github.com/grafana/grafana-azure-monitor-datasource/pkg/schema/models"
)

//go:embed dsconfig.json
var configSchemaJSON []byte

//go:generate go test -run TestPlugin -generateArtifacts
func TestPlugin(t *testing.T) {
	schema.RunPluginTests(t, schema.PluginUnderTest{
		ID:                "grafana-azure-monitor-datasource",
		ConfigSchemaJSON:  configSchemaJSON,
		SettingsJSONModel: models.AzureMonitorDataSourceSettings{},
		SecureKeys:        []string{"azureClientSecret", "clientCertificate", "privateKey", "certificatePassword", "clientSecret", "password", "appInsightsApiKey"},
	})
}
