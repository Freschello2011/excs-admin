/**
 * device-mgmt-v2 P6 — default_listener_patterns 编辑器（接收器型设备）
 *
 * PM 化文案：「该设备会发送的数据 — 直接用现成的，不用手写」
 * 字段表头：「名称 / 匹配方式 / 规则 / 命中后能抓到 / 💡 设备真实发出来的样子 / 📖 这串数据是什么意思」
 */
import { useState } from 'react';
import { Button, Modal, Form, Input, Radio, Space, Table, Tag, Alert, Popconfirm, Tooltip } from 'antd';
import type { TableColumnsType } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { DocumentedListenerPattern, PatternKind } from '@/types/deviceConnector';
import { PATTERN_KIND_LABEL, PATTERN_KIND_HELP } from '@/lib/deviceConnectorLabels';

interface Props {
  value: DocumentedListenerPattern[];
  onChange?: (next: DocumentedListenerPattern[]) => void;
  readOnly?: boolean;
}

export default function DocumentedListenerPatternList({ value, onChange, readOnly }: Props) {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const save = (p: DocumentedListenerPattern) => {
    if (!onChange) return;
    const next = [...value];
    if (editIdx !== null) next[editIdx] = p;
    else next.push(p);
    onChange(next);
    setEditIdx(null);
    setCreating(false);
  };

  const del = (idx: number) => {
    if (!onChange) return;
    onChange(value.filter((_, i) => i !== idx));
  };

  const columns: TableColumnsType<DocumentedListenerPattern> = [
    { title: '名称', dataIndex: 'label', width: 180 },
    {
      title: '匹配方式',
      dataIndex: 'pattern_kind',
      width: 110,
      render: (k: PatternKind) => <Tag color="cyan">{PATTERN_KIND_LABEL[k]}</Tag>,
    },
    {
      title: '规则',
      dataIndex: 'pattern',
      render: (v: string) => <code style={{ fontSize: 12 }}>{v}</code>,
    },
    {
      title: (
        <Space size={4}>
          <Tag color="warning" style={{ margin: 0 }}>💡 设备真实发出来的样子</Tag>
        </Space>
      ),
      dataIndex: 'example_payload',
      width: 200,
      render: (v: string) => (
        <code style={{ fontSize: 12, background: '#fff7e6', padding: '2px 6px', borderRadius: 4 }}>
          {v}
        </code>
      ),
    },
    {
      title: (
        <Space size={4}>
          <Tag color="success" style={{ margin: 0 }}>📖 这串数据是什么意思</Tag>
        </Space>
      ),
      dataIndex: 'example_meaning',
      render: (v: string) => <span style={{ fontSize: 13 }}>{v}</span>,
    },
    {
      title: '命中后能抓到',
      dataIndex: 'capture_groups',
      width: 180,
      render: (cg?: string[]) =>
        cg && cg.length > 0 ? (
          <Tooltip title={cg.map((c, i) => `\${${i + 1}} = ${c}`).join('  ')}>
            <span style={{ fontSize: 12 }}>{cg.length} 个变量</span>
          </Tooltip>
        ) : (
          '-'
        ),
    },
    ...(readOnly
      ? []
      : [
          {
            title: '操作',
            width: 100,
            render: (_: unknown, _r: DocumentedListenerPattern, idx: number) => (
              <Space size={4}>
                <Button size="small" type="text" icon={<EditOutlined />} onClick={() => setEditIdx(idx)} />
                <Popconfirm title="确定删除此模式？" onConfirm={() => del(idx)}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} />
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
        dataSource={value}
        rowKey={(_, idx) => idx ?? 0}
      />
      {!readOnly && (
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          style={{ marginTop: 8, width: '100%' }}
          onClick={() => setCreating(true)}
        >
          新增数据模式
        </Button>
      )}
      <Editor
        open={editIdx !== null || creating}
        initial={editIdx !== null ? value[editIdx] : undefined}
        onCancel={() => {
          setEditIdx(null);
          setCreating(false);
        }}
        onOk={save}
      />
    </div>
  );
}

function Editor({
  open,
  initial,
  onCancel,
  onOk,
}: {
  open: boolean;
  initial?: DocumentedListenerPattern;
  onCancel: () => void;
  onOk: (p: DocumentedListenerPattern) => void;
}) {
  const [form] = Form.useForm<DocumentedListenerPattern & { capture_groups_str: string }>();
  const [regexErr, setRegexErr] = useState<string | null>(null);

  const handleOk = async () => {
    const v = await form.validateFields();
    if (v.pattern_kind === 'regex') {
      try {
        new RegExp(v.pattern);
      } catch (e) {
        setRegexErr(`正则编译失败：${(e as Error).message}`);
        return;
      }
    }
    const cg = (v.capture_groups_str || '')
      .split(/[,，\s]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    onOk({
      label: v.label,
      pattern_kind: v.pattern_kind,
      pattern: v.pattern,
      capture_groups: cg.length > 0 ? cg : undefined,
      example_payload: v.example_payload,
      example_meaning: v.example_meaning,
    });
  };

  return (
    <Modal
      title={initial ? '编辑数据模式' : '新增数据模式'}
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      destroyOnClose
      width={640}
      afterOpenChange={(o) => {
        if (o) {
          setRegexErr(null);
          form.setFieldsValue({
            label: initial?.label ?? '',
            pattern_kind: initial?.pattern_kind ?? 'regex',
            pattern: initial?.pattern ?? '',
            example_payload: initial?.example_payload ?? '',
            example_meaning: initial?.example_meaning ?? '',
            capture_groups_str: (initial?.capture_groups ?? []).join(', '),
          });
        }
      }}
    >
      <Alert
        type="info"
        showIcon
        message="给部署人员的提示"
        description="这里描述的是「设备会主动发什么数据」，配触发器时直接选用即可，不需要部署人员翻设备说明书。"
        style={{ marginBottom: 16 }}
      />
      <Form form={form} layout="vertical">
        <Form.Item
          name="label"
          label="起个好记的名字"
          rules={[{ required: true, message: '必填' }]}
          extra="如：激光笔 A 键触发 / 门磁打开"
        >
          <Input maxLength={50} />
        </Form.Item>
        <Form.Item name="pattern_kind" label="匹配方式">
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
          validateStatus={regexErr ? 'error' : undefined}
          help={regexErr || PATTERN_KIND_HELP[form.getFieldValue('pattern_kind') as PatternKind]}
        >
          <Input.TextArea rows={2} onChange={() => setRegexErr(null)} />
        </Form.Item>
        <Form.Item
          name="capture_groups_str"
          label="命中后能抓到（按顺序）"
          extra={'用逗号分隔。例：接收器编号, 按键 → 命中后可在动作里用 ${1} ${2}'}
        >
          <Input placeholder="接收器编号, 按键" />
        </Form.Item>
        <Form.Item
          name="example_payload"
          label="💡 设备真实发出来的样子（用于对照）"
          rules={[{ required: true, message: '必填' }]}
        >
          <Input placeholder="如：A03" style={{ fontFamily: 'monospace' }} />
        </Form.Item>
        <Form.Item
          name="example_meaning"
          label="📖 这串数据是什么意思（业务含义）"
          rules={[{ required: true, message: '必填' }]}
        >
          <Input placeholder="如：3 号接收器的 A 键被按下" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
