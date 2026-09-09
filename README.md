# Azure Monitor data source for Grafana

> **Note**: This core plugin was extracted from the [grafana/grafana](https://github.com/grafana/grafana) repository
> and is now bundled with Grafana.

## Overview

Data source for Microsoft Azure Monitor & Application Insights

## Requirements

- Grafana 12.3.0 or later

## Getting started

This plugin is bundled with Grafana — no installation is required for standard Grafana deployments.

1. Navigate to **Connections > Data sources** in Grafana.
2. Click **Add data source** and search for "Azure Monitor".
3. Configure the connection settings and click **Save & test**.

For detailed setup instructions, see the
[Azure Monitor data source documentation](https://grafana.com/docs/grafana/latest/datasources/azure-monitor/).

### Guided Azure access setup

Choose **Set up Azure access** in the configuration editor, then **Azure Cloud Shell — recommended** or
**Local terminal**. Both use the same individual Azure CLI commands, not a setup script. Use Bash in Cloud Shell,
or a Bash-compatible local terminal with Azure CLI installed and signed in.

1. **Identify Azure:** Run the account command and paste its non-secret JSON output. Grafana discovers the tenant
   and subscription without asking you to enter individual Azure identifiers.
2. **Choose access:** Grant the built-in **Reader** role to the detected subscription, or discover and select one
   resource group to limit access.
3. **Create Grafana access and verify:** Run the displayed commands to create an application, service principal,
   secret, and role assignment. Paste the credential output only into Grafana, then select **Save and verify access**.
   This saves the credentials and checks authentication and subscription discovery, not every metrics/logs permission.

Your Azure account needs permission to create app registrations and assign roles at the selected scope.
If necessary, ask an Azure administrator to run the commands. Role assignments may take several minutes to propagate;
retry verification rather than creating another application.

The credential output contains a secret. Do not share it in tickets or chat, and clear it from your terminal and
clipboard after importing. Grafana saves it using encrypted secure settings. The generated secret expires after one
year by default; rotate it before expiry. Leaving the wizard does not delete resources created in Azure.

Guided setup currently targets Azure public cloud. **Use existing Azure credentials** keeps the manual configuration
available, including other Azure clouds and authentication methods. Existing and provisioned configurations retain
their manual controls; provisioned read-only settings cannot be changed through the wizard.

### Custom Grafana distributions

If you are building a custom Grafana binary or distribution that excludes bundled plugins,
you can install this plugin from the [Grafana plugin catalog](https://grafana.com/grafana/plugins/).

## Documentation

Full documentation is available at:

https://grafana.com/docs/grafana/latest/datasources/azure-monitor/

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

<!-- NOTE: Use the static CONTRIBUTING.md template from grafana-elasticsearch-datasource as the base.
     Add plugin-specific sections (external service setup, auth docs, etc.) only if needed. -->

## License

This plugin is licensed under the [AGPL-3.0](LICENSE).
