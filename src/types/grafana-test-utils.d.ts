// `@grafana/test-utils` is a workspace-only package in the Grafana monorepo and
// is not published to npm. The plugin source is synced from grafana/grafana and
// imports it in tests. At runtime jest maps it to `src/__mocks__/@grafana/test-utils.ts`
// (see jest.config.js); this ambient declaration lets `tsc` resolve the import.
declare module '@grafana/test-utils' {
  export function mockBoundingClientRect(rect?: Partial<DOMRect>): void;
  export function mockComboboxRect(): void;
}
