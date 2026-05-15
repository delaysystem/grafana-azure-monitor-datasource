import { waitFor } from '@testing-library/react';
import { select } from 'react-select-event';

export const selectOptionInTest = async (
  input: HTMLElement,
  optionOrOptions: string | RegExp | Array<string | RegExp>
) => await waitFor(() => select(input, optionOrOptions, { container: document.body }));
