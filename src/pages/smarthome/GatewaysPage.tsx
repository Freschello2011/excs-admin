import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table, Tabs, Select, Space, Button, Modal, Form, Input,
  Popconfirm, Tag, Badge,
} from 'antd';
import { useMessage } from '@/hooks/useMessage';
import type { TableColumnsType } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import { smarthomeApi } from '@/api/smarthome';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import { useHallStore } from '@/stores/hallStore';
import type { HallListItem } from '@/types/hall';
import type {
  HueBridgeDTO,
  XiaomiGatewayDTO,
  GatewayStatus,
  SSEStatus,
} from '@/types/smarthome';

/* ==================== 常量映射 ==================== */

const GATEWAY_STATUS_MAP: Record<GatewayStatus, { color: string; text: string }> = {
  online: { color: 'success', text: '在线' },
  offline: { color: 'error', text: '离线' },
  pairing: { color: 'processing', text: '配对中' },
};

const SSE_STATUS_MAP: Record<SSEStatus, { color: string; text: string }> = {
  connected: { color: 'success', text: '已连接' },
  disconnected: { color: 'default', text: '断开' },
  reconnecting: { color: 'warning', text: '重连中' },
};

/* ==================== 组件 ==================== */

export default function GatewaysPage() {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const selectedHallId = useHallStore((s) => s.selectedHallId);
  const setSelectedHall = useHallStore((s) => s.setSelectedHall);
  const clearSelectedHall = useHallStore((s) => s.clearSelectedHall);

  const [activeTab, setActiveTab] = useState('hue');
  const [hueModalOpen, setHueModalOpen] = useState(false);
  const [editingHue, setEditingHue] = useState<HueBridgeDTO | null>(null);
  const [hueForm] = Form.useForm();
  const [xiaomiModalOpen, setXiaomiModalOpen] = useState(false);
  const [editingXiaomi, setEditingXiaomi] = useState<XiaomiGatewayDTO | null>(null);
  const [xiaomiForm] = Form.useForm();

  // Halls dropdown
  const { data: hallsData } = useQuery({
    queryKey: queryKeys.halls({ page: 1, page_size: 100 } as Record<string, unknown>),
    queryFn: () => hallApi.getHalls({ page: 1, page_size: 100 }),
    select: (res) => res.data.data,
  });
  const halls = hallsData?.list ?? [];
  const hallOptions = halls.map((h: HallListItem) => ({ value: h.id, label: h.name }));

  // Hue Bridges
  const { data: hueBridges = [], isLoading: hueLoading } = useQuery({
    queryKey: queryKeys.hueBridges(selectedHallId!),
    queryFn: () => smarthomeApi.listHueBridges(selectedHallId!),
    select: (res) => res.data.data,
    enabled: !!selectedHallId,
  });

  // Xiaomi Gateways
  const { data: xiaomiGateways = [], isLoading: xiaomiLoading } = useQuery({
    queryKey: queryKeys.xiaomiGateways(selectedHallId!),
    queryFn: () => smarthomeApi.listXiaomiGateways(selectedHallId!),
    select: (res) => res.data.data,
    enabled: !!selectedHallId,
  });

  // Hue mutations
  const createHueMutation = useMutation({
    mutationFn: smarthomeApi.createHueBridge,
    onSuccess: () => {
      message.success('Hue Bridge 创建成功');
      queryClient.invalidateQueries({ queryKey: ['smarthome', 'hue-bridges'] });
      closeHueModal();
    },
  });
  const updateHueMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name?: string; ip?: string } }) =>
      smarthomeApi.updateHueBridge(id, data),
    onSuccess: () => {
      message.success('Hue Bridge 更新成功');
      queryClient.invalidateQueries({ queryKey: ['smarthome', 'hue-bridges'] });
      closeHueModal();
    },
  });
  const deleteHueMutation = useMutation({
    mutationFn: smarthomeApi.deleteHueBridge,
    onSuccess: () => {
      message.success('Hue Bridge 已删除');
      queryClient.invalidateQueries({ queryKey: ['smarthome', 'hue-bridges'] });
    },
  });

  // Xiaomi mutations
  const createXiaomiMutation = useMutation({
    mutationFn: smarthomeApi.createXiaomiGateway,
    onSuccess: () => {
      message.success('小米网关创建成功');
      queryClient.invalidateQueries({ queryKey: ['smarthome', 'xiaomi-gateways'] });
      closeXiaomiModal();
    },
  });
  const updateXiaomiMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name?: string; ip?: string } }) =>
      smarthomeApi.updateXiaomiGateway(id, data),
    onSuccess: () => {
      message.success('小米网关更新成功');
      queryClient.invalidateQueries({ queryKey: ['smarthome', 'xiaomi-gateways'] });
      closeXiaomiModal();
    },
  });
  const deleteXiaomiMutation = useMutation({
    mutationFn: smarthomeApi.deleteXiaomiGateway,
    onSuccess: () => {
      message.success('小米网关已删除');
      queryClient.invalidateQueries({ queryKey: ['smarthome', 'xiaomi-gateways'] });
    },
  });

  /* ===== Hue Modal ===== */
  const openCreateHue = () => {
    setEditingHue(null);
    hueForm.resetFields();
    hueForm.setFieldsValue({ hall_id: selectedHallId });
    setHueModalOpen(true);
  };
  const openEditHue = (record: HueBridgeDTO) => {
    setEditingHue(record);
    hueForm.setFieldsValue({ name: record.name, bridge_ip: record.ip });
    setHueModalOpen(true);
  };
  const closeHueModal = () => { setHueModalOpen(false); setEditingHue(null); hueForm.resetFields(); };
  const handleHueSubmit = () => {
    hueForm.validateFields().then((values) => {
      if (editingHue) {
        updateHueMutation.mutate({ id: editingHue.id, data: { name: values.name, ip: values.bridge_ip } });
      } else {
        createHueMutation.mutate({ ...values, hall_id: selectedHallId! });
      }
    });
  };

  /* ===== Xiaomi Modal ===== */
  const openCreateXiaomi = () => {
    setEditingXiaomi(null);
    xiaomiForm.resetFields();
    xiaomiForm.setFieldsValue({ hall_id: selectedHallId });
    setXiaomiModalOpen(true);
  };
  const openEditXiaomi = (record: XiaomiGatewayDTO) => {
    setEditingXiaomi(record);
    xiaomiForm.setFieldsValue({ name: record.name, gateway_ip: record.ip });
    setXiaomiModalOpen(true);
  };
  const closeXiaomiModal = () => { setXiaomiModalOpen(false); setEditingXiaomi(null); xiaomiForm.resetFields(); };
  const handleXiaomiSubmit = () => {
    xiaomiForm.validateFields().then((values) => {
      if (editingXiaomi) {
        updateXiaomiMutation.mutate({ id: editingXiaomi.id, data: { name: values.name, ip: values.gateway_ip } });
      } else {
        createXiaomiMutation.mutate({ ...values, hall_id: selectedHallId! });
      }
    });
  };

  /* ===== Columns ===== */
  const hueColumns: TableColumnsType<HueBridgeDTO> = [
    { title: '名称', dataIndex: 'name', width: 160 },
    { title: 'Bridge ID', dataIndex: 'bridge_id', width: 180 },
    { title: 'IP', dataIndex: 'ip', width: 140 },
    {
      title: '状态', dataIndex: 'status', width: 90,
      render: (s: GatewayStatus) => {
        const cfg = GATEWAY_STATUS_MAP[s] ?? { color: 'default', text: s };
        return <Badge status={cfg.color as 'success' | 'error' | 'default' | 'processing'} text={cfg.text} />;
      },
    },
    {
      title: 'SSE', dataIndex: 'sse_status', width: 90,
      render: (s: SSEStatus) => {
        const cfg = SSE_STATUS_MAP[s] ?? { color: 'default', text: s };
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    { title: '设备数', dataIndex: 'device_count', width: 80, align: 'center' },
    { title: '固件版本', dataIndex: 'firmware_version', width: 120 },
    {
      title: '最后通信', dataIndex: 'last_seen_at', width: 170,
      render: (v: string | null) => v ? new Date(v).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作', width: 120,
      render: (_: unknown, record: HueBridgeDTO) => (
        <Space size="small">
          <a onClick={() => openEditHue(record)}>编辑</a>
          <Popconfirm title="确定删除该 Hue Bridge？" onConfirm={() => deleteHueMutation.mutate(record.id)}>
            <a style={{ color: 'var(--ant-color-error)' }}>删除</a>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const xiaomiColumns: TableColumnsType<XiaomiGatewayDTO> = [
    { title: '名称', dataIndex: 'name', width: 160 },
    { title: 'DID', dataIndex: 'gateway_did', width: 180 },
    { title: 'IP', dataIndex: 'ip', width: 140 },
    {
      title: '状态', dataIndex: 'status', width: 90,
      render: (s: GatewayStatus) => {
        const cfg = GATEWAY_STATUS_MAP[s] ?? { color: 'default', text: s };
        return <Badge status={cfg.color as 'success' | 'error' | 'default' | 'processing'} text={cfg.text} />;
      },
    },
    { title: '型号', dataIndex: 'model', width: 140 },
    { title: '子设备数', dataIndex: 'device_count', width: 90, align: 'center' },
    { title: '固件版本', dataIndex: 'firmware_version', width: 120 },
    {
      title: '最后通信', dataIndex: 'last_seen_at', width: 170,
      render: (v: string | null) => v ? new Date(v).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作', width: 120,
      render: (_: unknown, record: XiaomiGatewayDTO) => (
        <Space size="small">
          <a onClick={() => openEditXiaomi(record)}>编辑</a>
          <Popconfirm title="确定删除该小米网关？" onConfirm={() => deleteXiaomiMutation.mutate(record.id)}>
            <a style={{ color: 'var(--ant-color-error)' }}>删除</a>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="网关管理" description="管理 Hue Bridge 和小米网关设备" />

      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          placeholder="选择展厅"
          style={{ width: 220 }}
          value={selectedHallId}
          onChange={(v) => {
            const hall = halls.find((h: HallListItem) => h.id === v);
            if (hall) setSelectedHall(v, hall.name);
          }}
          onClear={clearSelectedHall}
          allowClear
          options={hallOptions}
        />
      </Space>

      {!selectedHallId ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#999' }}>请先选择展厅</div>
      ) : (
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          tabBarExtraContent={
            activeTab === 'hue' ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateHue}>添加 Hue Bridge</Button>
            ) : (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateXiaomi}>添加小米网关</Button>
            )
          }
          items={[
            {
              key: 'hue',
              label: `Hue Bridge（${hueBridges.length}）`,
              children: (
                <Table
                  columns={hueColumns}
                  dataSource={hueBridges}
                  loading={hueLoading}
                  pagination={false}
                  rowKey="id"
                  size="middle"
                  scroll={{ x: 1200 }}
                  locale={{ emptyText: '暂无 Hue Bridge，点击右上角添加' }}
                />
              ),
            },
            {
              key: 'xiaomi',
              label: `小米网关（${xiaomiGateways.length}）`,
              children: (
                <Table
                  columns={xiaomiColumns}
                  dataSource={xiaomiGateways}
                  loading={xiaomiLoading}
                  pagination={false}
                  rowKey="id"
                  size="middle"
                  scroll={{ x: 1200 }}
                  locale={{ emptyText: '暂无小米网关，点击右上角添加' }}
                />
              ),
            },
          ]}
        />
      )}

      {/* Hue Bridge Modal */}
      <Modal
        title={editingHue ? '编辑 Hue Bridge' : '添加 Hue Bridge'}
        open={hueModalOpen}
        onOk={handleHueSubmit}
        onCancel={closeHueModal}
        confirmLoading={createHueMutation.isPending || updateHueMutation.isPending}
        width={520}
        forceRender
      >
        <Form form={hueForm} layout="vertical" style={{ marginTop: 16 }}>
          {!editingHue && (
            <Form.Item name="bridge_id" label="Bridge ID" rules={[{ required: true, message: '请输入 Bridge ID' }]}>
              <Input placeholder="Bridge 硬件序列号" />
            </Form.Item>
          )}
          <Form.Item name="name" label="名称">
            <Input placeholder="自定义名称" />
          </Form.Item>
          <Form.Item name="bridge_ip" label="IP 地址" rules={[
            { required: !editingHue, message: '请输入 IP 地址' },
            { pattern: /^(\d{1,3}\.){3}\d{1,3}$/, message: 'IP 地址格式不正确', validateTrigger: 'onBlur' },
          ]}>
            <Input placeholder="如 192.168.1.100" />
          </Form.Item>
          {!editingHue && (
            <Form.Item name="api_key" label="API Key" rules={[{ required: true, message: '请输入 API Key' }]}>
              <Input.Password placeholder="Hue Bridge API Key" />
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* Xiaomi Gateway Modal */}
      <Modal
        title={editingXiaomi ? '编辑小米网关' : '添加小米网关'}
        open={xiaomiModalOpen}
        onOk={handleXiaomiSubmit}
        onCancel={closeXiaomiModal}
        confirmLoading={createXiaomiMutation.isPending || updateXiaomiMutation.isPending}
        width={520}
        forceRender
      >
        <Form form={xiaomiForm} layout="vertical" style={{ marginTop: 16 }}>
          {!editingXiaomi && (
            <Form.Item name="gateway_did" label="设备 DID" rules={[{ required: true, message: '请输入设备 DID' }]}>
              <Input placeholder="如 lumi.gateway.xxx" />
            </Form.Item>
          )}
          <Form.Item name="name" label="名称">
            <Input placeholder="自定义名称" />
          </Form.Item>
          <Form.Item name="gateway_ip" label="IP 地址" rules={[
            { required: !editingXiaomi, message: '请输入 IP 地址' },
            { pattern: /^(\d{1,3}\.){3}\d{1,3}$/, message: 'IP 地址格式不正确', validateTrigger: 'onBlur' },
          ]}>
            <Input placeholder="如 192.168.1.200" />
          </Form.Item>
          {!editingXiaomi && (
            <Form.Item name="token" label="Token" rules={[{ required: true, message: '请输入 Token' }]}>
              <Input.Password placeholder="miio Token" />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
