// @vitest-environment jsdom
/**
 * SlideshowImagePicker — 空态 / 列表 / 选中视觉
 *
 * Mock contentApi 直接拦截 getSlideshowConfig + getContent。
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import SlideshowImagePicker from '../SlideshowImagePicker';

vi.mock('@/api/content', () => ({
  contentApi: {
    getSlideshowConfig: vi.fn(),
    getContent: vi.fn(),
  },
}));

import { contentApi } from '@/api/content';

function renderUI(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ConfigProvider>{ui}</ConfigProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const ax = <T,>(data: T) =>
  Promise.resolve({
    data: { code: 0, message: '', data },
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as never,
  });

describe('<SlideshowImagePicker>', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('config=null → 空态 + 跳转链接', async () => {
    (contentApi.getSlideshowConfig as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      ax(null),
    );

    renderUI(
      <SlideshowImagePicker
        open
        exhibitId={42}
        hallId={3}
        selectedIndex={null}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('该展项尚未配置图文汇报')).toBeInTheDocument();
    });
    const link = screen.getByTestId('slideshow-empty-link') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe(
      '/halls/3/exhibits/42?tab=slideshow',
    );
  });

  it('config 有 2 张图 → 网格渲染 + selectedIndex 命中第 1 张视觉态', async () => {
    (contentApi.getSlideshowConfig as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      ax({
        exhibit_id: 42,
        background_content_id: 1,
        image_content_ids: [101, 102],
        transition: 'fade',
      }),
    );
    (contentApi.getContent as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(
        ax({
          id: 101,
          name: '开馆欢迎语.jpg',
          type: 'image',
          thumbnail_url: 'https://oss.example/thumb-101.jpg',
        }),
      )
      .mockReturnValueOnce(
        ax({
          id: 102,
          name: '展厅总览图.jpg',
          type: 'image',
          thumbnail_url: 'https://oss.example/thumb-102.jpg',
        }),
      );

    const onSelect = vi.fn();
    renderUI(
      <SlideshowImagePicker
        open
        exhibitId={42}
        hallId={3}
        selectedIndex={1}
        onSelect={onSelect}
        onCancel={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('slideshow-image-item-0')).toBeInTheDocument();
      expect(screen.getByTestId('slideshow-image-item-1')).toBeInTheDocument();
    });

    expect(screen.getByText('开馆欢迎语.jpg')).toBeInTheDocument();
    expect(screen.getByTestId('slideshow-image-item-1')).toHaveAttribute(
      'data-selected',
      'true',
    );

    fireEvent.click(screen.getByTestId('slideshow-image-item-0'));
    expect(onSelect).toHaveBeenCalledWith(0);
  });
});
