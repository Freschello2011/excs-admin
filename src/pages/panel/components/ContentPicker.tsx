/**
 * <ContentPicker> — 数字内容选择 Modal（play_video / show_screen_image 共用）
 *
 * S5-9（ADR-0020-v2 Stage 5 admin Phase C · admin-UI §4.20.6）。
 *
 * 数据源：contentApi.listContents({ hall_id, exhibit_id })，客户端按 type 过滤。
 *   - mode='play_video'        → 过滤 type ∈ {'video', 'fusion-video'}
 *   - mode='show_screen_image' → 过滤 type === 'image'
 *
 * 通过 ActionStepListEditor 的 onSelectContent prop 注入：
 *   onSelectContent: (intent, exhibitId, currentContentId) => Promise<number | null>
 *
 * cancel 返回 null；choose 返回 content_id (number)。
 */
import { useMemo, useState } from 'react';
import { Modal, Empty, Spin, Input, Tag, Space, Tooltip } from 'antd';
import {
  PlayCircleOutlined,
  PictureOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { contentApi } from '@/api/content';
import { queryKeys } from '@/api/queryKeys';
import type { ContentDetailDTO } from '@/api/gen/client';

export type ContentPickerMode = 'play_video' | 'show_screen_image';

interface Props {
  open: boolean;
  mode: ContentPickerMode;
  hallId: number;
  exhibitId: number;
  /** 已选 content_id，弹出时高亮 */
  currentContentId: number | null;
  onSelect: (contentId: number) => void;
  onCancel: () => void;
}

const VIDEO_TYPES = new Set(['video', 'fusion-video']);

export default function ContentPicker(props: Props) {
  // host 每次 open 用新 key 强制 remount，避免在 effect 里 reset state（react-hooks/set-state-in-effect）
  if (!props.open) return null;
  return <ContentPickerInner key={`${props.exhibitId}:${props.mode}`} {...props} />;
}

function ContentPickerInner({
  open,
  mode,
  hallId,
  exhibitId,
  currentContentId,
  onSelect,
  onCancel,
}: Props) {
  const [keyword, setKeyword] = useState('');
  const [picked, setPicked] = useState<number | null>(currentContentId);

  const listQuery = useQuery({
    queryKey: queryKeys.contents({
      hall_id: hallId,
      exhibit_id: exhibitId,
    } as Record<string, unknown>),
    queryFn: () =>
      contentApi.listContents({
        hall_id: hallId,
        exhibit_id: exhibitId,
        page: 1,
        page_size: 200,
      }),
    select: (res) => res.data.data?.list ?? [],
    enabled: open && hallId > 0 && exhibitId > 0,
  });

  const filtered = useMemo(() => {
    const list = (listQuery.data ?? []) as ContentDetailDTO[];
    const kw = keyword.trim().toLowerCase();
    return list.filter((c) => {
      const typeMatch =
        mode === 'play_video'
          ? VIDEO_TYPES.has(c.type)
          : c.type === 'image';
      if (!typeMatch) return false;
      if (kw && !c.name.toLowerCase().includes(kw)) return false;
      return c.pipeline_status === 'ready' || c.status === 'bound';
    });
  }, [listQuery.data, mode, keyword]);

  const isVideo = mode === 'play_video';

  return (
    <Modal
      open={open}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {isVideo ? <PlayCircleOutlined /> : <PictureOutlined />}
          {isVideo ? '选择视频' : '选择守屏图'}
          <Tag style={{ marginLeft: 8 }}>展项 #{exhibitId}</Tag>
        </span>
      }
      width={720}
      okText="确认选择"
      okButtonProps={{
        disabled: picked == null || picked === currentContentId,
      }}
      onOk={() => {
        if (picked != null) onSelect(picked);
      }}
      onCancel={onCancel}
      destroyOnHidden
      data-testid="content-picker-modal"
    >
      <Input
        prefix={<SearchOutlined />}
        placeholder="搜索内容名"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        style={{ marginBottom: 12 }}
        data-testid="content-picker-search"
      />

      {listQuery.isLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : filtered.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            keyword.trim()
              ? `未匹配到「${keyword}」`
              : isVideo
                ? '该展项暂无可用视频（请先在"内容总库"上传并分发）'
                : '该展项暂无可用守屏图'
          }
          style={{ padding: 32 }}
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 10,
            maxHeight: 420,
            overflowY: 'auto',
            padding: 4,
          }}
        >
          {filtered.map((c) => (
            <ContentCard
              key={c.id}
              content={c}
              active={picked === c.id}
              onClick={() => setPicked(c.id)}
            />
          ))}
        </div>
      )}
    </Modal>
  );
}

interface CardProps {
  content: ContentDetailDTO;
  active: boolean;
  onClick: () => void;
}

function ContentCard({ content, active, onClick }: CardProps) {
  const c = content;
  const subBits: string[] = [c.type];
  if (c.duration_ms > 0) {
    subBits.push(formatDuration(c.duration_ms));
  }
  if (c.file_size > 0) {
    subBits.push(formatSize(c.file_size));
  }

  return (
    <button
      type="button"
      data-testid={`content-picker-item-${c.id}`}
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 8,
        border: '1px solid',
        borderColor: active
          ? 'var(--ant-color-primary)'
          : 'var(--ant-color-border-secondary)',
        borderRadius: 10,
        background: active
          ? 'var(--ant-color-primary-bg)'
          : 'var(--ant-color-bg-container)',
        cursor: 'pointer',
        textAlign: 'left',
        font: 'inherit',
        color: 'var(--ant-color-text)',
        boxShadow: active
          ? '0 0 0 3px var(--ant-color-primary-bg-hover)'
          : undefined,
      }}
    >
      <div
        style={{
          height: 86,
          borderRadius: 6,
          background: c.thumbnail_url
            ? `center/cover no-repeat url(${c.thumbnail_url})`
            : 'linear-gradient(135deg, var(--ant-color-fill-secondary), var(--ant-color-fill-tertiary))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--ant-color-text-tertiary)',
        }}
      >
        {!c.thumbnail_url && (c.type === 'image' ? <PictureOutlined /> : <PlayCircleOutlined />)}
      </div>
      <Tooltip title={c.name} placement="top">
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {c.name}
        </div>
      </Tooltip>
      <Space size={4} wrap>
        {subBits.map((b) => (
          <span
            key={b}
            style={{
              fontSize: 11,
              color: 'var(--ant-color-text-tertiary)',
            }}
          >
            {b}
          </span>
        ))}
      </Space>
    </button>
  );
}

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`;
}
