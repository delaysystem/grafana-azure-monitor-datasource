process.env.TZ = 'Pacific/Easter';

module.exports = {
  ...require('./.config/jest.config'),
  moduleNameMapper: {
    ...require('./.config/jest.config').moduleNameMapper,
    // Override the scaffolded `.config` mock so SVG props (aria-label, event
    // handlers) are forwarded to the DOM node. See the mock for details.
    'react-inlinesvg': '<rootDir>/src/__mocks__/react-inlinesvg.tsx',
    '^monaco-editor$': '<rootDir>/src/__mocks__/monaco-editor.ts',
    '^@grafana/test-utils$': '<rootDir>/src/__mocks__/@grafana/test-utils.ts',
    '^@kusto/monaco-kusto$': '<rootDir>/src/__mocks__/@kusto/monaco-kusto.ts',
  },
  transformIgnorePatterns: [
    require('./.config/jest/utils').nodeModulesToTransform([
      ...require('./.config/jest/utils').grafanaESModules,
      '@react-hookz/web',
      '@ver0/deep-equal',
      '@grafana/plugin-ui',
      '@marcbachmann/cel-js',
      'monaco-editor',
      '@openfeature/ofrep-web-provider',
      '@openfeature/web-sdk',
      '@openfeature/react-sdk',
      '@lezer/lr',
      '@lezer/common',
      '@lezer/highlight',
      '@grafana/lezer-logql',
    ]),
  ],
};
