/**
 * device-mgmt-v2 P6 — ProtocolProfile 编辑面板
 *
 * 协议库 admin 极少改，但保留入口。本面板暴露：
 *   - name / notes
 *   - heartbeat_command_code
 *   - heartbeat_patterns + heartbeat_period_seconds_max（P3 留尾 1）
 *   - default_listener_patterns（P3 留尾 3）
 *   - commands（先按只读展示，命令编辑复杂留 P7）
 */
import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Form, Input, InputNumber, Button, Space, Spin, Alert, Tag, Table, Select } from 'antd';
import { useMessage } from '@/hooks/useMessage';
import { protocolProfileApi } from '@/api/deviceConnector';
import HeartbeatPatternList from './HeartbeatPatternList';
import DocumentedListenerPatternList from './DocumentedListenerPatternList';
import type {
  HeartbeatPattern,
  DocumentedListenerPattern,
  TransportKind,
  UpdateProtocolProfileBody,
  ProtocolProfileDetail,
} from '@/types/deviceConnector';

interface Props {
  protocol: string;
  onClose: () => void;
}

interface FormValues {
  name: string;
  transport_kind?: TransportKind;
  heartbeat_command_code?: string;
  heartbeat_period_seconds_max?: number;
  notes?: string;
  heartbeat_patterns: HeartbeatPattern[];
  default_listener_patterns: DocumentedListenerPattern[];
}

const TRANSPORT_OPTIONS: { value: TransportKind; label: string }[] = [
  { value: 'tcp', label: 'TCP' },
  { value: 'udp', label: 'UDP' },
  { value: 'serial', label: '串口（RS232/RS485）' },
  { value: 'osc', label: 'OSC' },
  { value: 'artnet', label: 'Art-Net' },
  { value: 'modbus', label: 'Modbus' },
  { value: 'http', label: 'HTTP/HTTPS' },
];

export default function ProtocolProfileEditor({ protocol, onClose }: Props) {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();

  const { data: detail, isLoading } = useQuery({
    queryKey: ['protocol-profile', protocol],
    queryFn: () => protocolProfileApi.get(protocol),
    select: (res) => res.data.data,
  });

  useEffect(() => {
    if (detail) {
      form.setFieldsValue({
        name: detail.name,
        transport_kind: detail.transport_kind,
        heartbeat_command_code: detail.heartbeat_command_code,
        heartbeat_period_seconds_max: detail.heartbeat_period_seconds_max,
        notes: detail.notes,
        heartbeat_patterns: detail.heartbeat_patterns ?? [],
        default_listener_patterns: detail.default_listener_patterns ?? [],
      });
    }
  }, [detail, form]);

  const mutation = useMutation({
    mutationFn: (body: UpdateProtocolProfileBody) =>
      protocolProfileApi.update(protocol, body),
    onSuccess: () => {
      message.success('协议已更新');
      queryClient.invalidateQueries({ queryKey: ['protocol-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['protocol-profile', protocol] });
      onClose();
    },
  });

  const handleSubmit = async () => {
    if (!detail) return;
    const v = await form.validateFields();
    mutation.mutate({
      name: v.name,
      transport_kind: v.transport_kind,
      connection_schema: detail.connection_schema,
      commands: detail.commands,
      heartbeat_command_code: v.heartbeat_command_code,
      heartbeat_period_seconds_max: v.heartbeat_period_seconds_max,
      notes: v.notes,
      heartbeat_patterns: v.heartbeat_patterns,
      default_listener_patterns: v.default_listener_patterns,
    });
  };

  if (isLoading || !detail) return <Spin />;

  return (
    <div>
      <Alert
        type="info"
        showIcon
        message="该协议被很多设备共用"
        description="改这里会影响所有用此协议的设备。建议只改心跳模式 / 备注，命令清单的修改请联系工程师。"
        style={{ marginBottom: 16 }}
      />
      <Form form={form} layout="vertical">
        <Form.Item
          name="name"
          label="协议名"
          rules={[{ required: true }]}
        >
          <Input />
        </Form.Item>
        <Form.Item
          name="transport_kind"
          label="传输类型"
          extra="物理传输协议，决定客户端用哪种 transport 适配器；plugin 兜底协议可留空"
        >
          <Select
            allowClear
            placeholder="留空 = 由插件 / 自定义协议自描述"
            options={TRANSPORT_OPTIONS}
            style={{ maxWidth: 320 }}
          />
        </Form.Item>
        <Form.Item name="notes" label="备注">
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>

        <Section title="命令清单（只读 — 改命令请联系工程师）">
          <Table
            size="small"
            pagination={false}
            rowKey="code"
            dataSource={detail.commands}
            columns={[
              { title: '名称', dataIndex: 'name' },
              {
                title: '用途',
                dataIndex: 'kind',
                width: 80,
                render: (k: string) =>
                  k === 'control' ? <Tag color="blue">控制</Tag> : <Tag color="cyan">查询</Tag>,
              },
              { title: '代号', dataIndex: 'code', width: 140, render: (v: string) => <code>{v}</code> },
              { title: '指令', dataIndex: 'request', render: (v?: string) => (v ? <code>{v}</code> : '-') },
            ]}
          />
        </Section>

        <Section title="心跳指令（ExCS 主动周期问设备）">
          <Form.Item
            name="heartbeat_command_code"
            help="留空表示不轮询。值必须是上面命令清单里某条 query 类命令的代号。"
          >
            <Input placeholder="如：get_status" />
          </Form.Item>
        </Section>

        <Section title="心跳模式（设备主动发的『我还活着』信号）">
          <Form.Item
            name="heartbeat_period_seconds_max"
            label="最大心跳周期（秒，≤10）"
            extra="心跳超过『周期 × 3』未收到 → 设备判离线"
          >
            <InputNumber min={1} max={10} placeholder="如 3" />
          </Form.Item>
          <Form.Item shouldUpdate noStyle>
            {() => (
              <HeartbeatPatternList
                value={form.getFieldValue('heartbeat_patterns') ?? []}
                onChange={(v) => form.setFieldsValue({ heartbeat_patterns: v })}
              />
            )}
          </Form.Item>
        </Section>

        <Section title="该设备会发送的数据（admin 配触发器时一键引用）">
          <Form.Item shouldUpdate noStyle>
            {() => (
              <DocumentedListenerPatternList
                value={form.getFieldValue('default_listener_patterns') ?? []}
                onChange={(v) => form.setFieldsValue({ default_listener_patterns: v })}
              />
            )}
          </Form.Item>
        </Section>

        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" loading={mutation.isPending} onClick={handleSubmit}>
              保存
            </Button>
          </Space>
        </div>
      </Form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 24, borderTop: '1px solid var(--ant-color-border-secondary)', paddingTop: 16 }}>
      <div style={{ fontWeight: 500, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

export type { ProtocolProfileDetail };
