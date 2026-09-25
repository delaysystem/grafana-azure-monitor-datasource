package models

// AzureMonitorDataSourceSettings is the Go model backing the datasource's
// jsonData. Its json tags are the single source of truth that the schema
// conformance suite compares against the jsonData fields declared in
// dsconfig.json, so the two must stay in sync.
type AzureMonitorDataSourceSettings struct {
	CloudName                    string            `json:"cloudName"`
	AzureAuthType                string            `json:"azureAuthType"`
	AzureCredentials             map[string]any    `json:"azureCredentials"`
	TenantId                     string            `json:"tenantId"`
	ClientId                     string            `json:"clientId"`
	SubscriptionId               string            `json:"subscriptionId"`
	BasicLogsEnabled             bool              `json:"basicLogsEnabled"`
	BatchAPIEnabled              bool              `json:"batchAPIEnabled"`
	AzureLogAnalyticsSameAs      bool              `json:"azureLogAnalyticsSameAs"`
	LogAnalyticsTenantId         string            `json:"logAnalyticsTenantId"`
	LogAnalyticsClientId         string            `json:"logAnalyticsClientId"`
	LogAnalyticsSubscriptionId   string            `json:"logAnalyticsSubscriptionId"`
	LogAnalyticsDefaultWorkspace string            `json:"logAnalyticsDefaultWorkspace"`
	AppInsightsAppId             string            `json:"appInsightsAppId"`
	Interval                     string            `json:"interval"`
	Timeout                      int               `json:"timeout"`
	KeepCookies                  []string          `json:"keepCookies"`
	EnableSecureSocksProxy       bool              `json:"enableSecureSocksProxy"`
	CustomizedRoutes             map[string]string `json:"customizedRoutes"`
	OauthPassThru                bool              `json:"oauthPassThru"`
	DisableGrafanaCache          bool              `json:"disableGrafanaCache"`
}
