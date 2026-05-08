// @vitest-environment jsdom
/**
 * SceneEditPage v2 — 集成测试
 *
 * 验证：
 *   - 装载 detail → 标题 / 基本信息 / KPI / 动作列表渲染
 *   - 初始 Save 按钮 disabled（不 dirty）
 *   - "+ 设备动作" 添加一步 → Save 按钮 enabled（dirty）
 *   - 左 sidebar 列出场景 + 当前激活
 *
 * Mock 策略：拦截 commandClient / hallApi 调用；不发真请求。
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ConfigProvider, App as AntdApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { SceneDetail, SceneListItem } from '@/api/gen/client';

// jsdom 不带 matchMedia —— antd Breadcrumb / useBreakpoint 会读
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

vi.mock('@/api/gen/client', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/api/gen/client');
  return {
    ...actual,
    commandClient: {
      getScene: vi.fn(),
      updateScene: vi.fn(),
      switchScene: vi.fn(),
    },
  };
});

vi.mock('@/api/command', () => ({
  commandApi: {
    getScenes: vi.fn(),
  },
}));

vi.mock('@/api/hall', () => ({
  hallApi: {
    getDevices: vi.fn(),
    getExhibits: vi.fn(),
    getEffectiveCommands: vi.fn().mockResolvedValue({
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
    getSlideshowConfig: vi.fn(),
    getContent: vi.fn(),
  },
}));

vi.mock('@/components/device-catalog/WidgetRenderer', () => ({
  default: () => <div data-testid="widget-renderer-stub" />,
}));

vi.mock('@/lib/authz/can', () => ({
  useCan: () => true,
}));

import { commandClient } from '@/api/gen/client';
import { commandApi } from '@/api/command';
import { hallApi } from '@/api/hall';
import SceneEditPage from '../SceneEditPage';

// ──────────── Fixtures ────────────

const sceneDetail: SceneDetail = {
  id: 42,
  hall_id: 3,
  name: '开馆模式',
  icon: 'wb_sunny',
  sort_order: 1,
  scene_type: 'preset',
  action_count: 1,
  is_current: false,
  actions: [
    {
      id: 1,
      type: 'device',
      delay_seconds_after_prev_start: 0,
      device_id: 10,
      command: 'power_on',
      params: null,
    },
  ],
};

const sceneList: SceneListItem[] = [
  {
    id: 42,
    hall_id: 3,
    name: '开馆模式',
    icon: 'wb_sunny',
    sort_order: 1,
    scene_type: 'preset',
    action_count: 1,
    is_current: false,
  },
  {
    id: 43,
    hall_id: 3,
    name: '闭馆模式',
    icon: 'bedtime',
    sort_order: 2,
    scene_type: 'preset',
    action_count: 0,
    is_current: false,
  },
];

// ──────────── Helpers ────────────

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const router = createMemoryRouter(
    [
      {
        path: '/halls/:hallId/scenes/:sceneId/edit',
        element: <SceneEditPage />,
      },
      { path: '/scenes', element: <div data-testid="scenes-list-page" /> },
    ],
    { initialEntries: ['/halls/3/scenes/42/edit'] },
  );
  return render(
    <QueryClientProvider client={qc}>
      <ConfigProvider>
        <AntdApp>
          <RouterProvider router={router} />
        </AntdApp>
      </ConfigProvider>
    </QueryClientProvider>,
  );
}

// ──────────── Tests ────────────

describe('<SceneEditPage>', () => {
  beforeEach(() => {
    (commandClient.getScene as ReturnType<typeof vi.fn>).mockResolvedValue(sceneDetail);
    // commandApi.getScenes / hallApi.getExhibits 与其他页面共享 react-query 缓存，统一 AxiosResponse 包壳形态
    (commandApi.getScenes as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { code: 0, message: '', data: sceneList },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    });
    (hallApi.getExhibits as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        code: 0,
        message: '',
        data: [
          { id: 100, name: '序厅', description: '', sort_order: 1, display_mode: 'standard', enable_ai_tag: false, device_count: 1, content_count: 0, has_ai_avatar: false, script_count: 0 },
        ],
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    });
    (hallApi.getDevices as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        code: 0,
        message: '',
        data: [
          { id: 10, name: '序厅 · K32 灯光' },
        ],
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('装载 detail 后渲染标题 / 基本信息 / KPI / 动作列表 + Save 初始 disabled', async () => {
    renderPage();

    // 标题
    await waitFor(() => {
      expect(screen.getByTestId('scene-edit-title')).toHaveTextContent('开馆模式');
    });

    // KPI strip
    const kpi = screen.getByTestId('scene-kpi-strip');
    expect(kpi).toBeInTheDocument();
    expect(screen.getByText('动作总数')).toBeInTheDocument();
    // KPI value 区域含 "1 步"（用 within 收窄 scope）
    expect(kpi).toHaveTextContent(/1\s*步/);

    // 基本信息卡 + name 字段
    expect(screen.getByTestId('scene-basic-info-card')).toBeInTheDocument();
    expect(screen.getByTestId('scene-basic-name')).toHaveValue('开馆模式');

    // 动作列表卡
    expect(screen.getByTestId('scene-edit-action-list-card')).toBeInTheDocument();
    expect(screen.getByTestId('action-step-list-editor')).toBeInTheDocument();

    // 初始 Save 按钮 disabled
    const saveBtn = screen.getByTestId('scene-edit-save').closest('button');
    expect(saveBtn).toBeDisabled();
  });

  it('点 + 设备动作 → dirty + Save 按钮可用', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('scene-edit-title')).toHaveTextContent('开馆模式');
    });

    // 点击底部"+ 设备动作"按钮
    fireEvent.click(screen.getByTestId('action-step-add-device'));

    // dirty tag 显示
    await waitFor(() => {
      expect(screen.getByTestId('scene-edit-dirty')).toBeInTheDocument();
    });

    // Save 按钮启用
    const saveBtn = screen.getByTestId('scene-edit-save').closest('button');
    expect(saveBtn).not.toBeDisabled();
  });

  it('左 sidebar 列出场景 + 当前激活高亮', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('scene-edit-sidebar-item-42')).toBeInTheDocument();
    });

    expect(screen.getByTestId('scene-edit-sidebar-item-43')).toBeInTheDocument();
    // 当前激活项含 primary 边框（视觉态）—— 通过 inline style 检测
    const active = screen.getByTestId('scene-edit-sidebar-item-42');
    expect(active.style.borderColor).toContain('primary');
  });
});
