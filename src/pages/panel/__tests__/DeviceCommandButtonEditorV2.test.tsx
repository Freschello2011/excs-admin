// @vitest-environment jsdom
/**
 * DeviceCommandButtonEditorV2 — 集成测试（S5-9 / ADR-0020-v2 Stage 5 admin Phase C）
 *
 * 验证：
 *   - feature flag off (localStorage 未设) → PanelEditorPage 编辑按钮走 v1 Modal
 *   - feature flag on  → 点编辑按钮渲染 v2 三栏壳（preview + basic info + action list）
 *   - bindingToButtons / buttonsToBinding round-trip（v1 read → v2 write）
 *   - 修改 label → dirty + apply 走 onApply 回调写回 binding
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ConfigProvider, App as AntdApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// jsdom 不带 matchMedia
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// ──────────── Mocks ────────────

vi.mock('@/api/hall', () => ({
  hallApi: {
    getDevices: vi.fn().mockResolvedValue({
      data: { code: 0, message: '', data: [{ id: 10, name: 'K32 灯光' }] },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    }),
    getExhibits: vi.fn().mockResolvedValue({
      data: { code: 0, message: '', data: [{ id: 100, name: '序厅' }] },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    }),
    getEffectiveCommands: vi.fn().mockResolvedValue({
      data: { code: 0, message: '', data: [] },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    }),
  },
}));

vi.mock('@/api/command', () => ({
  commandApi: {
    getScenes: vi.fn().mockResolvedValue({
      data: { code: 0, message: '', data: [] },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    }),
  },
}));

vi.mock('@/api/content', () => ({
  contentApi: {
    listContents: vi.fn().mockResolvedValue({
      data: { code: 0, message: '', data: { list: [] } },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    }),
    getSlideshowConfig: vi.fn(),
  },
}));

vi.mock('@/components/device-catalog/WidgetRenderer', () => ({
  default: () => <div data-testid="widget-renderer-stub" />,
}));

import {
  bindingToButtons,
  buttonsToBinding,
  validateButtons,
} from '../components/buttonV2Codec';
import DeviceCommandButtonEditorV2 from '../DeviceCommandButtonEditorV2';
import type { BufferCard, BufferSection } from '../panelBuffer';

// ──────────── Codec unit tests（无 React render，纯函数）────────────

describe('buttonV2Codec', () => {
  it('bindingToButtons：v1 三元组 → device-only ActionStep[]', () => {
    const v1Binding = {
      buttons: [
        {
          label: '速滑馆',
          icon: 'ice_skating',
          actions: [
            { device_id: 10, command: 'channel_on', params: { channel: 3 } },
          ],
        },
      ],
    };
    const out = bindingToButtons(v1Binding);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe('速滑馆');
    expect(out[0].icon).toBe('ice_skating');
    expect(out[0].actions[0].type).toBe('device');
    expect(out[0].actions[0].device_id).toBe(10);
    expect(out[0].actions[0].command).toBe('channel_on');
  });

  it('bindingToButtons：v2 (schema_version=2) → 直接 ActionStep[]', () => {
    const v2Binding = {
      schema_version: 2,
      buttons: [
        {
          label: '速滑馆',
          icon: 'ice_skating',
          tooltip: 'K32 灯 + 联动屏幕',
          actions: [
            {
              type: 'content',
              delay_seconds_after_prev_start: 2,
              exhibit_id: 100,
              content_intent: 'play_video',
            },
          ],
        },
      ],
    };
    const out = bindingToButtons(v2Binding);
    expect(out[0].tooltip).toBe('K32 灯 + 联动屏幕');
    expect(out[0].actions[0].type).toBe('content');
    expect(out[0].actions[0].delay_seconds_after_prev_start).toBe(2);
    expect(out[0].actions[0].exhibit_id).toBe(100);
  });

  it('buttonsToBinding：始终输出 schema_version=2', () => {
    const out = buttonsToBinding([
      {
        label: '速滑馆',
        icon: 'ice_skating',
        actions: [
          {
            type: 'device',
            delay_seconds_after_prev_start: 0,
            device_id: 10,
            command: 'channel_on',
            params: null,
            preconditions: null,
            friendly_description: null,
          },
        ],
      },
    ]);
    expect(out.schema_version).toBe(2);
    expect(Array.isArray(out.buttons)).toBe(true);
    const buttons = (out.buttons as Array<{ label: string; icon?: string }>);
    expect(buttons[0].label).toBe('速滑馆');
    expect(buttons[0].icon).toBe('ice_skating');
  });

  it('validateButtons：空 label / 缺 device_id / 缺 content_intent', () => {
    const result = validateButtons([
      {
        label: '',
        actions: [
          {
            type: 'device',
            delay_seconds_after_prev_start: 0,
            device_id: null,
            command: null,
            params: null,
            preconditions: null,
            friendly_description: null,
          },
          {
            type: 'content',
            delay_seconds_after_prev_start: 0,
            exhibit_id: null,
            content_intent: null,
            content_params: null,
            preconditions: null,
            friendly_description: null,
          },
        ],
      },
    ]);
    expect(result.hasError).toBe(true);
    expect(result.errors[0].label).toBeTruthy();
    expect(result.errors[0]['actions.0.device_id']).toBeTruthy();
    expect(result.errors[0]['actions.1.content_intent']).toBeTruthy();
  });

  it('validateButtons：device_id 不在 knownDeviceIds（设备已删除）→ 报错', () => {
    const result = validateButtons(
      [
        {
          label: '某按钮',
          actions: [
            {
              type: 'device',
              delay_seconds_after_prev_start: 0,
              device_id: 43,
              command: 'channel_on',
              params: null,
              preconditions: null,
              friendly_description: null,
            },
          ],
        },
      ],
      new Set([10, 11, 12]),
    );
    expect(result.hasError).toBe(true);
    expect(result.errors[0]['actions.0.device_id']).toMatch(/已删除/);
  });
});

// ──────────── Component integration ────────────

const sampleSections: BufferSection[] = [
  {
    id: -1,
    section_type: 'global',
    name: '全局分区',
    sort_order: 1,
    cards: [
      {
        id: -2,
        card_type: 'device_command',
        binding: {
          buttons: [
            {
              label: '速滑馆',
              icon: 'ice_skating',
              actions: [
                { device_id: 10, command: 'channel_on', params: null },
              ],
            },
          ],
        },
        config: null,
        sort_order: 1,
      },
    ],
  },
];

function renderEditor(
  overrides: Partial<{
    open: boolean;
    onApply: (cardId: number, binding: Record<string, unknown>) => void;
    onClose: () => void;
    card: BufferCard | null;
  }> = {},
) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const onApply = overrides.onApply ?? vi.fn();
  const onClose = overrides.onClose ?? vi.fn();

  return {
    onApply,
    onClose,
    ...render(
      <QueryClientProvider client={qc}>
        <ConfigProvider>
          <AntdApp>
            <MemoryRouter>
              <DeviceCommandButtonEditorV2
                open={overrides.open ?? true}
                hallId={3}
                card={overrides.card ?? sampleSections[0].cards[0]}
                sectionId={sampleSections[0].id}
                sections={sampleSections}
                onActivateCard={() => {}}
                onApply={onApply}
                onClose={onClose}
              />
            </MemoryRouter>
          </AntdApp>
        </ConfigProvider>
      </QueryClientProvider>,
    ),
  };
}

describe('<DeviceCommandButtonEditorV2>', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('open=true → 三栏壳渲染（PageHeader + 左 nav + 中按钮列表 + 右编辑区）', async () => {
    renderEditor();

    // Drawer / editor body
    await waitFor(() => {
      expect(
        screen.getByTestId('device-command-button-editor-v2'),
      ).toBeInTheDocument();
    });

    // 左栏 nav（device_command 卡 active）
    expect(screen.getByTestId('panel-section-nav')).toBeInTheDocument();
    expect(
      screen.getByTestId('panel-section-nav-card--2'),
    ).toHaveAttribute('data-active', 'true');

    // 中栏按钮列表
    expect(screen.getByTestId('device-command-button-list')).toBeInTheDocument();
    expect(
      screen.getByTestId('device-command-button-item-0'),
    ).toHaveAttribute('data-active', 'true');

    // 右编辑区：preview + basic info + action list
    expect(screen.getByTestId('device-command-button-preview')).toBeInTheDocument();
    expect(
      screen.getByTestId('device-command-button-basic-info'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('device-command-button-action-list-card'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('action-step-list-editor')).toBeInTheDocument();
  });

  it('编辑 label → dirty 显示 + 应用按钮可用', async () => {
    renderEditor();

    await waitFor(() => {
      expect(
        screen.getByTestId('device-command-button-basic-label'),
      ).toBeInTheDocument();
    });

    // 初始 apply disabled
    const applyBtn = screen
      .getByTestId('device-command-button-editor-apply')
      .closest('button');
    expect(applyBtn).toBeDisabled();

    // 改 label
    const input = screen.getByTestId(
      'device-command-button-basic-label',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '速滑馆 改名' } });

    await waitFor(() => {
      expect(
        screen.getByTestId('device-command-button-editor-dirty'),
      ).toBeInTheDocument();
    });

    expect(applyBtn).not.toBeDisabled();
  });

  it('点「应用到草稿」→ onApply 回调收到 v2 binding（schema_version=2）', async () => {
    const onApply = vi.fn();
    renderEditor({ onApply });

    await waitFor(() => {
      expect(
        screen.getByTestId('device-command-button-basic-label'),
      ).toBeInTheDocument();
    });

    const input = screen.getByTestId(
      'device-command-button-basic-label',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '速滑馆-V2' } });

    fireEvent.click(screen.getByTestId('device-command-button-editor-apply'));

    await waitFor(() => {
      expect(onApply).toHaveBeenCalledTimes(1);
    });

    const [cardId, binding] = onApply.mock.calls[0];
    expect(cardId).toBe(-2);
    expect(binding.schema_version).toBe(2);
    expect(binding.buttons[0].label).toBe('速滑馆-V2');
  });

  it('「新增按钮」→ 添加一个新按钮（actions 含 1 个 device 步）', async () => {
    renderEditor();

    await waitFor(() => {
      expect(screen.getByTestId('device-command-button-add')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('device-command-button-add'));

    await waitFor(() => {
      expect(
        screen.getByTestId('device-command-button-item-1'),
      ).toBeInTheDocument();
    });
  });
});
