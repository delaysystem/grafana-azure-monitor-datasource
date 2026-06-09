import { EditorField } from '@grafana/plugin-ui';
import { InlineField } from '@grafana/ui';
import { type ComponentProps } from 'react';

// `@grafana/ui/internal` is a workspace-only subpath in the Grafana monorepo and
// is not exposed by the published `@grafana/ui` package, so derive the prop type
// from the `InlineField` component instead.
type InlineFieldProps = ComponentProps<typeof InlineField>;

interface Props extends InlineFieldProps {
  label: string;
  inlineField?: boolean;
  labelWidth?: number;
  // `useFieldset` is supported by `InlineField`/`EditorField` in newer Grafana
  // but isn't declared by the pinned versions' types. Declaring it here lets
  // callers (e.g. DimensionFields) pass it, and it's forwarded via the props
  // spread below — so it starts working as soon as the dependency is upgraded,
  // with no behavior to remember to re-enable.
  useFieldset?: boolean;
}

const DEFAULT_LABEL_WIDTH = 18;

export const Field = (props: Props) => {
  const { labelWidth, inlineField, ...remainingProps } = props;
  const width = labelWidth || DEFAULT_LABEL_WIDTH;

  if (!inlineField) {
    return <EditorField width={width} {...remainingProps} />;
  } else {
    return <InlineField labelWidth={width} {...remainingProps} />;
  }
};
