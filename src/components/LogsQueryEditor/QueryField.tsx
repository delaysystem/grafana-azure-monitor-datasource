import { type EngineSchema, getKustoWorker } from '@kusto/monaco-kusto';
import { useCallback, useEffect, useState } from 'react';

import { CodeEditor, type Monaco, type MonacoEditor } from '@grafana/ui';

import { type AzureQueryEditorFieldProps } from '../../types/types';

import { setKustoQuery } from './setQueryValue';

interface MonacoEditorValues {
  editor: MonacoEditor;
  monaco: Monaco;
}

const QueryField = ({ query, onQueryChange, schema }: AzureQueryEditorFieldProps) => {
  const [monaco, setMonaco] = useState<MonacoEditorValues | undefined>();

  useEffect(() => {
    if (!monaco) {
      return;
    }

    let cancelled = false;

    const setupEditor = async ({ monaco, editor }: MonacoEditorValues, schema: EngineSchema | undefined) => {
      try {
        const model = editor.getModel();
        if (model) {
          const kustoWorker = await getKustoWorker();
          const kustoMode = await kustoWorker(model?.uri);
          if (schema) {
            await kustoMode.setSchema(schema);
          }

          if (cancelled) {
            return;
          }

          // Force a re-tokenize so a pre-loaded query isn't stuck unhighlighted until the next edit.
          const selections = editor.getSelections();
          model.setValue(model.getValue());
          if (selections) {
            editor.setSelections(selections);
          }
        }
      } catch (err) {
        console.error(err);
      }
    };

    setupEditor(monaco, schema).catch((err) => console.error(err));

    // Skip the setValue nudge if we unmount/rerun before setup finishes.
    return () => {
      cancelled = true;
    };
  }, [schema, monaco]);

  const handleEditorMount = useCallback((editor: MonacoEditor, monaco: Monaco) => {
    setMonaco({ monaco, editor });
  }, []);

  const onChange = useCallback(
    (newQuery: string) => {
      onQueryChange(setKustoQuery(query, newQuery));
    },
    [onQueryChange, query]
  );

  return (
    <CodeEditor
      value={query.azureLogAnalytics?.query ?? ''}
      language="kusto"
      height={200}
      width="100%"
      showMiniMap={false}
      onBlur={onChange}
      onSave={onChange}
      onEditorDidMount={handleEditorMount}
    />
  );
};

export default QueryField;
