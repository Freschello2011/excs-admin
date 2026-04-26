import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Avatar,
  Button,
  Drawer,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
} from 'antd';
import { useMessage } from '@/hooks/useMessage';
import type { TableColumnsType } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import StatusTag from '@/components/common/StatusTag';
import WidgetRenderer from '@/components/device-catalog/WidgetRenderer';
import { hallApi } from '@/api/hall';
import { deviceModelApi } from '@/api/deviceModel';
import { deviceProtocolBaselineApi } from '@/api/deviceProtocolBaseline';
import { queryKeys } from '@/api/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { useHallStore } from '@/stores/hallStore';
import type { DeviceBody, DeviceListItem, ExhibitListItem } from '@/api/gen/client';
import type { ParamsSchemaProperty } from '@/types/deviceCatalog';

interface ConnSchemaShape {
  type?: string;
  required?: string[];
  properties?: Record<string, ParamsSchemaProperty>;
}

/** 协议 connection_schema + 型号 connection_defaults 的合并：default 字段被型号默认值覆盖。 */
function mergeSchemaWithDefaults(
  schema: ConnSchemaShape | undefined,
  defaults: Record<string, unknown> | null | undefined,
): ConnSchemaShape {
  const props = schema?.properties ?? {};
  const merged: Record<string, ParamsSchemaProperty> = {};
  for (const [k, v] of Object.entries(props)) {
    merged[k] = {
      ...v,
      default: defaults && k in defaults ? defaults[k] : v.default,
    } as ParamsSchemaProperty;
  }
  return { type: schema?.type ?? 'object', required: schema?.required ?? [], properties: merged };
}

export default function DeviceListPage() {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const user = useAuthStore((s) => s.user);

  const selectedHallId = useHallStore((s) => s.selectedHallId);

  const [keyword, setKeyword] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<DeviceListItem | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<number | undefined>(undefined);
  const [connValues, setConnValues] = useState<Record<string, unknown>>({});
  const [form] = Form.useForm<{
    name: string;
    exhibit_id: number | null;
    notes?: string;
    serial_no?: string;
  }>();

  /* ====== Devices ====== */

  const { data: devices = [], isLoading } = useQuery({
    queryKey: queryKeys.devices({ hall_id: selectedHallId } as Record<string, unknown>),
    queryFn: () => hallApi.getDevices({ hall_id: selectedHallId! }),
    select: (res) => res.data.data,
    enabled: !!selectedHallId,
  });

  /* ====== Exhibits（用于 Drawer 展项 Select）====== */

  const { data: exhibits = [] } = useQuery({
    queryKey: queryKeys.exhibits(selectedHallId ?? 0),
    queryFn: () => hallApi.getExhibits(selectedHallId!),
    select: (res) => res.data.data,
    enabled: !!selectedHallId,
  });

  /* ====== Models（型号 Autocomplete 数据源）====== */

  const { data: modelData } = useQuery({
    queryKey: queryKeys.deviceModels({ status: 'active', page: 1, page_size: 1000 }),
    queryFn: () => deviceModelApi.list({ status: 'active', page: 1, page_size: 1000 }),
    select: (res) => res.data.data,
  });
  const models = modelData?.list ?? [];

  /* ====== 选中型号详情（拿 connection_defaults / commands 数）====== */

  const { data: selectedModel } = useQuery({
    queryKey: queryKeys.deviceModelDetail(selectedModelId ?? 0),
    queryFn: () => deviceModelApi.get(selectedModelId!),
    select: (res) => res.data.data,
    enabled: !!selectedModelId,
  });

  /* ====== 协议基线（拿 connection_schema）====== */

  const protocolKey = selectedModel?.protocol;
  const { data: baseline } = useQuery({
    queryKey: queryKeys.protocolBaselineDetail(protocolKey ?? ''),
    queryFn: () => deviceProtocolBaselineApi.get(protocolKey!),
    select: (res) => res.data.data,
    enabled: !!protocolKey,
  });

  const effectiveSchema = useMemo(
    () =>
      mergeSchemaWithDefaults(
        baseline?.connection_schema as ConnSchemaShape | undefined,
        selectedModel?.connection_defaults ?? null,
      ),
    [baseline, selectedModel],
  );

  /* baseline + model 命令按 code 合并去重的可用命令数 */
  const baselineCommandCount = baseline?.commands?.length ?? 0;
  const modelExtraCount = useMemo(() => {
    if (!selectedModel?.commands) return 0;
    const baselineCodes = new Set((baseline?.commands ?? []).map((c) => c.code));
    return selectedModel.commands.filter((c) => !baselineCodes.has(c.code)).length;
  }, [baseline, selectedModel]);
  const effectiveCommandCount = baselineCommandCount + modelExtraCount;

  /* ====== 权限 ====== */

  const canConfig =
    !!selectedHallId &&
    (isAdmin() ||
      (user?.hall_permissions?.some(
        (hp) => hp.hall_id === selectedHallId && hp.permissions.includes('system_config'),
      ) ??
        false));

  /* ====== Mutations ====== */

  const createMutation = useMutation({
    mutationFn: (data: DeviceBody) => hallApi.createDevice(data),
    onSuccess: () => {
      message.success('设备创建成功');
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      closeDrawer();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<DeviceBody> }) =>
      hallApi.updateDevice(id, data),
    onSuccess: () => {
      message.success('设备更新成功');
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      closeDrawer();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (deviceId: number) => hallApi.deleteDevice(deviceId),
    onSuccess: () => {
      message.success('设备已删除');
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });

  /* ====== 打开/关闭 Drawer ====== */

  const openCreate = () => {
    setEditingDevice(null);
    setSelectedModelId(undefined);
    setConnValues({});
    form.resetFields();
    form.setFieldsValue({ exhibit_id: null });
    setDrawerOpen(true);
  };

  const openEdit = (record: DeviceListItem) => {
    setEditingDevice(record);
    setSelectedModelId(record.model_id);
    setConnValues({ ...(record.connection_config as Record<string, unknown>) });
    form.setFieldsValue({
      name: record.name,
      exhibit_id: record.exhibit_id,
      notes: record.notes ?? '',
      serial_no: record.serial_no ?? '',
    });
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingDevice(null);
    setSelectedModelId(undefined);
    setConnValues({});
    form.resetFields();
  };

  /* ====== 当 schema 装载完成且为创建模式时，把 default 预填到 connValues ====== */

  useEffect(() => {
    if (editingDevice || !drawerOpen || !baseline) return;
    const defaults: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(effectiveSchema.properties ?? {})) {
      if (v.default !== undefined) defaults[k] = v.default;
    }
    setConnValues((prev) => ({ ...defaults, ...prev }));
    // baseline + selectedModelId 变化时刷新
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseline?.protocol, selectedModelId, drawerOpen]);

  /* ====== 提交 ====== */

  const handleSubmit = () => {
    if (!selectedHallId) {
      message.error('请先在顶栏选择展厅');
      return;
    }
    if (!selectedModelId) {
      message.error('请选择设备型号');
      return;
    }
    form.validateFields().then((values) => {
      // 校验 required connection_config 字段
      const requiredKeys = effectiveSchema.required ?? [];
      const missing = requiredKeys.filter(
        (k) => connValues[k] === undefined || connValues[k] === '' || connValues[k] === null,
      );
      if (missing.length > 0) {
        message.error(`连接参数缺失：${missing.join('、')}`);
        return;
      }

      const body: DeviceBody = {
        hall_id: selectedHallId,
        exhibit_id: values.exhibit_id ?? null,
        model_id: selectedModelId,
        name: values.name,
        connection_config: connValues,
        ...(values.notes ? { notes: values.notes } : {}),
        ...(values.serial_no ? { serial_no: values.serial_no } : {}),
      };

      if (editingDevice) {
        updateMutation.mutate({ id: editingDevice.id, data: body });
      } else {
        createMutation.mutate(body);
      }
    });
  };

  /* ====== 表格 ====== */

  const filteredDevices = keyword
    ? devices.filter(
        (d) =>
          d.name.toLowerCase().includes(keyword.toLowerCase()) ||
          (d.model_code ?? '').toLowerCase().includes(keyword.toLowerCase()) ||
          (d.model_name ?? '').toLowerCase().includes(keyword.toLowerCase()),
      )
    : devices;

  const exhibitOptions = useMemo(
    () => [
      { value: null, label: '展厅级（无展项）' },
      ...exhibits.map((e: ExhibitListItem) => ({ value: e.id, label: e.name })),
    ],
    [exhibits],
  );

  /* ====== 型号 Select 选项（按品牌分组） ====== */

  const modelGroupOptions = useMemo(() => {
    const groups = new Map<string, Array<{ value: number; label: string; key: string }>>();
    for (const m of models) {
      const groupLabel = m.brand_name || '其他';
      if (!groups.has(groupLabel)) groups.set(groupLabel, []);
      groups.get(groupLabel)!.push({
        value: m.id,
        label: `${m.name}（${m.model_code}）`,
        key: `${m.brand_name} ${m.model_code} ${m.name} ${m.subcategory_name}`,
      });
    }
    return Array.from(groups.entries()).map(([label, options]) => ({ label, options }));
  }, [models]);

  const columns: TableColumnsType<DeviceListItem> = [
    { title: '设备名称', dataIndex: 'name' },
    {
      title: '型号',
      width: 280,
      render: (_, r) => (
        <Space size="small">
          {r.brand_logo_url ? (
            <Avatar size={20} shape="square" src={r.brand_logo_url} />
          ) : (
            <Avatar
              size={20}
              shape="square"
              style={{ background: 'var(--ant-color-primary-bg)', fontSize: 11 }}
            >
              {(r.brand_name ?? '?').slice(0, 1)}
            </Avatar>
          )}
          <span>
            {r.model_name?.startsWith(r.brand_name ?? '')
              ? r.model_name
              : `${r.brand_name ?? ''} ${r.model_name ?? ''}`.trim()}
          </span>
          {r.model_id && (
            <Link
              to={`/platform/device-models?id=${r.model_id}`}
              style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary)' }}
            >
              {r.model_code}
            </Link>
          )}
        </Space>
      ),
    },
    { title: '小类', dataIndex: 'subcategory_name', width: 120, render: (v?: string) => v || '-' },
    {
      title: '所属展项',
      dataIndex: 'exhibit_name',
      width: 140,
      render: (v: string | null) => v || <span style={{ color: 'var(--ant-color-text-tertiary)' }}>展厅级</span>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (s: string) => <StatusTag status={s} />,
    },
    ...(canConfig
      ? [
          {
            title: '操作',
            width: 120,
            render: (_: unknown, record: DeviceListItem) => (
              <Space size="small">
                <a onClick={() => openEdit(record)}>编辑</a>
                <Popconfirm
                  title="确定删除此设备？"
                  description="需要设备未被场景动作引用"
                  onConfirm={() => deleteMutation.mutate(record.id)}
                >
                  <a style={{ color: 'var(--ant-color-error)' }}>删除</a>
                </Popconfirm>
              </Space>
            ),
          },
        ]
      : []),
  ];

  /* ====== 渲染 ====== */

  return (
    <div>
      <PageHeader
        title="设备管理"
        description="管理当前展厅的设备实例"
        extra={
          canConfig ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={openCreate}
              disabled={!selectedHallId}
            >
              新建设备
            </Button>
          ) : undefined
        }
      />

      <Alert
        type="warning"
        showIcon
        message="测试阶段：旧设备已清空，请基于「平台 / 设备品牌型号」型号库新建设备"
        style={{ marginBottom: 16 }}
      />

      <Space wrap style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="搜索设备名 / 型号 code"
          allowClear
          style={{ width: 280 }}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </Space>

      {!selectedHallId ? (
        <div style={{ textAlign: 'center', color: 'var(--color-outline)', padding: 60 }}>
          请先在顶栏选择展厅
        </div>
      ) : (
        <Table<DeviceListItem>
          columns={columns}
          dataSource={filteredDevices}
          loading={isLoading}
          pagination={false}
          rowKey="id"
          size="middle"
        />
      )}

      <Drawer
        title={editingDevice ? '编辑设备' : '新建设备'}
        open={drawerOpen}
        onClose={closeDrawer}
        width={560}
        destroyOnClose
        extra={
          <Space>
            <Button onClick={closeDrawer}>取消</Button>
            <Button
              type="primary"
              loading={createMutation.isPending || updateMutation.isPending}
              onClick={handleSubmit}
            >
              保存
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="设备名称"
            rules={[{ required: true, message: '请输入设备名称' }]}
          >
            <Input maxLength={100} placeholder="如：1 号厅·主投影" />
          </Form.Item>

          <Form.Item label="设备型号" required>
            <Select
              showSearch
              placeholder="搜索品牌 / 型号 / 代号"
              value={selectedModelId}
              onChange={(v) => {
                setSelectedModelId(v);
                setConnValues({}); // 切换型号时清空连接参数；effect 会按新 schema default 重填
              }}
              filterOption={(input, option) => {
                const key = (option as { key?: string } | undefined)?.key;
                if (!key) return false;
                return key.toLowerCase().includes(input.toLowerCase());
              }}
              options={modelGroupOptions}
              optionFilterProp="key"
              style={{ width: '100%' }}
            />
            {selectedModel && (
              <div
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  color: 'var(--ant-color-text-tertiary)',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                }}
              >
                <span>
                  协议：<strong>{selectedModel.protocol}</strong>
                </span>
                <span>
                  命令数：{effectiveCommandCount}
                  {modelExtraCount > 0 && (
                    <span style={{ marginLeft: 4 }}>
                      （基线 {baselineCommandCount} + 型号扩展 {modelExtraCount}）
                    </span>
                  )}
                </span>
                {selectedModel.id && (
                  <Link to={`/platform/device-models?id=${selectedModel.id}`}>查看型号详情</Link>
                )}
              </div>
            )}
          </Form.Item>

          <Form.Item name="exhibit_id" label="所属展项">
            <Select options={exhibitOptions} allowClear placeholder="选择展项（不选 = 展厅级）" />
          </Form.Item>

          {selectedModelId && (
            <div
              style={{
                borderTop: '1px solid var(--ant-color-border)',
                paddingTop: 12,
                marginTop: 8,
                marginBottom: 16,
              }}
            >
              <div style={{ fontWeight: 500, marginBottom: 8 }}>
                连接参数
                {baseline && (
                  <span
                    style={{
                      fontSize: 12,
                      color: 'var(--ant-color-text-tertiary)',
                      marginLeft: 6,
                    }}
                  >
                    （来源：协议 {baseline.protocol} schema + 型号默认值）
                  </span>
                )}
              </div>
              <ConnectionConfigForm
                schema={effectiveSchema}
                values={connValues}
                onChange={setConnValues}
              />
            </div>
          )}

          <Form.Item name="serial_no" label="序列号（可选）">
            <Input maxLength={64} placeholder="物理资产编号" />
          </Form.Item>
          <Form.Item name="notes" label="备注（可选）">
            <Input.TextArea rows={3} maxLength={500} placeholder="安装位置 / 维护备忘等" />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}

/* ==================== 连接参数动态表单 ==================== */

function ConnectionConfigForm({
  schema,
  values,
  onChange,
}: {
  schema: ConnSchemaShape;
  values: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const props = schema.properties ?? {};
  const requiredSet = new Set(schema.required ?? []);
  const keys = Object.keys(props);

  if (keys.length === 0) {
    return (
      <div style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 12 }}>
        该协议无连接参数
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {keys.map((key) => {
        const p = props[key];
        const required = requiredSet.has(key);
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
              <span style={{ color: 'var(--ant-color-text-tertiary)', marginLeft: 6 }}>
                {key} · {p.type}
              </span>
            </div>
            <WidgetRenderer
              schema={p}
              value={values[key]}
              onChange={(v) => onChange({ ...values, [key]: v })}
              size="small"
            />
          </div>
        );
      })}
    </div>
  );
}
