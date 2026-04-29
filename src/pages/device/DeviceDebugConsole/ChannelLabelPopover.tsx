/**
 * device-mgmt-v2 P9-C.2 — 单格 / 多格打标签弹窗。
 *
 * 单格 → 简单 input + group select；多格 → 每格一个 input + 公共 group。
 * 后端 PATCH /v2/devices/:id/channel-map 是**全量替换**，所以这里要把当前
 * channel_map 一并传回（仅 patch 选中的 entries）。
 */
import { useEffect, useMemo, useState } from 'react';
import { Form, Input, Modal, Select, Space, Typography } from 'antd';
import type { ChannelEntry } from '@/api/channelMap';

const { Text } = Typography;

interface Props {
  open: boolean;
  indexes: number[];
  channelMap: ChannelEntry[];
  groupSuggestions: string[];
  onCancel: () => void;
  onSubmit: (next: ChannelEntry[]) => Promise<void> | void;
}

export default function ChannelLabelPopover({
  open,
  indexes,
  channelMap,
  groupSuggestions,
  onCancel,
  onSubmit,
}: Props) {
  const ordered = useMemo(() => [...indexes].sort((a, b) => a - b), [indexes]);
  const [labels, setLabels] = useState<Record<number, string>>({});
  const [group, setGroup] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const init: Record<number, string> = {};
    let firstGroup = '';
    for (const idx of ordered) {
      const e = channelMap.find((x) => x.index === idx);
      init[idx] = e?.label ?? '';
      if (e?.group && !firstGroup) firstGroup = e.group;
    }
    setLabels(init);
    setGroup(firstGroup);
  }, [open, ordered, channelMap]);

  const handleSubmit = async () => {
    const next = [...channelMap];
    for (const idx of ordered) {
      const label = (labels[idx] ?? '').trim();
      if (!label) continue;
      const i = next.findIndex((x) => x.index === idx);
      const entry: ChannelEntry = { index: idx, label, group: group.trim() || undefined };
      if (i >= 0) next[i] = entry;
      else next.push(entry);
    }
    next.sort((a, b) => a.index - b.index);
    setSubmitting(true);
    try {
      await onSubmit(next);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={ordered.length > 1 ? `批量打标签（${ordered.length} 路）` : `打标签 — 通道 ${ordered[0] ?? ''}`}
      onCancel={onCancel}
      onOk={handleSubmit}
      confirmLoading={submitting}
      destroyOnClose
      width={ordered.length > 1 ? 640 : 480}
    >
      <Form layout="vertical">
        <Form.Item label="分组（可选）">
          <Select
            mode="tags"
            allowClear
            value={group ? [group] : []}
            onChange={(arr) => setGroup((Array.isArray(arr) ? arr[arr.length - 1] : arr) ?? '')}
            placeholder="如：奥运场馆 / 城市地标"
            options={groupSuggestions.map((g) => ({ value: g, label: g }))}
            style={{ width: '100%' }}
          />
          <Text type="secondary" style={{ fontSize: 11 }}>
            同一组的通道可以一键全开 / 全关；演出 / 触发器中也可按组引用。
          </Text>
        </Form.Item>

        {ordered.length === 1 ? (
          <Form.Item label="实物名" required>
            <Input
              value={labels[ordered[0]] ?? ''}
              onChange={(e) => setLabels({ ...labels, [ordered[0]]: e.target.value })}
              placeholder="如：水立方"
              maxLength={32}
              autoFocus
            />
          </Form.Item>
        ) : (
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            {ordered.map((idx) => (
              <Form.Item
                key={idx}
                label={`通道 ${idx}`}
                style={{ marginBottom: 8 }}
              >
                <Input
                  value={labels[idx] ?? ''}
                  onChange={(e) => setLabels({ ...labels, [idx]: e.target.value })}
                  placeholder="未填则不变更此通道"
                  maxLength={32}
                />
              </Form.Item>
            ))}
          </Space>
        )}
      </Form>
    </Modal>
  );
}
