/**
 * device-mgmt-v2 P6 — 设备目录（4 tab 合并入口）
 * /platform/device-catalog
 *
 * Tab：
 *   1. 已支持型号（预置库，只读）
 *   2. 标准协议（CRUD，admin 极少用）
 *   3. 插件（列已安装插件 + 子设备类型）
 *   4. 触发器模板（V3 占位）
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tabs, Table, Tag, Drawer, Empty, Alert, Space, Spin, Button, Modal, Form, Input, Select } from 'antd';
import type { TableColumnsType } from 'antd';
import PageHeader from '@/components/common/PageHeader';
import { useMessage } from '@/hooks/useMessage';
import {
  presetCatalogApi,
  protocolProfileApi,
  pluginApi,
} from '@/api/deviceConnector';
import type {
  PresetCatalogDTO,
  PresetDetailDTO,
  ProtocolProfileListItem,
  ProtocolProfileDetail,
  PluginDTO,
  TransportKind,
  CreateProtocolProfileBody,
} from '@/types/deviceConnector';
import { TRANSPORT_LABEL, PATTERN_KIND_LABEL } from '@/lib/deviceConnectorLabels';
import HeartbeatPatternList from '@/components/device-catalog/HeartbeatPatternList';
import DocumentedListenerPatternList from '@/components/device-catalog/DocumentedListenerPatternList';
import ProtocolProfileEditor from '@/components/device-catalog/ProtocolProfileEditor';
import VendorCredentialsTab from './VendorCredentialsTab';

const DEPRECATED_PRESETS = new Set(['shanyou_switch']);

export default function DeviceCatalogPage() {
  const [tab, setTab] = useState('preset');

  return (
    <div>
      <PageHeader
        title="设备目录"
        description="集中管理所有支持的设备类型：已支持型号、标准协议、设备插件、厂家账号"
      />
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'preset', label: '已支持型号', children: <PresetCatalogTab /> },
          { key: 'protocol', label: '标准协议', children: <ProtocolProfileTab /> },
          { key: 'plugin', label: '设备插件', children: <PluginTab /> },
          { key: 'vendor-credentials', label: '厂家账号', children: <VendorCredentialsTab /> },
          {
            key: 'trigger-template',
            label: '触发器模板',
            children: (
              <Empty
                description="规划中：常用触发器一键复用（如「每天开馆前 10 分钟开投影」）。当前版本请在「触发器」页面手动添加。"
                style={{ padding: 60 }}
              />
            ),
          },
        ]}
      />
    </div>
  );
}

/* ==================== Tab 1: 已支持型号（只读） ==================== */

function PresetCatalogTab() {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const { data: list = [], isLoading } = useQuery({
    queryKey: ['preset-catalog'],
    queryFn: () => presetCatalogApi.list(),
    select: (res) => res.data.data ?? [],
  });

  const columns: TableColumnsType<PresetCatalogDTO> = [
    {
      title: '设备',
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontWeight: 500 }}>{r.name}</span>
          <span style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary)' }}>
            <code>{r.key}</code>
          </span>
        </Space>
      ),
    },
    { title: '厂商', dataIndex: 'manufacturer', width: 140 },
    { title: '型号', dataIndex: 'model_name', width: 180 },
    {
      title: '连接方式',
      dataIndex: 'transport_kind',
      width: 180,
      render: (v: string) =>
        v ? (TRANSPORT_LABEL[v as keyof typeof TRANSPORT_LABEL] ?? v) : '-',
    },
    {
      title: '命令数',
      width: 140,
      render: (_, r) => (
        <Space size={4}>
          <Tag color="blue">控制 {r.control_count}</Tag>
          <Tag color="cyan">查询 {r.query_count}</Tag>
        </Space>
      ),
    },
    {
      title: '状态',
      width: 140,
      render: (_, r) =>
        DEPRECATED_PRESETS.has(r.key) ? (
          <Tag color="error" title="该型号已停用，请改用「设备插件」方式接入">
            ⚠ 已停用
          </Tag>
        ) : (
          <Tag color="success">可用</Tag>
        ),
    },
  ];

  return (
    <div>
      <Alert
        type="info"
        showIcon
        message="型号库（只读）"
        description="已支持型号在系统中预置，如需新增 / 修改，请联系 ExCS 工程师。"
        style={{ marginBottom: 16 }}
      />
      <Table
        columns={columns}
        dataSource={list}
        loading={isLoading}
        rowKey="key"
        pagination={{ pageSize: 20 }}
        onRow={(record) => ({
          onClick: () => setSelectedKey(record.key),
          style: { cursor: 'pointer' },
        })}
      />
      <PresetDetailDrawer
        presetKey={selectedKey}
        onClose={() => setSelectedKey(null)}
      />
    </div>
  );
}

function PresetDetailDrawer({
  presetKey,
  onClose,
}: {
  presetKey: string | null;
  onClose: () => void;
}) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ['preset-catalog', presetKey],
    queryFn: () => presetCatalogApi.get(presetKey!),
    select: (res) => res.data.data,
    enabled: !!presetKey,
  });

  return (
    <Drawer
      title={detail ? `型号：${detail.name}` : '型号详情'}
      open={!!presetKey}
      onClose={onClose}
      width={720}
      destroyOnClose
    >
      {isLoading && <Spin />}
      {detail && <PresetDetailBody detail={detail} />}
    </Drawer>
  );
}

function PresetDetailBody({ detail }: { detail: PresetDetailDTO }) {
  return (
    <div>
      {DEPRECATED_PRESETS.has(detail.key) && (
        <Alert
          type="error"
          showIcon
          message="该型号已停用"
          description="该型号已升级为「设备插件」方式。新建设备请选「设备插件」；已有设备暂时保留，可继续使用。"
          style={{ marginBottom: 16 }}
        />
      )}
      <DetailRow label="设备" value={detail.name} />
      <DetailRow label="厂商 / 型号" value={`${detail.manufacturer} · ${detail.model_name}`} />
      <DetailRow label="连接方式" value={TRANSPORT_LABEL[detail.transport_kind as keyof typeof TRANSPORT_LABEL] ?? detail.transport_kind} />
      <DetailRow
        label="命令数"
        value={
          <Space>
            <Tag color="blue">控制 {detail.control_count}</Tag>
            <Tag color="cyan">查询 {detail.query_count}</Tag>
          </Space>
        }
      />
      {detail.description && <DetailRow label="说明" value={detail.description} />}

      {detail.commands.length > 0 && (
        <Section title="命令清单">
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
              {
                title: '指令',
                dataIndex: 'request',
                render: (v?: string) =>
                  v ? <code style={{ fontSize: 12 }}>{v}</code> : '-',
              },
              { title: '代号', dataIndex: 'code', width: 120, render: (v: string) => <code style={{ fontSize: 12 }}>{v}</code> },
            ]}
          />
        </Section>
      )}

      {/* P3 留尾 1：心跳模式 */}
      {detail.heartbeat_patterns && detail.heartbeat_patterns.length > 0 && (
        <Section
          title="在线检查方式"
          subtitle={`设备主动发出的"我还活着"信号 — 间隔不超过 ${detail.heartbeat_period_seconds_max ?? 10} 秒`}
        >
          <HeartbeatPatternList value={detail.heartbeat_patterns} readOnly />
        </Section>
      )}

      {/* P3 留尾 3：default_listener_patterns */}
      {detail.default_listener_patterns && detail.default_listener_patterns.length > 0 && (
        <Section
          title="该设备会发送的数据"
          subtitle="配触发器时一键引用，无需手抄说明书"
        >
          <DocumentedListenerPatternList
            value={detail.default_listener_patterns}
            readOnly
          />
        </Section>
      )}

      <details style={{ marginTop: 24 }}>
        <summary style={{ cursor: 'pointer', color: 'var(--ant-color-text-tertiary)' }}>
          🔧 开发者备注
        </summary>
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>
          <code>preset_key</code>：<code>{detail.key}</code>
          <br />
          <code>transport_kind</code>：<code>{detail.transport_kind}</code>
          <br />
          <code>supported_since_version</code>：<code>{detail.supported_since_version}</code>
          {detail.heartbeat_command_code && (
            <>
              <br />
              <code>heartbeat_command_code</code>：<code>{detail.heartbeat_command_code}</code>
            </>
          )}
        </div>
      </details>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', padding: '8px 0', borderBottom: '1px dashed var(--ant-color-border)' }}>
      <div style={{ width: 120, color: 'var(--ant-color-text-tertiary)', fontSize: 13 }}>{label}</div>
      <div style={{ flex: 1 }}>{value}</div>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontWeight: 500, marginBottom: 4 }}>{title}</div>
      {subtitle && (
        <div style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary)', marginBottom: 8 }}>
          {subtitle}
        </div>
      )}
      {children}
    </div>
  );
}

/* ==================== Tab 2: 标准协议（CRUD） ==================== */

const TRANSPORT_OPTIONS: { value: TransportKind; label: string }[] = [
  { value: 'tcp', label: 'TCP' },
  { value: 'udp', label: 'UDP' },
  { value: 'serial', label: '串口（RS232/RS485）' },
  { value: 'osc', label: 'OSC' },
  { value: 'artnet', label: 'Art-Net' },
  { value: 'modbus', label: 'Modbus' },
  { value: 'http', label: 'HTTP/HTTPS' },
];

function ProtocolProfileTab() {
  const [editingProtocol, setEditingProtocol] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: list = [], isLoading } = useQuery({
    queryKey: ['protocol-profiles'],
    queryFn: () => protocolProfileApi.list(),
    select: (res) => res.data.data ?? [],
  });

  const columns: TableColumnsType<ProtocolProfileListItem> = [
    {
      title: '协议',
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontWeight: 500 }}>{r.name}</span>
          <code style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary)' }}>{r.protocol}</code>
        </Space>
      ),
    },
    {
      title: '传输类型',
      dataIndex: 'transport_kind',
      width: 160,
      render: (v?: string) =>
        v ? (TRANSPORT_LABEL[v as keyof typeof TRANSPORT_LABEL] ?? v) : <span style={{ color: 'var(--ant-color-text-tertiary)' }}>-</span>,
    },
    {
      title: '命令数',
      width: 200,
      render: (_, r) => (
        <Space size={4}>
          <Tag color="blue">控制 {r.control_count}</Tag>
          <Tag color="cyan">查询 {r.query_count}</Tag>
        </Space>
      ),
    },
    {
      title: '在线检查指令',
      dataIndex: 'heartbeat_command_code',
      width: 160,
      render: (v?: string) => (v ? <code>{v}</code> : <span style={{ color: 'var(--ant-color-text-tertiary)' }}>-</span>),
    },
    {
      title: '操作',
      width: 80,
      render: (_, r) => (
        <a onClick={() => setEditingProtocol(r.protocol)}>编辑</a>
      ),
    },
  ];

  return (
    <div>
      <Alert
        type="info"
        showIcon
        message="标准协议（一般不改）"
        description="像 PJLink、Modbus、Art-Net 这类标准协议的命令模板。一般无需改动；新增命令请联系 ExCS 工程师。"
        style={{ marginBottom: 16 }}
      />
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="primary" onClick={() => setCreating(true)}>
          新增协议
        </Button>
      </div>
      <Table
        columns={columns}
        dataSource={list}
        loading={isLoading}
        rowKey="protocol"
        pagination={{ pageSize: 20 }}
      />
      <Drawer
        title={editingProtocol ? `编辑协议：${editingProtocol}` : '编辑协议'}
        open={!!editingProtocol}
        onClose={() => setEditingProtocol(null)}
        width={780}
        destroyOnClose
      >
        {editingProtocol && (
          <ProtocolProfileEditor
            protocol={editingProtocol}
            onClose={() => setEditingProtocol(null)}
          />
        )}
      </Drawer>
      <CreateProtocolProfileModal
        open={creating}
        onClose={() => setCreating(false)}
      />
    </div>
  );
}

interface CreateFormValues {
  protocol: string;
  name: string;
  transport_kind?: TransportKind;
  notes?: string;
}

function CreateProtocolProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<CreateFormValues>();

  const mutation = useMutation({
    mutationFn: (body: CreateProtocolProfileBody) => protocolProfileApi.create(body),
    onSuccess: () => {
      message.success('协议已创建');
      queryClient.invalidateQueries({ queryKey: ['protocol-profiles'] });
      form.resetFields();
      onClose();
    },
  });

  const handleOk = async () => {
    const v = await form.validateFields();
    mutation.mutate({
      protocol: v.protocol.trim(),
      name: v.name.trim(),
      transport_kind: v.transport_kind,
      notes: v.notes,
      connection_schema: { type: 'object', properties: {} },
      commands: [],
    });
  };

  return (
    <Modal
      title="新增协议"
      open={open}
      onOk={handleOk}
      onCancel={() => {
        form.resetFields();
        onClose();
      }}
      confirmLoading={mutation.isPending}
      destroyOnClose
      width={520}
    >
      <Alert
        type="info"
        showIcon
        message="新建后命令清单为空"
        description="先创建协议名，命令 / 连接配置 / 在线检查方式可在「编辑」中补充；复杂命令编辑请联系 ExCS 工程师。"
        style={{ marginBottom: 16 }}
      />
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          name="protocol"
          label="协议代号"
          rules={[
            { required: true, message: '请输入协议代号' },
            { pattern: /^[a-z0-9_]+$/, message: '只能用小写字母 / 数字 / 下划线' },
            { max: 64, message: '不超过 64 字符' },
          ]}
          extra="内部代号，只能用小写字母 / 数字 / 下划线（如 my_custom_tcp）"
        >
          <Input placeholder="如 my_custom_tcp" />
        </Form.Item>
        <Form.Item
          name="name"
          label="协议名"
          rules={[{ required: true, message: '请输入协议名' }, { max: 200 }]}
        >
          <Input placeholder="如 自定义 TCP 协议" />
        </Form.Item>
        <Form.Item
          name="transport_kind"
          label="连接方式"
          extra="留空表示由插件或自定义协议决定"
        >
          <Select allowClear placeholder="选择连接方式" options={TRANSPORT_OPTIONS} />
        </Form.Item>
        <Form.Item name="notes" label="备注">
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/* ==================== Tab 3: 插件 ==================== */

function PluginTab() {
  const [selectedPlugin, setSelectedPlugin] = useState<string | null>(null);

  const { data: list = [], isLoading } = useQuery({
    queryKey: ['plugins'],
    queryFn: () => pluginApi.list(),
    select: (res) => res.data.data ?? [],
  });

  const columns: TableColumnsType<PluginDTO> = [
    {
      title: '设备插件',
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontWeight: 500 }}>{r.name}</span>
          <code style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary)' }}>
            {r.plugin_id} · v{r.version}
          </code>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 120,
      render: (s: string) =>
        s === 'installed' ? (
          <Tag color="success">已安装</Tag>
        ) : s === 'disabled' ? (
          <Tag color="default">已禁用</Tag>
        ) : (
          <Tag color="error">异常</Tag>
        ),
    },
    {
      title: '操作',
      width: 120,
      render: (_, r) => <a onClick={() => setSelectedPlugin(r.plugin_id)}>查看子设备</a>,
    },
  ];

  return (
    <div>
      <Alert
        type="warning"
        showIcon
        message="设备插件接入路线"
        description="像闪优开关、米家这类需要厂家账号 / 复杂登录流程的云端设备，通过设备插件接入。"
        style={{ marginBottom: 16 }}
      />
      {list.length === 0 && !isLoading ? (
        <Empty description="暂无已安装的设备插件 — 闪优等插件即将接入" />
      ) : (
        <Table
          columns={columns}
          dataSource={list}
          loading={isLoading}
          rowKey="plugin_id"
          pagination={false}
        />
      )}
      <Drawer
        title={selectedPlugin ? `子设备型号：${selectedPlugin}` : '子设备型号'}
        open={!!selectedPlugin}
        onClose={() => setSelectedPlugin(null)}
        width={680}
        destroyOnClose
      >
        {selectedPlugin && <PluginDevicesView pluginId={selectedPlugin} />}
      </Drawer>
    </div>
  );
}

function PluginDevicesView({ pluginId }: { pluginId: string }) {
  const { data: list = [], isLoading } = useQuery({
    queryKey: ['plugin-devices', pluginId],
    queryFn: () => pluginApi.listDevices(pluginId),
    select: (res) => res.data.data ?? [],
    enabled: !!pluginId,
  });

  if (isLoading) return <Spin />;
  if (list.length === 0) return <Empty description="该插件暂未声明任何子设备型号" />;

  return (
    <Table
      size="small"
      pagination={false}
      rowKey="device_key"
      dataSource={list}
      columns={[
        {
          title: '子设备型号',
          render: (_, r) => (
            <Space direction="vertical" size={0}>
              <span style={{ fontWeight: 500 }}>{r.name}</span>
              <code style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary)' }}>
                {r.device_key}
              </code>
            </Space>
          ),
        },
        {
          title: '连接方式',
          dataIndex: 'transport_kind',
          width: 160,
          render: (v?: string) =>
            v ? (TRANSPORT_LABEL[v as keyof typeof TRANSPORT_LABEL] ?? v) : '-',
        },
        {
          title: '命令数',
          width: 100,
          render: (_, r) => r.commands?.length ?? 0,
        },
      ]}
    />
  );
}

/** util — used by trigger drawer pattern preview */
export const PATTERN_KIND_TAG_LABEL = PATTERN_KIND_LABEL;
export type { ProtocolProfileDetail };
