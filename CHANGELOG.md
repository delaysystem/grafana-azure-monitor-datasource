## Unreleased

- Fix a connection freeze between Grafana and the plugin under heavy query load by updating google.golang.org/grpc to v1.85.0 ([grpc/grpc-go#9330](https://github.com/grpc/grpc-go/issues/9330))

## 13.0.5

- Bump backend dependency

## 13.0.4

- Bump frontend dependency `brace-expansion` to address CVE-2026-102276 and CVE-2026-102278
- Add per-service timeouts for logs, metrics, and resource graph queries in [#109](https://github.com/grafana/grafana-azure-monitor-datasource/pull/109)
- Add support for the Auxiliary Logs tier in [#121](https://github.com/grafana/grafana-azure-monitor-datasource/pull/121)
- Download translations from Crowdin in [#125](https://github.com/grafana/grafana-azure-monitor-datasource/pull/125)
- Mark plugin errors as downstream errors in [#133](https://github.com/grafana/grafana-azure-monitor-datasource/pull/133)
- Use OpenFeature providers from `@grafana/runtime` in [#129](https://github.com/grafana/grafana-azure-monitor-datasource/pull/129)
- Resolve dependency security vulnerabilities in [#135](https://github.com/grafana/grafana-azure-monitor-datasource/pull/135)
- Chore: Sync new PRs from grafana/grafana in [#123](https://github.com/grafana/grafana-azure-monitor-datasource/pull/123)
- Update Go to 1.27.3 in [#140](https://github.com/grafana/grafana-azure-monitor-datasource/pull/140)

## 13.0.3

- Add Dimensions and Dimension Values template variable query types in [#118](https://github.com/grafana/grafana-azure-monitor-datasource/pull/118)
- Allowlist resource-proxy calls by method and path in [#120](https://github.com/grafana/grafana-azure-monitor-datasource/pull/120)
- Fix security vulnerabilities (CVE-2026-84375)

## 13.0.2

- Bump backend Go dependencies to address CVEs in [#100](https://github.com/grafana/grafana-azure-monitor-datasource/pull/100)
- Bump frontend dependencies (`terser-webpack-plugin`, `fast-uri`) to address CVEs in [#117](https://github.com/grafana/grafana-azure-monitor-datasource/pull/117)

## 13.0.1

- Initial release of the Azure Monitor data source as an external data source.
