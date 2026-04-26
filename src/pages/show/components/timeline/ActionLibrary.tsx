import { useState, useMemo } from 'react';
import { Tabs, Input, Collapse, Tag, Empty, Spin, Button, Tooltip } from 'antd';
import {
  MenuFoldOutlined, MenuUnfoldOutlined, SearchOutlined,
  ThunderboltOutlined, AppstoreOutlined, PlaySquareOutlined,
} from '@ant-design/icons';
import { useDraggable } from '@dnd-kit/core';
import { useQueries, useQuery } from '@tanstack/react-query';
import { deviceModelApi } from '@/api/deviceModel';
import { commandApi } from '@/api/command';
import { contentApi } from '@/api/content';
import { queryKeys } from '@/api/queryKeys';
import type {
  ContentListItem,
  DeviceModelDetail,
  DeviceModelListItem,
  ProtocolCommand,
  SceneListItem,
} from '@/api/gen/client';

/* ==================== DnD data types ==================== */

export interface DragDataDevice {
  type: 'device';
  /** 型号 subcategory code（如 projector / k32_relay）— 后端按需使用 */
  deviceType: string;
  command: ProtocolCommand;
}

export interface DragDataScene {
  type: 'scene';
  scene: SceneListItem;
}

export interface DragDataMedia {
  type: 'media';
  content: ContentListItem;
}

export type DragData = DragDataDevice | DragDataScene | DragDataMedia;

/* ==================== Draggable card ==================== */

function DraggableCard({ id, data, label, sub }: {
  id: string;
  data: DragData;
  label: string;
  sub?: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        padding: '6px 8px',
        marginBottom: 4,
        borderRadius: 4,
        background: isDragging ? 'var(--ant-color-primary-bg)' : 'var(--ant-color-bg-container)',
        border: `1px solid ${isDragging ? 'var(--ant-color-primary)' : 'var(--ant-color-border)'}`,
        cursor: 'grab',
        opacity: isDragging ? 0.5 : 1,
        fontSize: 12,
        userSelect: 'none',
      }}
    >
      <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: 'var(--ant-color-text-tertiary)', marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

/* ==================== Tab: Device commands (by device model) ==================== */

function DeviceCommandsTab({ search }: { search: string }) {
  // 1. 拉型号列表（仅 active）
  const { data: modelList, isLoading: listLoading } = useQuery({
    queryKey: queryKeys.deviceModels({ status: 'active', page: 1, page_size: 200 }),
    queryFn: () => deviceModelApi.list({ status: 'active', page: 1, page_size: 200 }),
    select: (res): DeviceModelListItem[] => res.data.data?.list ?? [],
  });

  // 2. 并行拉每个型号的详情以取 commands
  const detailQueries = useQueries({
    queries: (modelList ?? []).map((m) => ({
      queryKey: queryKeys.deviceModelDetail(m.id),
      queryFn: () => deviceModelApi.get(m.id),
      select: (res: { data: { data: DeviceModelDetail } }) => res.data.data,
      enabled: !!modelList,
    })),
  });

  const detailsLoading = detailQueries.some((q) => q.isLoading);
  const isLoading = listLoading || detailsLoading;

  const filtered = useMemo(() => {
    if (!modelList) return [];
    const q = search.toLowerCase();
    return modelList
      .map((m, idx) => {
        const detail = detailQueries[idx]?.data;
        const commands = detail?.commands ?? [];
        const subcategoryCode = m.subcategory_code;
        return {
          id: m.id,
          subcategoryCode,
          subcategoryName: m.subcategory_name,
          brandName: m.brand_name,
          name: m.name,
          commands: commands.filter((cmd) =>
            !q || cmd.name.toLowerCase().includes(q) || cmd.code.toLowerCase().includes(q)
              || m.name.toLowerCase().includes(q) || m.brand_name.toLowerCase().includes(q),
          ),
        };
      })
      .filter((g) => g.commands.length > 0);
  }, [modelList, detailQueries, search]);

  if (isLoading) return <Spin size="small" style={{ display: 'block', margin: '24px auto' }} />;
  if (filtered.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无设备命令" />;

  return (
    <Collapse
      size="small"
      defaultActiveKey={filtered.map((t) => String(t.id))}
      items={filtered.map((g) => ({
        key: String(g.id),
        label: (
          <span>
            <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', marginRight: 4 }}>
              {g.subcategoryName}
            </Tag>
            {g.brandName} · {g.name}
          </span>
        ),
        children: (
          <div>
            {g.commands.map((cmd, idx) => (
              <DraggableCard
                key={`model-${g.id}-${cmd.code}-${idx}`}
                id={`device-${g.id}-${cmd.code}-${idx}`}
                data={{ type: 'device', deviceType: g.subcategoryCode, command: cmd }}
                label={cmd.name}
                sub={cmd.code}
              />
            ))}
          </div>
        ),
      }))}
      style={{ background: 'transparent' }}
    />
  );
}

/* ==================== Tab: Scenes ==================== */

function ScenesTab({ hallId, search }: { hallId: number; search: string }) {
  const { data: scenes, isLoading } = useQuery({
    queryKey: queryKeys.scenes(hallId),
    queryFn: () => commandApi.getScenes(hallId),
    select: (res) => res.data.data,
    enabled: hallId > 0,
  });

  const filtered = useMemo(() => {
    if (!scenes) return [];
    const q = search.toLowerCase();
    return q ? scenes.filter((s: SceneListItem) => s.name.toLowerCase().includes(q)) : scenes;
  }, [scenes, search]);

  if (isLoading) return <Spin size="small" style={{ display: 'block', margin: '24px auto' }} />;
  if (filtered.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无场景" />;

  return (
    <div>
      {filtered.map((scene: SceneListItem) => (
        <DraggableCard
          key={`scene-${scene.id}`}
          id={`scene-${scene.id}`}
          data={{ type: 'scene', scene }}
          label={scene.name}
          sub={`${scene.action_count} 个设备动作`}
        />
      ))}
    </div>
  );
}

/* ==================== Tab: Media ==================== */

function MediaTab({ hallId, search }: { hallId: number; search: string }) {
  const { data: contents, isLoading } = useQuery({
    queryKey: queryKeys.contents({ hall_id: hallId, page: 1, page_size: 200, status: 'ready' }),
    queryFn: () => contentApi.listContents({ hall_id: hallId, page: 1, page_size: 200, status: 'ready' }),
    select: (res) => res.data.data?.list ?? [],
    enabled: hallId > 0,
  });

  const filtered = useMemo(() => {
    if (!contents) return [];
    const q = search.toLowerCase();
    const mediaItems = (contents as ContentListItem[]).filter((c) =>
      c.type === 'video' || c.type === 'audio',
    );
    return q ? mediaItems.filter((c) => c.name.toLowerCase().includes(q)) : mediaItems;
  }, [contents, search]);

  if (isLoading) return <Spin size="small" style={{ display: 'block', margin: '24px auto' }} />;
  if (filtered.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无媒体" />;

  return (
    <div>
      {filtered.map((item: ContentListItem) => (
        <DraggableCard
          key={`media-${item.id}`}
          id={`media-${item.id}`}
          data={{ type: 'media', content: item }}
          label={item.name}
          sub={`${item.type} · ${(item.duration_ms / 1000).toFixed(1)}s`}
        />
      ))}
    </div>
  );
}

/* ==================== Main ActionLibrary ==================== */

interface ActionLibraryProps {
  hallId: number;
}

export default function ActionLibrary({ hallId }: ActionLibraryProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState('');

  if (collapsed) {
    return (
      <div style={{
        width: 36, flexShrink: 0,
        borderRight: '1px solid var(--ant-color-border-secondary)',
        background: 'var(--ant-color-bg-layout)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingTop: 8,
      }}>
        <Tooltip title="展开动作库" placement="right">
          <Button
            type="text" size="small"
            icon={<MenuUnfoldOutlined />}
            onClick={() => setCollapsed(false)}
          />
        </Tooltip>
      </div>
    );
  }

  return (
    <div style={{
      width: 240, flexShrink: 0,
      borderRight: '1px solid var(--ant-color-border-secondary)',
      background: 'var(--ant-color-bg-layout)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 8px 4px',
        borderBottom: '1px solid var(--ant-color-border)',
      }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>动作库</span>
        <Tooltip title="收起">
          <Button
            type="text" size="small"
            icon={<MenuFoldOutlined />}
            onClick={() => setCollapsed(true)}
          />
        </Tooltip>
      </div>

      {/* Search */}
      <div style={{ padding: '8px 8px 4px' }}>
        <Input
          size="small"
          placeholder="搜索..."
          prefix={<SearchOutlined style={{ color: 'var(--ant-color-text-quaternary)' }} />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
        />
      </div>

      {/* Tabs */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 8px 8px' }}>
        <Tabs
          size="small"
          defaultActiveKey="device"
          items={[
            {
              key: 'device',
              label: <span><ThunderboltOutlined /> 设备命令</span>,
              children: <DeviceCommandsTab search={search} />,
            },
            {
              key: 'scene',
              label: <span><AppstoreOutlined /> 场景</span>,
              children: <ScenesTab hallId={hallId} search={search} />,
            },
            {
              key: 'media',
              label: <span><PlaySquareOutlined /> 媒体</span>,
              children: <MediaTab hallId={hallId} search={search} />,
            },
          ]}
        />
      </div>
    </div>
  );
}
