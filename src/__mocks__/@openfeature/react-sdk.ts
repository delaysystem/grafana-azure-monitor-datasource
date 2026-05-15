export const OpenFeature = {
  setProviderAndWait: jest.fn().mockResolvedValue(undefined),
  getClient: jest.fn().mockReturnValue({
    getBooleanValue: jest.fn().mockReturnValue(false),
    getBooleanDetails: jest.fn().mockReturnValue({ value: false }),
    addHandler: jest.fn(),
  }),
  setProvider: jest.fn(),
};

export const OpenFeatureProvider = jest.fn(({ children }) => children);

export class InMemoryProvider {
  constructor() {}
  async initialize() {}
  onContextChange() { return Promise.resolve(); }
  resolveBooleanEvaluation() { return { value: false }; }
  resolveStringEvaluation() { return { value: '' }; }
  resolveNumberEvaluation() { return { value: 0 }; }
  resolveObjectEvaluation() { return { value: {} }; }
}

export class TypedInMemoryProvider extends InMemoryProvider {}

export const useFeatureFlag = jest.fn().mockReturnValue({ value: false });
export const useFeatureFlags = jest.fn().mockReturnValue({});
