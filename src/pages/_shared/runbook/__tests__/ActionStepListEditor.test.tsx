// @vitest-environment jsdom
/**
 * ActionStepListEditor — 添加 / 删除 / 上下移 / type chip 视觉 / 422 error 命中
 *
 * Mock hallApi.getEffectiveCommands 让 device step body 不发真请求。
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ActionStepListEditor, { resolveCommandPick } from '../ActionStepListEditor';
import type { ActionStep } from '../types';
import type { EffectiveCommand } from '@/api/gen/client';

const getEffectiveCommandsMock = vi.fn().mockResolvedValue({
  data: { code: 0, message: '', data: [] },
  status: 200,
  statusText: 'OK',
  headers: {},
  config: {},
});

vi.mock('@/api/hall', () => ({
  hallApi: {
    getEffectiveCommands: (...args: unknown[]) => getEffectiveCommandsMock(...args),
  },
}));

vi.mock('@/api/content', () => ({
  contentApi: {
    getSlideshowConfig: vi.fn(),
    getContent: vi.fn(),
  },
}));

vi.mock('@/components/device-catalog/WidgetRenderer', () => ({
  default: () => <div data-testid="widget-renderer-stub" />,
}));

function renderUI(value: ActionStep[], onChange: (v: ActionStep[]) => void) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ConfigProvider>
        <ActionStepListEditor
          value={value}
          onChange={onChange}
          hallId={3}
          devices={[
            { id: 1, name: '序厅 · K32' },
            { id: 2, name: '序厅 · LED 一号' },
          ]}
          exhibits={[{ id: 10, name: '序厅' }]}
          scenes={[{ id: 100, name: '开馆' }]}
        />
      </ConfigProvider>
    </QueryClientProvider>,
  );
}

describe('<ActionStepListEditor>', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('value=[] → 空态 + 2 个底部添加按钮渲染', () => {
    renderUI([], vi.fn());
    expect(screen.getByText('尚未添加任何动作')).toBeInTheDocument();
    expect(screen.getByTestId('action-step-add-device')).toBeInTheDocument();
    expect(screen.getByTestId('action-step-add-content')).toBeInTheDocument();
  });

  it('点击 "+ 设备动作" → onChange 带 1 步 device + delay=0', () => {
    const onChange = vi.fn();
    renderUI([], onChange);
    fireEvent.click(screen.getByTestId('action-step-add-device'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as ActionStep[];
    expect(next).toHaveLength(1);
    expect(next[0].type).toBe('device');
    expect(next[0].delay_seconds_after_prev_start).toBe(0);
  });

  it('点击 "+ 数字内容动作" → onChange 带 1 步 content', () => {
    const onChange = vi.fn();
    renderUI([], onChange);
    fireEvent.click(screen.getByTestId('action-step-add-content'));
    const next = onChange.mock.calls[0][0] as ActionStep[];
    expect(next[0].type).toBe('content');
  });

  it('1 步 device → 渲染设备 chip "设备动作" + Step 0 "立即" + 类型颜色橙', () => {
    const initial: ActionStep[] = [
      {
        type: 'device',
        delay_seconds_after_prev_start: 0,
        device_id: 1,
        command: null,
        params: null,
        preconditions: null,
        friendly_description: null,
      },
    ];
    renderUI(initial, vi.fn());
    expect(screen.getByText('设备动作')).toBeInTheDocument();
    expect(screen.getByTestId('delay-input-immediate-chip')).toHaveTextContent('立即');
    const row = screen.getByTestId('action-step-row');
    expect(row).toHaveAttribute('data-step-type', 'device');
  });

  it('2 步 → 上下移 + 删除按钮：第 1 步上移 disabled / 第 2 步下移 disabled', () => {
    const onChange = vi.fn();
    const initial: ActionStep[] = [
      {
        type: 'device',
        delay_seconds_after_prev_start: 0,
        device_id: 1,
        preconditions: null,
        friendly_description: null,
      },
      {
        type: 'content',
        delay_seconds_after_prev_start: 5,
        exhibit_id: 10,
        content_intent: 'play_video',
        content_params: {},
        preconditions: null,
        friendly_description: null,
      },
    ];
    renderUI(initial, onChange);
    const upBtns = screen.getAllByTestId('action-step-move-up');
    const downBtns = screen.getAllByTestId('action-step-move-down');
    expect(upBtns[0]).toBeDisabled(); // 第 1 步上移 disabled
    expect(downBtns[1]).toBeDisabled(); // 第 2 步下移 disabled

    // 删除第 1 步 → onChange next 中只剩原第 2 步，且其 delay 被强制改 0（Step 0 强制 0）
    fireEvent.click(screen.getAllByTestId('action-step-remove')[0]);
    const next = onChange.mock.calls[0][0] as ActionStep[];
    expect(next).toHaveLength(1);
    expect(next[0].type).toBe('content');
    expect(next[0].delay_seconds_after_prev_start).toBe(0);
  });

  it('errors 命中 "0.device_id" → device select 加 error 描边', () => {
    const initial: ActionStep[] = [
      {
        type: 'device',
        delay_seconds_after_prev_start: 0,
        device_id: null,
        preconditions: null,
        friendly_description: null,
      },
    ];
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ConfigProvider>
          <ActionStepListEditor
            value={initial}
            onChange={vi.fn()}
            hallId={3}
            devices={[{ id: 1, name: 'K32' }]}
            exhibits={[]}
            scenes={[]}
            errors={{ '0.device_id': '必须选择设备' }}
          />
        </ConfigProvider>
      </QueryClientProvider>,
    );
    const wrap = screen.getByTestId('device-step-device-select');
    expect(wrap.querySelector('.ant-select-status-error')).toBeInTheDocument();
  });

  // ADR-0024 自愈回归（5d-2 修）：5d 修之前 admin 落卡漏展开 preset:* 留下的脏 binding，
  // 进编辑器后 effective-commands 加载完应自动 onChange 展开，不需要用户重选命令。
  it('库里仍是 "preset:135" → effective-commands 加载完后 onChange 自动展开为 channels_on + params', async () => {
    getEffectiveCommandsMock.mockResolvedValueOnce({
      data: {
        code: 0,
        message: '',
        data: [
          {
            code: 'preset:135',
            name: '135',
            kind: 'control',
            category: '🔖 现场别名',
            source: 'command_preset',
            resolved_code: 'channels_on',
            resolved_params: { channels: [1, 3, 5] },
          },
          {
            code: 'channels_on',
            name: '通道开',
            kind: 'control',
            category: '通道',
            source: 'preset',
          },
        ],
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    });

    const onChange = vi.fn();
    const initial: ActionStep[] = [
      {
        type: 'device',
        delay_seconds_after_prev_start: 0,
        device_id: 1,
        command: 'preset:135',
        params: null,
        preconditions: null,
        friendly_description: null,
      },
    ];
    renderUI(initial, onChange);

    await waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: 2000 });
    const next = onChange.mock.calls[0][0] as ActionStep[];
    expect(next[0].command).toBe('channels_on');
    expect(next[0].command).not.toMatch(/^preset:/);
    expect(next[0].params).toEqual({ channels: [1, 3, 5] });
  });

  it('库里 command 已是 channels_on（非 preset:）→ 不触发自愈，onChange 不被多余调用', async () => {
    getEffectiveCommandsMock.mockResolvedValueOnce({
      data: {
        code: 0,
        message: '',
        data: [
          {
            code: 'channels_on',
            name: '通道开',
            kind: 'control',
            source: 'preset',
          },
        ],
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    });

    const onChange = vi.fn();
    const initial: ActionStep[] = [
      {
        type: 'device',
        delay_seconds_after_prev_start: 0,
        device_id: 1,
        command: 'channels_on',
        params: { channels: [1] },
        preconditions: null,
        friendly_description: null,
      },
    ];
    renderUI(initial, onChange);
    // 给 useQuery + useEffect 一拍机会
    await new Promise((r) => setTimeout(r, 100));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('content step + intent=set_volume → 渲染音量 Slider 默认 80', () => {
    const initial: ActionStep[] = [
      {
        type: 'content',
        delay_seconds_after_prev_start: 0,
        exhibit_id: 10,
        content_intent: 'set_volume',
        content_params: { volume: 80 },
        preconditions: null,
        friendly_description: null,
      },
    ];
    renderUI(initial, vi.fn());
    expect(screen.getByTestId('intent-form-set_volume')).toBeInTheDocument();
    expect(screen.getByTestId('intent-form-volume-slider')).toBeInTheDocument();
  });
});

// ============================================================
// resolveCommandPick — 落卡 (command, params) 的纯函数单测
// ADR-0024 回归：source=command_preset 必须展开为 resolved_code/resolved_params,
// 否则 server 拿到 "preset:<name>" 派给 plugin 会 cmd_send_failed
// （2026-05-09 prod bug 5d / 闪优测试135）。
// ============================================================

describe('resolveCommandPick', () => {
  const presetCmd = {
    code: 'preset:测试135',
    name: '闪优测试135',
    source: 'command_preset',
    resolved_code: 'channels_on',
    resolved_params: { channels: [1, 3, 5] },
  } as unknown as EffectiveCommand;

  const catalogCmd = {
    code: 'channels_on',
    name: '通道开',
    source: 'preset',
  } as unknown as EffectiveCommand;

  it('选 source=command_preset → 展开为 resolved_code + resolved_params, 不再保留 "preset:" 前缀', () => {
    const out = resolveCommandPick('preset:测试135', [presetCmd, catalogCmd]);
    expect(out.command).toBe('channels_on');
    expect(out.command).not.toMatch(/^preset:/);
    expect(out.params).toEqual({ channels: [1, 3, 5] });
  });

  it('选普通 catalog 命令 → 保留原 code, params 重置 null（让 widget 走默认）', () => {
    const out = resolveCommandPick('channels_on', [presetCmd, catalogCmd]);
    expect(out.command).toBe('channels_on');
    expect(out.params).toBeNull();
  });

  it('preset 命令缺 resolved_code（数据异常）→ 走兜底分支保持原 code', () => {
    const broken = {
      ...presetCmd,
      resolved_code: undefined,
    } as unknown as EffectiveCommand;
    const out = resolveCommandPick('preset:测试135', [broken]);
    expect(out.command).toBe('preset:测试135');
    expect(out.params).toBeNull();
  });

  it('入参非字符串（清空选择）→ 输出 (null, null)', () => {
    expect(resolveCommandPick(undefined, [])).toEqual({ command: null, params: null });
    expect(resolveCommandPick(null, [])).toEqual({ command: null, params: null });
  });
});
