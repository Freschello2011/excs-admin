// @vitest-environment jsdom
/**
 * DRC-Phase 5 — DiagChannelBanner 渲染快照（4 状态）+ 文案 + dark token 命中
 *
 * 不打 _health 端点（statusOverride 直接喂状态，跳过 useQuery）。
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ConfigProvider, theme } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DiagChannelBanner from './DiagChannelBanner';

function renderDark(ui: React.ReactElement) {
  // 把线上 dark token 注入到 <html> 上，模拟 useThemeTokens 读到的 CSS 变量。
  const root = document.documentElement;
  root.style.setProperty('--color-error-bg', '#2A1014');
  root.style.setProperty('--color-error', '#FFB3BC');
  root.style.setProperty('--color-warning-bg', '#2A1F0E');
  root.style.setProperty('--color-warning', '#F0C078');
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>{ui}</ConfigProvider>
    </QueryClientProvider>,
  );
}

describe('DiagChannelBanner', () => {
  beforeEach(() => {
    document.documentElement.style.cssText = '';
  });
  afterEach(() => {
    cleanup();
  });

  it('online + count<5 不渲染任何 banner', () => {
    const { container } = renderDark(
      <DiagChannelBanner
        hallId={3}
        exhibitId={1}
        statusOverride={{ kind: 'online', details: {} }}
        sseReconnectCount={0}
      />,
    );
    expect(container.querySelector('[data-diag-banner-state]')).toBeNull();
  });

  it('app_offline → state 1 红 banner，渲染 IP/MAC/心跳 + 3 步排查', () => {
    renderDark(
      <DiagChannelBanner
        hallId={3}
        exhibitId={1}
        statusOverride={{
          kind: 'app_offline',
          details: {
            local_ip: '192.168.60.208',
            mac_address: '00:1B:21:3A:C5:9F',
            last_heartbeat_at: '2026-04-30T06:28:06Z',
            machine_code: 'should-not-render',
          },
        }}
      />,
    );
    const banner = screen.getByText('展厅电脑没连上，调试功能暂时用不了').closest(
      '[data-diag-banner-state]',
    );
    expect(banner).toHaveAttribute('data-diag-banner-state', '1');
    expect(screen.getByText('192.168.60.208')).toBeInTheDocument();
    expect(screen.getByText('00:1B:21:3A:C5:9F')).toBeInTheDocument();
    // machine_code 不能渲染（红线）
    expect(screen.queryByText(/should-not-render/)).toBeNull();
    // 3 步排查 + 「再试一次」按钮
    expect(screen.getByText(/请到现场看一下/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /再试一次/ })).toBeInTheDocument();
    // dark token 命中：Alert error 的 background 应取自 antd dark algorithm（非默认浅色 #fff2f0）
    const alert = banner as HTMLElement;
    const bg = getComputedStyle(alert).backgroundColor;
    expect(bg).not.toBe('rgb(255, 242, 240)');
  });

  it('cloud_unavailable → state 2 黄 banner，文案"不用去现场"', () => {
    renderDark(
      <DiagChannelBanner
        hallId={3}
        exhibitId={1}
        statusOverride={{
          kind: 'cloud_unavailable',
          details: { since: '2026-04-30T06:30:00Z' },
        }}
      />,
    );
    const banner = screen
      .getByText('调试功能暂时不能用 · 云端正在自动恢复')
      .closest('[data-diag-banner-state]');
    expect(banner).toHaveAttribute('data-diag-banner-state', '2');
    expect(screen.getByText(/不用去现场/)).toBeInTheDocument();
    expect(screen.getByText(/云端会自动重试/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /再试一次/ })).toBeInTheDocument();
  });

  it('sseReconnectCount ≥ 5 → state 4 红 banner（覆盖 online），「立即重连」红 primary', () => {
    renderDark(
      <DiagChannelBanner
        hallId={3}
        exhibitId={1}
        statusOverride={{ kind: 'online', details: {} }}
        sseReconnectCount={5}
      />,
    );
    const banner = screen
      .getByText(/实时事件已断开 5 次/)
      .closest('[data-diag-banner-state]');
    expect(banner).toHaveAttribute('data-diag-banner-state', '4');
    expect(screen.getByText(/已停止自动重试/)).toBeInTheDocument();
    expect(screen.getByText(/之前已经收到的事件还可以在下面看/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /立即重连/ })).toBeInTheDocument();
  });

  it('state 4 优先级高于 state 1（≥5 次重连时即便 app_offline 也走 state 4）', () => {
    renderDark(
      <DiagChannelBanner
        hallId={3}
        exhibitId={1}
        statusOverride={{ kind: 'app_offline', details: { local_ip: '1.2.3.4' } }}
        sseReconnectCount={6}
      />,
    );
    const banner = document.querySelector('[data-diag-banner-state]');
    expect(banner).toHaveAttribute('data-diag-banner-state', '4');
    // 不应同时渲染 state 1 的 IP（被 state 4 覆盖）
    expect(screen.queryByText('1.2.3.4')).toBeNull();
  });

  it('禁词清单：machine_code / MQTT / EventSource / paho / SSE / cid 不出现在任何状态下', () => {
    const { container: c1 } = renderDark(
      <DiagChannelBanner
        hallId={3}
        exhibitId={1}
        statusOverride={{
          kind: 'app_offline',
          details: { local_ip: '1.2.3.4', mac_address: 'aa:bb', machine_code: 'mc-x' },
        }}
      />,
    );
    const { container: c2 } = renderDark(
      <DiagChannelBanner
        hallId={3}
        exhibitId={1}
        statusOverride={{ kind: 'cloud_unavailable', details: {} }}
      />,
    );
    const { container: c3 } = renderDark(
      <DiagChannelBanner
        hallId={3}
        exhibitId={1}
        statusOverride={{ kind: 'online', details: {} }}
        sseReconnectCount={5}
      />,
    );
    for (const root of [c1, c2, c3]) {
      const text = root.textContent ?? '';
      for (const banned of ['machine_code', 'MQTT', 'EventSource', 'paho', 'cid', 'mc-x']) {
        expect(text.includes(banned)).toBe(false);
      }
    }
  });
});
