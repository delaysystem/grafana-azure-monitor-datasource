import type { Configuration, ExternalItemFunctionData } from 'webpack';

type ExternalsType = Configuration['externals'];

export const externals: ExternalsType = [
  // Required for dynamic publicPath resolution
  { 'amd-module': 'module' },
  'lodash',
  'jquery',
  'moment',
  'slate',
  'emotion',
  '@emotion/react',
  '@emotion/css',
  'prismjs',
  'slate-plain-serializer',
  '@grafana/slate-react',
  // Share core's monaco-editor instance for the Kusto language service instead of bundling
  // our own copy — bundling both pulls in an incompatible monaco-editor peer version and the
  // Kusto tokenizer/completion provider never attaches to the editor core actually renders.
  '@kusto/monaco-kusto',
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-dom',
  'react-redux',
  'redux',
  'rxjs',
  'i18next',
  'react-router',
  'd3',
  'angular',
  /^@grafana\/ui/i,
  /^@grafana\/runtime/i,
  /^@grafana\/data/i,

  // Mark legacy SDK imports as external if their name starts with the "grafana/" prefix
  ({ request }: ExternalItemFunctionData, callback: (error?: Error, result?: string) => void) => {
    const prefix = 'grafana/';
    const hasPrefix = (request: string) => request.indexOf(prefix) === 0;
    const stripPrefix = (request: string) => request.slice(prefix.length);

    if (request && hasPrefix(request)) {
      return callback(undefined, stripPrefix(request));
    }

    callback();
  },
];
