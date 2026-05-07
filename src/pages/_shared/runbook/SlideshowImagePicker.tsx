/**
 * <SlideshowImagePicker> — slideshow_goto 意图配套 Modal
 *
 * SSOT：admin-UI §4.20.1 行 847；mockup M1 line 1046-1129（ContentPicker Modal 子模板）
 *
 * 行为：
 *   - 调 contentApi.getSlideshowConfig(exhibitId) 拉 SlideshowConfig
 *   - 对 image_content_ids[] 并发 contentApi.getContent(id) 拿 thumbnail_url + name
 *   - 网格渲染缩略图 · 顶部「第 N 张」(1-based) badge · 选中蓝描边 + check 角标
 *   - 返回 0-based index 给上层；UI 显示 1-based "第 N 张"
 *   - 展项未配置图文汇报 → 空态 + 链接 "/halls/:hallId/exhibits/:exhibitId?tab=slideshow"
 *
 * 父组件用法：受控 open；onSelect 回调返回 0-based int（即 SlideshowConfig.image_content_ids[index]
 * 对应的下标），由父组件写入 ActionStep.content_params.index。
 */

import { useMemo } from 'react';
import { Modal, Empty, Spin, Alert } from 'antd';
import { CheckCircleFilled, FileImageOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { contentApi } from '@/api/content';
import { queryKeys } from '@/api/queryKeys';
import type { ContentDetailDTO, SlideshowConfig } from '@/api/gen/client';

interface Props {
  open: boolean;
  exhibitId: number;
  hallId: number;
  /** 当前已选 0-based index；空 = 未选 */
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onCancel: () => void;
}

export default function SlideshowImagePicker({
  open,
  exhibitId,
  hallId,
  selectedIndex,
  onSelect,
  onCancel,
}: Props) {
  const cfgQuery = useQuery({
    queryKey: queryKeys.slideshowConfig(exhibitId),
    queryFn: () => contentApi.getSlideshowConfig(exhibitId).then((r) => r.data.data),
    enabled: open && exhibitId > 0,
  });

  const config: SlideshowConfig | null = (cfgQuery.data ?? null) as SlideshowConfig | null;
  const imageIds: number[] = config?.image_content_ids ?? [];

  const detailsQuery = useQuery({
    queryKey: ['exhibit', exhibitId, 'slideshow', 'image-details', imageIds],
    queryFn: async () => {
      const arr = await Promise.all(
        imageIds.map((id) =>
          contentApi.getContent(id).then((r) => r.data.data as ContentDetailDTO),
        ),
      );
      return arr;
    },
    enabled: open && imageIds.length > 0,
  });

  const items = useMemo(() => detailsQuery.data ?? [], [detailsQuery.data]);

  const isLoading = cfgQuery.isLoading || detailsQuery.isLoading;
  const isEmpty = !isLoading && !cfgQuery.error && (!config || imageIds.length === 0);

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      onOk={onCancel /* OK 不暴露：双击 grid item 即选中 */}
      title="选择图文汇报前景图"
      footer={null}
      width={760}
      destroyOnHidden
      data-testid="slideshow-image-picker-modal"
    >
      {cfgQuery.error && (
        <Alert
          type="error"
          showIcon
          title="拉取图文汇报配置失败"
          description={String(cfgQuery.error)}
          style={{ marginBottom: 12 }}
        />
      )}

      {isLoading && (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Spin />
        </div>
      )}

      {isEmpty && (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <div>
              <div style={{ marginBottom: 8 }}>该展项尚未配置图文汇报</div>
              <Link
                to={`/halls/${hallId}/exhibits/${exhibitId}?tab=slideshow`}
                onClick={onCancel}
                data-testid="slideshow-empty-link"
              >
                前往「展项详情 › 图文汇报 Tab」配置 →
              </Link>
            </div>
          }
        />
      )}

      {!isLoading && !isEmpty && items.length > 0 && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 12,
              maxHeight: 520,
              overflowY: 'auto',
              padding: 4,
            }}
            data-testid="slideshow-image-grid"
          >
            {items.map((item, index) => {
              const isSelected = selectedIndex === index;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(index)}
                  data-testid={`slideshow-image-item-${index}`}
                  data-selected={isSelected ? 'true' : 'false'}
                  style={{
                    position: 'relative',
                    cursor: 'pointer',
                    border: `2px solid ${
                      isSelected ? 'var(--ant-color-info)' : 'var(--ant-color-border-secondary)'
                    }`,
                    borderRadius: 10,
                    overflow: 'hidden',
                    background: 'var(--ant-color-bg-container)',
                    padding: 0,
                    textAlign: 'left',
                    boxShadow: isSelected
                      ? '0 0 0 3px var(--ant-color-info-bg)'
                      : 'none',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '16 / 9',
                      background: 'var(--ant-color-fill-quaternary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--ant-color-text-tertiary)',
                      fontSize: 24,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      backgroundImage: item.thumbnail_url
                        ? `url("${item.thumbnail_url}")`
                        : undefined,
                    }}
                  >
                    {!item.thumbnail_url && <FileImageOutlined />}
                  </div>
                  <div
                    style={{
                      position: 'absolute',
                      top: 6,
                      left: 6,
                      background: 'var(--ant-color-info)',
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 999,
                    }}
                  >
                    第 {index + 1} 张
                  </div>
                  {isSelected && (
                    <CheckCircleFilled
                      style={{
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        color: 'var(--ant-color-info)',
                        fontSize: 22,
                        background: '#fff',
                        borderRadius: '50%',
                      }}
                    />
                  )}
                  <div
                    style={{
                      padding: '8px 10px',
                      fontSize: 12,
                      lineHeight: 1.4,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {item.name}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--ant-color-text-tertiary)',
                        marginTop: 2,
                      }}
                    >
                      第 {index + 1} / {imageIds.length} 张前景图
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <Alert
            type="info"
            showIcon
            style={{ marginTop: 12 }}
            title={
              <span style={{ fontSize: 12 }}>
                要修改图文汇报本身（背景视频 / 前景图列表 / 过渡），到{' '}
                <Link
                  to={`/halls/${hallId}/exhibits/${exhibitId}?tab=slideshow`}
                  onClick={onCancel}
                >
                  展项详情 › 图文汇报 Tab
                </Link>{' '}
                配置。
              </span>
            }
          />
        </>
      )}
    </Modal>
  );
}
