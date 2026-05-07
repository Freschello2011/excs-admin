// @vitest-environment jsdom
/**
 * ContentIntentSelect — 8 高频意图渲染 + onChange 带默认 params + 422 error
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import ContentIntentSelect from '../ContentIntentSelect';
import { CONTENT_INTENT_META } from '../types';

function renderUI(ui: React.ReactElement) {
  return render(<ConfigProvider>{ui}</ConfigProvider>);
}

describe('<ContentIntentSelect>', () => {
  afterEach(() => cleanup());

  function openSelect(testid: string) {
    const root = screen.getByTestId(testid);
    // antd 6 Select 内部是 <input role="combobox" class="ant-select-input">
    const combobox = root.querySelector('input[role="combobox"]') as HTMLElement;
    fireEvent.mouseDown(combobox);
    fireEvent.click(combobox);
  }

  it('打开下拉 → 8 高频意图全部渲染', () => {
    renderUI(<ContentIntentSelect value={null} onChange={vi.fn()} />);
    openSelect('content-intent-select');
    for (const meta of CONTENT_INTENT_META) {
      expect(
        screen.getByTestId(`content-intent-option-${meta.value}`),
      ).toBeInTheDocument();
    }
  });

  it('选 set_volume → onChange 带默认 {volume: 80}', () => {
    const onChange = vi.fn();
    renderUI(<ContentIntentSelect value={null} onChange={onChange} />);
    openSelect('content-intent-select');
    fireEvent.click(screen.getByTestId('content-intent-option-set_volume'));
    expect(onChange).toHaveBeenCalledWith('set_volume', { volume: 80 });
  });

  it('选 clear_screen_image → onChange 带空 params {}', () => {
    const onChange = vi.fn();
    renderUI(<ContentIntentSelect value={null} onChange={onChange} />);
    openSelect('content-intent-select');
    fireEvent.click(screen.getByTestId('content-intent-option-clear_screen_image'));
    expect(onChange).toHaveBeenCalledWith('clear_screen_image', {});
  });

  it('error prop → status=error（描边走 colorError）', () => {
    renderUI(
      <ContentIntentSelect
        value={null}
        onChange={vi.fn()}
        error="必填"
      />,
    );
    const wrap = screen.getByTestId('content-intent-select');
    expect(wrap.querySelector('.ant-select-status-error')).toBeInTheDocument();
  });
});
