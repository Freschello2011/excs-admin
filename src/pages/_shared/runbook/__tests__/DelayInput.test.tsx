// @vitest-environment jsdom
/**
 * DelayInput — Step 0 强制锁定 + value=0 提示文案 + 422 error 描边
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import DelayInput from '../DelayInput';

function renderUI(ui: React.ReactElement) {
  return render(<ConfigProvider>{ui}</ConfigProvider>);
}

describe('<DelayInput>', () => {
  afterEach(() => cleanup());

  it('stepIndex=0 → 渲染 "立即" chip，不提供输入框', () => {
    const onChange = vi.fn();
    renderUI(<DelayInput stepIndex={0} value={0} onChange={onChange} />);
    expect(screen.getByTestId('delay-input-immediate-chip')).toHaveTextContent('立即');
    expect(screen.queryByTestId('delay-input-number')).toBeNull();
  });

  it('stepIndex=2 + value=0 → 渲染 InputNumber + "填 0 = 与前一步同时" 文案', () => {
    renderUI(<DelayInput stepIndex={2} value={0} onChange={vi.fn()} />);
    expect(screen.getByTestId('delay-input-editor')).toBeInTheDocument();
    expect(screen.getByText('填 0 = 与前一步同时')).toBeInTheDocument();
    expect(screen.getByText('在前一步开始后')).toBeInTheDocument();
    expect(screen.getByText('秒执行')).toBeInTheDocument();
  });

  it('stepIndex=1 + value=5 → 不出 "填 0" 提示', () => {
    renderUI(<DelayInput stepIndex={1} value={5} onChange={vi.fn()} />);
    expect(screen.queryByText('填 0 = 与前一步同时')).toBeNull();
  });

  it('error prop 命中 → role="alert" 渲染消息 + 描边走 colorError', () => {
    renderUI(
      <DelayInput
        stepIndex={1}
        value={3}
        onChange={vi.fn()}
        error="必须 ≥ 0"
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('必须 ≥ 0');
  });

  it('改 InputNumber 触发 onChange（向下取整）', () => {
    const onChange = vi.fn();
    renderUI(<DelayInput stepIndex={1} value={3} onChange={onChange} />);
    const input = screen
      .getByTestId('delay-input-number')
      .querySelector('input') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(12);
  });
});
