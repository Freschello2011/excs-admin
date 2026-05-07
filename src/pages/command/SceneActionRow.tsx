import { useMemo } from 'react';
import { Alert, Button, Card, Input, Select, Space, Tag } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import WidgetRenderer from '@/components/device-catalog/WidgetRenderer';
import type { DeviceListItem, EffectiveCommand } from '@/api/gen/client';
import type { SceneAction } from '@/api/gen/client';
import type { ParamsSchemaProperty } from '@/types/deviceCatalog';

interface ParamsSchemaShape {
  type?: 'object';
  required?: string[];
  properties?: Record<string, ParamsSchemaProperty>;
}

interface Props {
  action: SceneAction;
  index: number;
  devices: DeviceListItem[];
  onChange: (patch: Partial<SceneAction>) => void;
  onRemove: () => void;
}

export default function SceneActionRow({ action, devices, onChange, onRemove }: Props) {
  const deviceOptions = useMemo(
    () =>
      devices.map((d) => ({
        value: d.id,
        label: d.name,
      })),
    [devices],
  );

  const { data: commands } = useQuery({
    queryKey: queryKeys.effectiveCommands(action.device_id || 0),
    queryFn: () => hallApi.getEffectiveCommands(action.device_id),
    select: (res) => res.data.data,
    enabled: !!action.device_id && action.device_id > 0,
  });

  const selectedCommand = useMemo(
    () => (commands ?? []).find((c) => c.code === action.command),
    [commands, action.command],
  );

  const isDirtyCommand =
    !!action.command && !!commands && commands.length > 0 && !selectedCommand;

  const commandOptions = useMemo(() => {
    const list = commands ?? [];
    const byCategory = new Map<string, EffectiveCommand[]>();
    for (const c of list) {
      const key = c.category || '其他';
      const arr = byCategory.get(key) ?? [];
      arr.push(c);
      byCategory.set(key, arr);
    }
    const groups = Array.from(byCategory.entries()).map(([cat, cmds]) => ({
      label: cat,
      options: cmds.map((c) => ({
        value: c.code,
        label: (
          <span>
            {c.icon && (
              <span
                style={{
                  color: 'var(--ant-color-text-tertiary)',
                  fontFamily: 'monospace',
                  fontSize: 11,
                  marginRight: 6,
                }}
              >
                [{c.icon}]
              </span>
            )}
            {c.name}
            <span
              style={{
                color: 'var(--ant-color-text-quaternary)',
                marginLeft: 6,
                fontSize: 11,
              }}
            >
              {c.code}
            </span>
          </span>
        ),
      })),
    }));
    if (isDirtyCommand) {
      groups.unshift({
        label: '已失效',
        options: [
          {
            value: action.command,
            label: (
              <span style={{ color: 'var(--ant-color-error)' }}>
                ⚠ {action.command}（命令不存在）
              </span>
            ),
          },
        ],
      });
    }
    return groups;
  }, [commands, isDirtyCommand, action.command]);

  const paramsSchema = (selectedCommand?.params_schema ?? null) as unknown as ParamsSchemaShape | null;
  const paramsProps = paramsSchema?.properties ?? {};
  const paramsKeys = Object.keys(paramsProps);

  return (
    <Card
      size="small"
      style={{ marginBottom: 8 }}
      extra={
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={onRemove}
          size="small"
        />
      }
    >
      <Space wrap style={{ width: '100%' }}>
        <Select
          style={{ width: 220 }}
          placeholder="选择设备"
          value={action.device_id || undefined}
          onChange={(v) => onChange({ device_id: v as number, command: '', params: {} })}
          options={deviceOptions}
          showSearch
          optionFilterProp="label"
        />
        <Select
          style={{ width: 260 }}
          placeholder={action.device_id ? '选择命令' : '先选设备'}
          value={action.command || undefined}
          onChange={(v) => onChange({ command: v as string, params: {} })}
          options={commandOptions}
          disabled={!action.device_id}
          showSearch
          optionFilterProp="value"
          popupMatchSelectWidth={320}
        />
        {selectedCommand && (
          <Tag color={sourceColor(selectedCommand.source)}>{selectedCommand.source}</Tag>
        )}
      </Space>

      {isDirtyCommand && (
        <Alert
          type="error"
          showIcon
          style={{ marginTop: 8 }}
          message="该命令不存在，请重新选择"
        />
      )}

      {action.command && !isDirtyCommand && (
        <div style={{ marginTop: 8 }}>
          {paramsKeys.length > 0 ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 10,
              }}
            >
              {paramsKeys.map((key) => {
                const p = paramsProps[key];
                const required = (paramsSchema?.required ?? []).includes(key);
                return (
                  <div key={key}>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--ant-color-text-secondary)',
                        marginBottom: 4,
                      }}
                    >
                      {p.title ?? key}
                      {required && (
                        <span style={{ color: 'var(--ant-color-error)', marginLeft: 4 }}>*</span>
                      )}
                      <span
                        style={{
                          color: 'var(--ant-color-text-tertiary)',
                          marginLeft: 6,
                          fontSize: 11,
                        }}
                      >
                        {key} · {p.type}
                      </span>
                    </div>
                    <WidgetRenderer
                      schema={p}
                      value={action.params?.[key]}
                      onChange={(v) =>
                        onChange({ params: { ...(action.params ?? {}), [key]: v } })
                      }
                      size="small"
                    />
                  </div>
                );
              })}
            </div>
          ) : selectedCommand ? (
            <div style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 12 }}>
              该命令无参数
            </div>
          ) : (
            <Input
              placeholder='参数 JSON，如 {"brightness":80}'
              value={
                JSON.stringify(action.params) === '{}' ? '' : JSON.stringify(action.params)
              }
              onChange={(e) => {
                try {
                  const parsed = e.target.value ? JSON.parse(e.target.value) : {};
                  onChange({ params: parsed });
                } catch {
                  /* allow typing invalid JSON temporarily */
                }
              }}
            />
          )}
        </div>
      )}
    </Card>
  );
}

function sourceColor(source: EffectiveCommand['source']): string {
  switch (source) {
    case 'baseline':
      return 'blue';
    case 'model':
      return 'geekblue';
    case 'override':
      return 'orange';
    default:
      return 'default';
  }
}
