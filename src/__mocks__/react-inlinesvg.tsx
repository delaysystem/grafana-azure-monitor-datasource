// Overrides the `react-inlinesvg` mock scaffolded in `.config/jest/mocks`, which
// renders only a file-name-derived `data-testid` and drops every other prop.
// grafana/ui's `Icon` forwards accessibility props (e.g. `aria-label`) and event
// handlers (e.g. the Select clear button's `onMouseDown`) through to the SVG, so
// dropping them breaks `getByLabelText` queries and click handlers in tests.
// This mirrors how grafana/grafana mocks the module while keeping the
// file-name-derived `data-testid` the existing scaffolded mock provided.
type Callback = (...args: any[]) => void;

export interface StorageItem {
  content: string;
  queue: Callback[];
  status: string;
}

export const cacheStore: { [key: string]: StorageItem } = Object.create(null);

const SVG_FILE_NAME_REGEX = /(.+)\/(.+)\.svg$/;

const InlineSVG = ({
  src,
  // Props specific to react-inlinesvg that must not leak onto the DOM node.
  innerRef,
  cacheRequests,
  preProcessor,
  onLoad,
  onError,
  loader,
  ...rest
}: {
  src: string;
  [key: string]: unknown;
}) => {
  // testId is the file name without extension
  // (e.g. `public/img/icons/angle-double-down.svg` -> `angle-double-down`).
  const testId = src.replace(SVG_FILE_NAME_REGEX, '$2');
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" {...rest} data-testid={testId} />;
};

export default InlineSVG;
