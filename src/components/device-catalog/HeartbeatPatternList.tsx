/**
 * device-mgmt-v2 P6 — 心跳模式 (heartbeat_patterns) 编辑器
 *
 * PM 化文案：「心跳模式 — 设备主动发的『我还活着』信号」
 * 字段表头：「名称 / 匹配方式 / 规则」
 */
import { useState } from 'react';
import { Button, Modal, Form, Input, Radio, Space, Table, Tag, Alert, Popconfirm } from 'antd';
import type { TableColumnsType } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { HeartbeatPattern, PatternKind } from '@/types/deviceConnector';
import { PATTERN_KIND_LABEL, PATTERN_KIND_HELP } from '@/lib/deviceConnectorLabels';

interface Props {
  value: HeartbeatPattern[];
  onChange?: (next: HeartbeatPattern[]) => void;
  readOnly?: boolean;
}

export default function HeartbeatPatternList({ value, onChange, readOnly }: Props) {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const handleSave = (p: HeartbeatPattern) => {
    if (!onChange) return;
    const next = [...value];
    if (editIdx !== null) next[editIdx] = p;
    else next.push(p);
    onChange(next);
    setEditIdx(null);
    setCreating(false);
  };

  const handleDelete = (idx: number) => {
    if (!onChange) return;
    onChange(value.filter((_, i) => i !== idx));
  };

  const columns: TableColumnsType<HeartbeatPattern> = [
    { title: '名称', dataIndex: 'label', render: (v: string) => v || <em style={{ color: 'var(--ant-color-text-tertiary)' }}>未命名</em> },
    {
      title: '匹配方式',
      dataIndex: 'kind',
      width: 120,
      render: (k: PatternKind) => <Tag color="cyan">{PATTERN_KIND_LABEL[k]}</Tag>,
    },
    {
      title: '规则',
      dataIndex: 'pattern',
      render: (v: string) => <code style={{ fontSize: 12 }}>{v}</code>,
    },
    ...(readOnly
      ? []
      : [
          {
            title: '操作',
            width: 110,
            render: (_: unknown, _r: HeartbeatPattern, idx: number) => (
              <Space size={4}>
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => setEditIdx(idx)} />
                <Popconfirm title="确定删除此心跳模式？" onConfirm={() => handleDelete(idx)}>
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          } as const,
        ]),
  ];

  return (
    <div>
      <Table
        size="small"
        pagination={false}
        columns={columns}
        dataSource={value.map((v, i) => ({ ...v, _idx: i }))}
        rowKey={(_, idx) => idx ?? 0}
      />
      {!readOnly && (
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          style={{ marginTop: 8, width: '100%' }}
          onClick={() => setCreating(true)}
        >
          新增心跳模式
        </Button>
      )}
      <PatternEditor
        open={editIdx !== null || creating}
        initial={editIdx !== null ? value[editIdx] : undefined}
        onCancel={() => {
          setEditIdx(null);
          setCreating(false);
        }}
        onOk={handleSave}
      />
    </div>
  );
}

function PatternEditor({
  open,
  initial,
  onCancel,
  onOk,
}: {
  open: boolean;
  initial?: HeartbeatPattern;
  onCancel: () => void;
  onOk: (p: HeartbeatPattern) => void;
}) {
  const [form] = Form.useForm<HeartbeatPattern>();
  const [regexErr, setRegexErr] = useState<string | null>(null);

  const handleOk = async () => {
    const values = await form.validateFields();
    if (values.kind === 'regex') {
      try {
        new RegExp(values.pattern);
      } catch (e) {
        setRegexErr(`正则编译失败：${(e as Error).message}`);
        return;
      }
    }
    onOk(values);
  };

  return (
    <Modal
      title={initial ? '编辑心跳模式' : '新增心跳模式'}
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      destroyOnClose
      afterOpenChange={(o) => {
        if (o) {
          setRegexErr(null);
          form.setFieldsValue(initial ?? { kind: 'exact', pattern: '', label: '' });
        }
      }}
    >
      <Alert
        type="info"
        showIcon
        message="举例（三选一）"
        description={
          <div style={{ fontSize: 12 }}>
            ① <b>完全相等</b>：通道全开心跳串永远是 <code>:::ALL_ON.</code>，选这个
            <br />
            ② <b>模糊匹配</b>：心跳串带变化的数字（如 <code>HB_42</code>）→ 用 <code>^HB_(\d+)$</code>
            <br />
            ③ <b>二进制</b>：协议里是字节序列（如 <code>FF 01 02 0A</code>），不是文本
          </div>
        }
        style={{ marginBottom: 16 }}
      />
      <Form form={form} layout="vertical">
        <Form.Item
          name="label"
          label="起个好记的名字"
          rules={[{ required: true, message: '必填' }]}
          extra="如：通道状态心跳 / 电压心跳 / 存活心跳"
        >
          <Input maxLength={50} />
        </Form.Item>
        <Form.Item name="kind" label="匹配方式" initialValue="exact">
          <Radio.Group
            onChange={() => setRegexErr(null)}
            options={(['exact', 'regex', 'bytes'] as PatternKind[]).map((k) => ({
              value: k,
              label: PATTERN_KIND_LABEL[k],
            }))}
          />
        </Form.Item>
        <Form.Item
          name="pattern"
          label="规则"
          rules={[{ required: true, message: '必填' }]}
          extra={
            <span style={{ fontSize: 12 }}>
              {PATTERN_KIND_HELP[form.getFieldValue('kind') as PatternKind] ?? ''}
            </span>
          }
          validateStatus={regexErr ? 'error' : undefined}
          help={regexErr || undefined}
        >
          <Input.TextArea rows={2} onChange={() => setRegexErr(null)} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
