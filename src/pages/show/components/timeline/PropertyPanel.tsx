import { useEffect, useMemo, useCallback } from 'react';
import { Form, Input, InputNumber, Select, Tag, Empty } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { hallApi } from '@/api/hall';
import { commandApi } from '@/api/command';
import { queryKeys } from '@/api/queryKeys';
import type { ShowAction, ActionType } from '@/api/gen/client';

/* ==================== Constants ==================== */

const ACTION_TYPE_OPTIONS: { label: string; value: ActionType }[] = [
  { label: '设备命令', value: 'device' },
  { label: '场景', value: 'scene' },
  { label: '媒体播放', value: 'media' },
];

/* ==================== Props ==================== */

interface PropertyPanelProps {
  action: ShowAction | null;
  hallId: number;
  onChange: (actionId: number, patch: Partial<ShowAction>) => void;
}

/* ==================== Component ==================== */

export default function PropertyPanel({ action, hallId, onChange }: PropertyPanelProps) {
  const [form] = Form.useForm();

  /* ── Sync form when selection changes ── */
  useEffect(() => {
    if (action) {
      form.setFieldsValue({
        name: action.name,
        action_type: action.action_type,
        device_id: action.device_id,
        command: action.command,
        start_time_ms: action.start_time_ms,
        duration_ms: action.duration_ms,
        params_json: JSON.stringify(action.params ?? {}, null, 2),
      });
    } else {
      form.resetFields();
    }
  }, [action, form]);

  /* ── Device list for hall ── */
  const { data: devices } = useQuery({
    queryKey: queryKeys.devices({ hall_id: hallId }),
    queryFn: () => hallApi.getDevices({ hall_id: hallId }),
    select: (res) => res.data.data,
    enabled: hallId > 0,
  });

  const deviceOptions = useMemo(() =>
    (devices ?? []).map((d) => ({
      label: `${d.name} (${d.subcategory_name ?? d.subcategory_code ?? '设备'})`,
      value: d.id,
    })),
  [devices]);

  /* ── Effective commands for selected device ── */
  const selectedDeviceId = Form.useWatch('device_id', form);

  const { data: commands } = useQuery({
    queryKey: queryKeys.effectiveCommands(selectedDeviceId ?? 0),
    queryFn: () => hallApi.getEffectiveCommands(selectedDeviceId!),
    select: (res) => res.data.data,
    enabled: !!selectedDeviceId && selectedDeviceId > 0,
  });

  const commandOptions = useMemo(() =>
    (commands ?? []).map((c) => ({
      label: `${c.name} (${c.code})`,
      value: c.code,
    })),
  [commands]);

  /* ── Scene list for hall (when action_type = 'scene') ── */
  const selectedActionType = Form.useWatch('action_type', form);

  const { data: scenes } = useQuery({
    queryKey: queryKeys.scenes(hallId),
    queryFn: () => commandApi.getScenes(hallId),
    select: (res) => res.data.data,
    enabled: hallId > 0 && selectedActionType === 'scene',
  });

  const sceneOptions = useMemo(() =>
    (scenes ?? []).map((s) => ({
      label: s.name,
      value: String(s.id),
    })),
  [scenes]);

  /* ── Field change handler ── */
  const handleValuesChange = useCallback((changed: Record<string, unknown>) => {
    if (!action) return;
    const patch: Partial<ShowAction> = {};

    if ('name' in changed) patch.name = changed.name as string;
    if ('action_type' in changed) patch.action_type = changed.action_type as ActionType;
    if ('device_id' in changed) patch.device_id = (changed.device_id as number) ?? null;
    if ('command' in changed) patch.command = changed.command as string;
    if ('start_time_ms' in changed) patch.start_time_ms = changed.start_time_ms as number;
    if ('duration_ms' in changed) patch.duration_ms = changed.duration_ms as number;
    if ('params_json' in changed) {
      try {
        patch.params = JSON.parse(changed.params_json as string);
      } catch { /* ignore invalid json while typing */ }
    }

    if (Object.keys(patch).length > 0) {
      onChange(action.id, patch);
    }
  }, [action, onChange]);

  /* ── Empty state ── */
  if (!action) {
    return (
      <div style={{
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--ant-color-text-quaternary)', fontSize: 13,
      }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择一个动作以编辑属性" />
      </div>
    );
  }

  return (
    <div style={{ padding: '10px 12px', overflow: 'auto', height: '100%' }}>
      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>动作属性</span>
        <Tag>{action.id > 0 ? `#${action.id}` : '新建'}</Tag>
      </div>

      <Form
        form={form}
        layout="vertical"
        size="small"
        onValuesChange={handleValuesChange}
        style={{ gap: 0 }}
      >
        <div style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>基本信息</div>

        <Form.Item label="名称" name="name" style={{ marginBottom: 8 }}>
          <Input placeholder="动作名称" />
        </Form.Item>

        <Form.Item label="类型" name="action_type" style={{ marginBottom: 8 }}>
          <Select options={ACTION_TYPE_OPTIONS} />
        </Form.Item>

        {selectedActionType !== 'scene' && (
          <Form.Item label="设备" name="device_id" style={{ marginBottom: 8 }}>
            <Select
              options={deviceOptions}
              placeholder="选择设备"
              allowClear
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
        )}

        {selectedActionType === 'scene' ? (
          <Form.Item label="场景" name="command" style={{ marginBottom: 8 }}>
            <Select
              options={sceneOptions}
              placeholder="选择场景"
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
        ) : (
          <Form.Item label="命令" name="command" style={{ marginBottom: 8 }}>
            {commandOptions.length > 0 ? (
              <Select
                options={commandOptions}
                placeholder="选择命令"
                showSearch
                optionFilterProp="label"
              />
            ) : (
              <Input placeholder="命令代码" />
            )}
          </Form.Item>
        )}

        <div style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary)', margin: '4px 0', textTransform: 'uppercase', letterSpacing: 0.5 }}>时间</div>

        <Form.Item label="开始(ms)" name="start_time_ms" style={{ marginBottom: 8 }}>
          <InputNumber min={0} step={100} style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item label="时长(ms)" name="duration_ms" style={{ marginBottom: 8 }}>
          <InputNumber min={100} step={100} style={{ width: '100%' }} />
        </Form.Item>

        <div style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary)', margin: '4px 0', textTransform: 'uppercase', letterSpacing: 0.5 }}>参数</div>

        <Form.Item label="参数 JSON" name="params_json" style={{ marginBottom: 0 }}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} style={{ fontFamily: 'monospace', fontSize: 11 }} />
        </Form.Item>
      </Form>
    </div>
  );
}
