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
