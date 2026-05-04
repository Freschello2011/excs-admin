import { useEffect, useState, useMemo, useRef } from 'react';
import { Tabs, Input, Empty, Spin, Button, Tooltip, Collapse, Tag } from 'antd';
import {
  MenuFoldOutlined, MenuUnfoldOutlined, SearchOutlined,
  ThunderboltOutlined, AppstoreOutlined, PlaySquareOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useDraggable } from '@dnd-kit/core';
import { useQuery } from '@tanstack/react-query';
import { commandApi } from '@/api/command';
import { contentApi } from '@/api/content';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import type {
  ContentListItem,
  SceneListItem,
  DeviceDTO,
  EffectiveCommand,
} from '@/api/gen/client';

/* ==================== DnD data types ==================== */

export interface DragDataDevice {
  type: 'device';
  /** Batch C P21：设备级拖拽，落点直接绑 device_id/device_name */
  deviceId: number;
  deviceName: string;
  command: EffectiveCommand;
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

/* ==================== Tab: Device commands (P21 v2) ==================== */
//
// device-mgmt-v2 P9-C 之后改用 effective-commands 数据源：
// 折叠面板 (Collapse) 每展厅设备一栏，展开时懒查 /devices/:id/effective-commands；
// 搜索跨设备名 / 命令 name / code / category 模糊匹配。

interface DeviceCommandPanelProps {
  device: DeviceDTO;
  search: string;
  active: boolean;
}

function DeviceCommandPanelBody({ device, search, active }: DeviceCommandPanelProps) {
  const { data: commands, isLoading } = useQuery({
    queryKey: queryKeys.effectiveCommands(device.id),
    queryFn: () => hallApi.getEffectiveCommands(device.id),
    select: (res) => res.data.data,
    enabled: active && device.id > 0,
  });

  /** 跨设备搜索时 panel 头侧也匹配，所以这里是命令级二次过滤（仅命令字段） */
  const filtered = useMemo(() => {
    const list = commands ?? [];
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter((c) =>
      c.name.toLowerCase().includes(q)
      || c.code.toLowerCase().includes(q)
      || (c.category ?? '').toLowerCase().includes(q),
    );
  }, [commands, search]);

  /** 按 category 二级分组（参考 DeviceCommandActionRow） */
  const grouped = useMemo(() => {
    const map = new Map<string, EffectiveCommand[]>();
    for (const c of filtered) {
      const key = c.category || '其他';
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  if (!active) return null;
  if (isLoading) return <Spin size="small" style={{ display: 'block', margin: '12px auto' }} />;

  // 空态：raw_transport 设备没 inline_commands → 链到设备调试台
  if ((commands ?? []).length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <span style={{ fontSize: 11 }}>
            暂无可拖命令。
            <br />
            <Link to={`/halls/${device.hall_id}`}>前往设备调试台配置 inline 命令</Link>
          </span>
        }
        style={{ margin: '8px 0' }}
      />
    );
  }

  if (filtered.length === 0) {
    return (
      <div style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary)', padding: 8 }}>
        无匹配命令
      </div>
    );
  }

  return (
    <div>
      {grouped.map(([category, cmds]) => (
        <div key={category} style={{ marginBottom: 8 }}>
          <div
            style={{
              fontSize: 10,
              color: 'var(--ant-color-text-tertiary)',
              padding: '2px 4px',
              fontWeight: 500,
              letterSpacing: 0.5,
            }}
          >
            {category}
          </div>
          {cmds.map((c) => (
            <DraggableCard
              key={`device-${device.id}-cmd-${c.code}`}
              id={`device-${device.id}-cmd-${c.code}`}
              data={{ type: 'device', deviceId: device.id, deviceName: device.name, command: c }}
              label={c.name}
              sub={c.code}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function DeviceCommandsTab({ hallId, search }: { hallId: number; search: string }) {
  const { data: devices, isLoading } = useQuery({
    queryKey: queryKeys.devices({ hall_id: hallId }),
    queryFn: () => hallApi.getDevices({ hall_id: hallId }),
    select: (res) => res.data.data,
    enabled: hallId > 0,
  });

  const [activeKeys, setActiveKeys] = useState<string[]>([]);
  /** 搜索前用户手动展开的 keys，搜索清空时还原 */
  const preSearchKeysRef = useRef<string[] | null>(null);

  const filteredDevices = useMemo(() => devices ?? [], [devices]);

  // 搜索时自动展开全部以便跨设备过滤；搜索清空时还原原状态
  useEffect(() => {
    if (search && filteredDevices.length > 0) {
      if (preSearchKeysRef.current == null) {
        preSearchKeysRef.current = activeKeys;
      }
      setActiveKeys(filteredDevices.map((d) => `dev-${d.id}`));
    } else if (!search && preSearchKeysRef.current != null) {
      setActiveKeys(preSearchKeysRef.current);
      preSearchKeysRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filteredDevices]);

  if (isLoading) return <Spin size="small" style={{ display: 'block', margin: '24px auto' }} />;
  if (filteredDevices.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该展厅暂无设备" />;
  }

  return (
    <Collapse
      ghost
      size="small"
      activeKey={activeKeys}
      onChange={(keys) => setActiveKeys(Array.isArray(keys) ? keys : [keys])}
      items={filteredDevices.map((device) => {
        const key = `dev-${device.id}`;
        const isActive = activeKeys.includes(key);
        return {
          key,
          label: (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, minWidth: 0 }}>
              <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {device.name}
              </span>
              {device.connector_kind && (
                <Tag style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>
                  {device.connector_kind}
                </Tag>
              )}
              {device.exhibit_name && (
                <span style={{ fontSize: 10, color: 'var(--ant-color-text-quaternary)' }}>
                  {device.exhibit_name}
                </span>
              )}
            </div>
          ),
          children: <DeviceCommandPanelBody device={device} search={search} active={isActive} />,
        };
      })}
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
              children: <DeviceCommandsTab hallId={hallId} search={search} />,
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
