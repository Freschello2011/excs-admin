// @vitest-environment jsdom
/**
 * PreCondListEditor — 折叠态 / 添加 / 类型切换清空目标 / action_done 前向引用拦截
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import PreCondListEditor from '../PreCondListEditor';
import type { PreCond } from '../types';

function renderUI(ui: React.ReactElement) {
  return render(<ConfigProvider>{ui}</ConfigProvider>);
}

const lookups = {
  devices: [
    { id: 1, name: '序厅 · K32' },
    { id: 2, name: '序厅 · LED 一号' },
  ],
  exhibits: [{ id: 10, name: '序厅' }],
  scenes: [{ id: 100, name: '开馆' }],
};

describe('<PreCondListEditor>', () => {
  afterEach(() => cleanup());

  it('value=[] → 折叠态显示 "前置条件 0"，无行', () => {
    renderUI(
      <PreCondListEditor
        value={[]}
        onChange={vi.fn()}
        currentStepIndex={2}
        {...lookups}
      />,
    );
    const toggle = screen.getByTestId('precond-toggle');
    expect(toggle).toHaveAttribute('data-expanded', 'false');
    expect(toggle).toHaveTextContent('0');
    expect(screen.queryByTestId('precond-row')).toBeNull();
  });

  it('点击 toggle → 展开；点击 "添加条件" → onChange 带 1 条 device_online 默认 PreCond', () => {
    const onChange = vi.fn();
    const { rerender } = renderUI(
      <PreCondListEditor
        value={[]}
        onChange={onChange}
        currentStepIndex={2}
        {...lookups}
      />,
    );
    fireEvent.click(screen.getByTestId('precond-toggle'));
    fireEvent.click(screen.getByTestId('precond-add-btn'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as PreCond[];
    expect(next).toHaveLength(1);
    expect(next[0].type).toBe('device_online');
    expect(next[0].block_on_fail).toBe(false);

    // 父组件回填后行渲染
    rerender(
      <ConfigProvider>
        <PreCondListEditor
          value={next}
          onChange={onChange}
          currentStepIndex={2}
          {...lookups}
        />
      </ConfigProvider>,
    );
    expect(screen.getByTestId('precond-row')).toBeInTheDocument();
    expect(screen.getByTestId('precond-target-device-select')).toBeInTheDocument();
  });

  it('类型切到 scene_state → 上层收到清空 device_id/exhibit_id/action_step_index 的 patch', () => {
    const onChange = vi.fn();
    const initial: PreCond[] = [
      {
        type: 'device_online',
        block_on_fail: false,
        device_id: 1,
      },
    ];
    renderUI(
      <PreCondListEditor
        value={initial}
        onChange={onChange}
        currentStepIndex={2}
        {...lookups}
      />,
    );
    const root = screen.getByTestId('precond-type-select');
    const combobox = root.querySelector('input[role="combobox"]') as HTMLElement;
    fireEvent.mouseDown(combobox);
    fireEvent.click(combobox);
    // antd 6 下拉选项：role="option" + 文案匹配
    const option = screen.getByText('当前场景为', {
      selector: '.ant-select-item-option-content',
    });
    fireEvent.click(option);

    expect(onChange).toHaveBeenCalledTimes(1);
    const patched = onChange.mock.calls[0][0] as PreCond[];
    expect(patched[0].type).toBe('scene_state');
    expect(patched[0].device_id).toBeNull();
    expect(patched[0].exhibit_id).toBeNull();
    expect(patched[0].scene_id).toBeNull();
    expect(patched[0].action_step_index).toBeNull();
  });

  it('errors 命中 0.scene_id → row 加 error 描边并渲染 alert 文案', () => {
    const initial: PreCond[] = [
      {
        type: 'scene_state',
        block_on_fail: false,
        scene_id: null,
      },
    ];
    renderUI(
      <PreCondListEditor
        value={initial}
        onChange={vi.fn()}
        currentStepIndex={2}
        errors={{ '0.scene_id': '必须选择场景' }}
        {...lookups}
      />,
    );
    const row = screen.getByTestId('precond-row');
    expect(row).toHaveAttribute('data-has-error', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('必须选择场景');
  });

  it('action_done 类型 + currentStepIndex=0 → step 选项不可用（无前序步）', () => {
    const initial: PreCond[] = [
      {
        type: 'action_done',
        block_on_fail: false,
        action_step_index: null,
      },
    ];
    renderUI(
      <PreCondListEditor
        value={initial}
        onChange={vi.fn()}
        currentStepIndex={0}
        {...lookups}
      />,
    );
    const select = screen.getByTestId('precond-target-step-select');
    expect(select).toHaveAttribute('data-disabled', 'true');
  });
});
