import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PreviewScenarioYAML } from '../../wailsjs/go/main/App';
import { api } from '../../wailsjs/go/models';
import { initialScenario } from '../features/workbench/fixtures';
import { toScenarioDraftData } from '../features/workbench/scenarioMapping';
import { previewScenarioYaml } from './scenario';

vi.mock('../../wailsjs/go/main/App', () => ({
  ImportLocalScenario: vi.fn(),
  ListLocalScenarios: vi.fn(),
  LoadBundledScenario: vi.fn(),
  LoadLocalScenario: vi.fn(),
  PreviewScenarioYAML: vi.fn(),
  RemoveLocalScenario: vi.fn(),
  SaveLocalScenario: vi.fn(),
  SaveScenarioAs: vi.fn(),
}));

const previewBinding = vi.mocked(PreviewScenarioYAML);
const draft = toScenarioDraftData(initialScenario);

beforeEach(() => {
  previewBinding.mockReset();
});

describe('previewScenarioYaml', () => {
  it('returns canonical YAML and warnings from the backend', async () => {
    previewBinding.mockResolvedValue(
      new api.ScenarioYAMLResponse({
        ok: true,
        data: {
          yaml: 'name: order-flow\n',
          warnings: [
            {
              code: 'missing_topology_edge',
              message: 'A watched topic is not connected.',
            },
          ],
        },
      }),
    );

    const result = await previewScenarioYaml(draft, 'imported-order.yml');

    expect(result).toEqual({
      ok: true,
      data: {
        yaml: 'name: order-flow\n',
        warnings: [
          {
            code: 'missing_topology_edge',
            message: 'A watched topic is not connected.',
          },
        ],
      },
    });
    expect(previewBinding).toHaveBeenCalledWith(
      expect.any(api.ScenarioDraft),
      'imported-order.yml',
    );
  });

  it('keeps validation diagnostics on failed previews', async () => {
    previewBinding.mockResolvedValue(
      new api.ScenarioYAMLResponse({
        ok: false,
        error: {
          code: 'scenario_invalid',
          message: 'The current draft is invalid.',
          retryable: false,
        },
        data: {
          diagnostics: [
            {
              code: 'publish_topic_required',
              message: 'Publish topic is required.',
              sourceFilename: 'scenario.yaml',
            },
          ],
        },
      }),
    );

    const result = await previewScenarioYaml(draft);

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'scenario_invalid' },
      diagnostics: [{ code: 'publish_topic_required' }],
    });
  });

  it('converts Wails bridge failures into a retryable API error', async () => {
    previewBinding.mockImplementation(() => {
      throw new Error('bridge unavailable');
    });

    const result = await previewScenarioYaml(draft);

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'bridge_error',
        message: 'The app could not communicate with the backend.',
        retryable: true,
      },
      diagnostics: [],
    });
  });
});
