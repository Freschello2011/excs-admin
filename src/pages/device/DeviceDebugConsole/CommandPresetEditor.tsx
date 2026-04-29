/**
 * device-mgmt-v2 P9-C.2 — 指令组（CommandPreset）新增 / 编辑弹窗。
 *
 * 字段 = name + description + command_code + params + expected_channels + expected_state。
 * command_code 必须命中 effective-commands；后端在 PATCH 时二次校验。
 */
import { useEffect, useMemo, useState } from 'react';
import { Form, Input, Modal, Select, Space } from 'antd';
import type { CommandPreset } from '@/api/commandPreset';
import type { components } from '@/api/gen/schema.gen';

type EffectiveCommandDTO = components['schemas']['EffectiveCommandDTO'];

interface Props {
  open: boolean;
  initial?: Partial<CommandPreset> | null;
  defaultExpectedChannels?: number[];
  effectiveCommands: EffectiveCommandDTO[];
  onCancel: () => void;
  onSubmit: (name: string, body: {
    description?: string;
    command_code: string;
    params?: Record<string, unknown>;
    expected_channels?: number[];
    expected_state?: '' | 'on' | 'off' | 'blink';
  }) => Promise<void> | void;
  /** 编辑模式时禁用 name（path 参数已固定） */
  editingExisting?: boolean;
}

const STATE_OPTIONS = [
  { value: '', label: '不校验（仅记录通道）' },
  { value: 'on', label: 'on（应开）' },
  { value: 'off', label: 'off（应关）' },
  { value: 'blink', label: 'blink（应闪）' },
];

export default function CommandPresetEditor({
  open,
  initial,
  defaultExpectedChannels,
  effectiveCommands,
  onCancel,
  onSubmit,
  editingExisting,
}: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [commandCode, setCommandCode] = useState<string | undefined>(undefined);
  const [paramsText, setParamsText] = useState('');
  const [paramsErr, setParamsErr] = useState<string | null>(null);
  const [expectedChannelsText, setExpectedChannelsText] = useState('');
  const [expectedState, setExpectedState] = useState<'' | 'on' | 'off' | 'blink'>('on');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? '');
    setDescription(initial?.description ?? '');
    setCommandCode(initial?.command_code ?? effectiveCommands[0]?.code);
    setParamsText(initial?.params ? JSON.stringify(initial.params, null, 2) : '');
    setExpectedChannelsText(
      (initial?.expected_channels ?? defaultExpectedChannels ?? []).join(','),
    );
    setExpectedState(((initial?.expected_state ?? 'on') as '' | 'on' | 'off' | 'blink'));
    setParamsErr(null);
  }, [open, initial, defaultExpectedChannels, effectiveCommands]);

  const controlOptions = useMemo(
    () => effectiveCommands.filter((c) => c.category !== 'query'),
    [effectiveCommands],
  );

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    if (!commandCode) return;
    let params: Record<string, unknown> | undefined;
    if (paramsText.trim()) {
      try {
        params = JSON.parse(paramsText);
      } catch {
        setParamsErr('JSON 格式不合法');
        return;
      }
    }
    const expectedChannels = expectedChannelsText
      .split(/[,，\s]+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isInteger(n) && n > 0);
    setSubmitting(true);
    try {
      await onSubmit(trimmedName, {
        description: description.trim() || undefined,
        command_code: commandCode,
        params,
        expected_channels: expectedChannels.length > 0 ? expectedChannels : undefined,
        expected_state: expectedState,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={initial?.name ? `编辑指令组 — ${initial.name}` : '新增指令组'}
      onCancel={onCancel}
      onOk={handleSubmit}
      confirmLoading={submitting}
      destroyOnClose
      width={580}
    >
      <Form layout="vertical">
        <Form.Item
          label="名称"
          required
          extra="同 device 内唯一；不允许 / 与换行（path 参数注入防御）。中文 / emoji 可"
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如：奥运场馆全开"
            maxLength={64}
            disabled={editingExisting}
            autoFocus={!editingExisting}
          />
        </Form.Item>
        <Form.Item label="描述（可选）">
          <Input.TextArea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="给运营 / 现场实施同事看的提示"
            maxLength={200}
          />
        </Form.Item>
        <Form.Item label="command_code" required extra="必须命中 device 的 effective-commands">
          <Select
            value={commandCode}
            onChange={setCommandCode}
            showSearch
            placeholder="选 control 命令（query 不在此列）"
            options={controlOptions.map((c) => ({
              value: c.code,
              label: `${c.name}（${c.code}）`,
            }))}
            filterOption={(input, option) =>
              (option?.label as string).toLowerCase().includes(input.toLowerCase())
            }
          />
        </Form.Item>
        <Form.Item
          label="params（JSON，可选）"
          extra={paramsErr ? <span style={{ color: '#ff4d4f' }}>{paramsErr}</span> : '该 command 的参数；K32 channel_on 用 { "channels": [1,2,3] }'}
          validateStatus={paramsErr ? 'error' : undefined}
        >
          <Input.TextArea
            rows={3}
            value={paramsText}
            onChange={(e) => {
              setParamsText(e.target.value);
              setParamsErr(null);
            }}
            placeholder={'{\n  "channels": [1,2,3,4]\n}'}
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
        </Form.Item>
        <Space wrap style={{ width: '100%' }}>
          <Form.Item
            label="expected_channels"
            extra="逗号分隔。验证用：触发后这些通道应处于 expected_state"
            style={{ flex: 1, minWidth: 280 }}
          >
            <Input
              value={expectedChannelsText}
              onChange={(e) => setExpectedChannelsText(e.target.value)}
              placeholder="如：1,2,3,4"
            />
          </Form.Item>
          <Form.Item label="expected_state" style={{ width: 220 }}>
            <Select
              value={expectedState}
              onChange={(v) => setExpectedState(v as '' | 'on' | 'off' | 'blink')}
              options={STATE_OPTIONS}
            />
          </Form.Item>
        </Space>
      </Form>
    </Modal>
  );
}

