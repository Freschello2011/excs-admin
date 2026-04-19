import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AutoComplete,
  Avatar,
  Button,
  Cascader,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
} from 'antd';
import { useMessage } from '@/hooks/useMessage';
import type { TableColumnsType } from 'antd';
import {
  CopyOutlined,
  EditOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import CommandListEditor, {
  commandsToRows,
  rowsToCommands,
  type CommandRow,
} from '@/components/device-catalog/CommandListEditor';
import WidgetRenderer from '@/components/device-catalog/WidgetRenderer';
import { deviceModelApi } from '@/api/deviceModel';
import { deviceBrandApi } from '@/api/deviceBrand';
import { deviceCategoryApi } from '@/api/deviceCategory';
import { deviceProtocolBaselineApi } from '@/api/deviceProtocolBaseline';
import { queryKeys } from '@/api/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import type {
  DeviceModelDetail,
  DeviceModelListItem,
  DeviceModelStatus,
  ModelListQuery,
} from '@/types/deviceModel';
import type { DeviceBrandDTO } from '@/types/deviceBrand';
import type {
  ProtocolBaselineDetailDTO,
  ProtocolBaselineListItemDTO,
} from '@/types/deviceProtocolBaseline';
import type { ParamsSchemaProperty } from '@/types/deviceCatalog';

/* ==================== Page ==================== */

export default function DeviceModelsPage() {
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const [tab, setTab] = useState<'models' | 'brands'>('models');

  return (
    <div>
      <PageHeader description="设备品牌与型号管理。型号 = 品牌 + 小类 + 协议 + 命令清单 + 参数 schema。" />
      <Tabs
        activeKey={tab}
        onChange={(k) => setTab(k as 'models' | 'brands')}
        items={[
          { key: 'models', label: '型号管理', children: <ModelsTab isAdmin={isAdmin()} /> },
          { key: 'brands', label: '品牌字典', children: <BrandsTab isAdmin={isAdmin()} /> },
        ]}
      />
    </div>
  );
}

/* ==================== Tab 1: 型号管理 ==================== */

interface ModelEditorState {
  open: boolean;
  mode: 'create' | 'edit';
  source?: DeviceModelDetail; // 编辑时传 detail；克隆时传 clone 返回的 detail（无 id）
}

function ModelsTab({ isAdmin }: { isAdmin: boolean }) {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<{
    categoryId?: number;
    subcategoryId?: number;
    brandId?: number;
    keyword: string;
  }>({ keyword: '' });
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [editor, setEditor] = useState<ModelEditorState>({ open: false, mode: 'create' });

  const query: ModelListQuery = {
    subcategory_id: filters.subcategoryId,
    brand_id: filters.brandId,
    keyword: filters.keyword || undefined,
    page,
    page_size: pageSize,
  };

  /* list */
  const { data: modelData, isLoading } = useQuery({
    queryKey: queryKeys.deviceModels(query as Record<string, unknown>),
    queryFn: () => deviceModelApi.list(query),
    select: (res) => res.data.data,
  });
  const models = modelData?.list ?? [];
  const total = modelData?.total ?? 0;

  /* categories / subcategories (筛选器) */
  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.deviceCategories,
    queryFn: () => deviceCategoryApi.list(),
    select: (res) => res.data.data,
  });
  const { data: allSubs = [] } = useQuery({
    queryKey: queryKeys.deviceSubcategories(),
    queryFn: () => deviceCategoryApi.listSubcategories(),
    select: (res) => res.data.data,
  });

  /* brands (筛选器) */
  const { data: brands = [] } = useQuery({
    queryKey: queryKeys.deviceBrands({}),
    queryFn: () => deviceBrandApi.list(),
    select: (res) => res.data.data,
  });

  /* mutations */
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['device-models'] });
    queryClient.invalidateQueries({ queryKey: ['device-brands'] });
  };

  const deprecateMutation = useMutation({
    mutationFn: (id: number) => deviceModelApi.deprecate(id),
    onSuccess: () => {
      message.success('已标记为弃用');
      invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deviceModelApi.delete(id),
    onSuccess: () => {
      message.success('型号已删除');
      invalidate();
    },
  });

  const cloneMutation = useMutation({
    mutationFn: (id: number) => deviceModelApi.clone(id),
    onSuccess: (res) => {
      const detail = res.data.data;
      setEditor({ open: true, mode: 'create', source: detail });
    },
  });

  /* filter options */
  const subcategoryOptions = useMemo(
    () =>
      (filters.categoryId
        ? allSubs.filter((s) => s.category_id === filters.categoryId)
        : allSubs
      ).map((s) => ({ value: s.id, label: s.name })),
    [allSubs, filters.categoryId],
  );

  /* ─── open editors ─── */
  const openCreate = () => setEditor({ open: true, mode: 'create' });
  const openEdit = async (id: number) => {
    try {
      const res = await deviceModelApi.get(id);
      setEditor({ open: true, mode: 'edit', source: res.data.data });
    } catch {
      message.error('加载型号详情失败');
    }
  };

  /* ─── table columns ─── */
  const columns: TableColumnsType<DeviceModelListItem> = [
    {
      title: '品牌',
      key: 'brand',
      width: 140,
      render: (_, r) => (
        <Space>
          <Avatar
            size={24}
            src={r.brand_logo_url || undefined}
            style={{ background: r.brand_logo_url ? undefined : 'var(--ant-color-primary-bg)' }}
          >
            {r.brand_name.slice(0, 1)}
          </Avatar>
          <span>{r.brand_name}</span>
        </Space>
      ),
    },
    {
      title: '型号',
      key: 'model',
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{r.name}</div>
          <Tag color="default" style={{ marginTop: 2 }}>
            {r.model_code}
          </Tag>
        </div>
      ),
    },
    {
      title: '小类',
      dataIndex: 'subcategory_name',
      width: 120,
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: '协议',
      dataIndex: 'protocol',
      width: 120,
      render: (v: string) => <Tag color="blue">{v}</Tag>,
    },
    { title: '命令数', dataIndex: 'command_count', width: 80 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v: DeviceModelStatus) =>
        v === 'active' ? <Tag color="success">启用</Tag> : <Tag color="warning">弃用</Tag>,
    },
    ...(isAdmin
      ? [
          {
            title: '操作',
            key: 'actions',
            width: 280,
            render: (_: unknown, r: DeviceModelListItem) => (
              <Space size={4} wrap>
                <Tooltip title="基于此创建（克隆）">
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => cloneMutation.mutate(r.id)}
                    loading={cloneMutation.isPending}
                  >
                    克隆
                  </Button>
                </Tooltip>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r.id)}>
                  编辑
                </Button>
                {r.status === 'active' ? (
                  <Popconfirm
                    title="弃用此型号？"
                    description="弃用后不影响已有设备实例，但无法建新设备。"
                    onConfirm={() => deprecateMutation.mutate(r.id)}
                  >
                    <Button size="small" icon={<PauseCircleOutlined />}>
                      弃用
                    </Button>
                  </Popconfirm>
                ) : (
                  <Tag icon={<PlayCircleOutlined />} color="warning">
                    已弃用
                  </Tag>
                )}
                <Popconfirm
                  title="删除此型号？"
                  description="如已有设备实例引用，删除会失败。"
                  onConfirm={() => deleteMutation.mutate(r.id)}
                >
                  <Button size="small" danger>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        {isAdmin && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建型号
          </Button>
        )}
        <Select
          allowClear
          style={{ width: 130 }}
          placeholder="大类"
          value={filters.categoryId}
          onChange={(v) => {
            setFilters({ ...filters, categoryId: v, subcategoryId: undefined });
            setPage(1);
          }}
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
        />
        <Select
          allowClear
          style={{ width: 150 }}
          placeholder="小类"
          value={filters.subcategoryId}
          onChange={(v) => {
            setFilters({ ...filters, subcategoryId: v });
            setPage(1);
          }}
          options={subcategoryOptions}
        />
        <Select
          allowClear
          style={{ width: 150 }}
          placeholder="品牌"
          value={filters.brandId}
          onChange={(v) => {
            setFilters({ ...filters, brandId: v });
            setPage(1);
          }}
          options={brands.map((b) => ({ value: b.id, label: b.name }))}
        />
        <Input
          allowClear
          style={{ width: 220 }}
          placeholder="搜索型号 / 型号编号"
          prefix={<SearchOutlined />}
          value={filters.keyword}
          onChange={(e) => {
            setFilters({ ...filters, keyword: e.target.value });
            setPage(1);
          }}
        />
      </Space>

      <Table<DeviceModelListItem>
        columns={columns}
        dataSource={models}
        loading={isLoading}
        rowKey="id"
        size="middle"
        pagination={{
          current: page,
          pageSize,
          total,
          onChange: setPage,
          showSizeChanger: false,
        }}
      />

      {editor.open && (
        <ModelEditorDrawer
          state={editor}
          brands={brands}
          onClose={() => setEditor({ open: false, mode: 'create' })}
          onSaved={() => {
            setEditor({ open: false, mode: 'create' });
            invalidate();
          }}
        />
      )}
    </>
  );
}

/* ==================== Model Editor Drawer ==================== */

interface ModelFormValues {
  subcategory_path?: number[]; // cascader: [categoryId, subcategoryId]
  brand_input?: string; // autocomplete: brand name
  model_code: string;
  name: string;
  protocol: string;
  manual_url?: string;
  description?: string;
  connection_defaults: Record<string, unknown>;
}

interface ModelEditorDrawerProps {
  state: ModelEditorState;
  brands: DeviceBrandDTO[];
  onClose: () => void;
  onSaved: () => void;
}

function ModelEditorDrawer({ state, brands, onClose, onSaved }: ModelEditorDrawerProps) {
  const { message } = useMessage();
  const [form] = Form.useForm<ModelFormValues>();
  const [commands, setCommands] = useState<CommandRow[]>([]);
  const [connValues, setConnValues] = useState<Record<string, unknown>>({});

  /* categories / subs for cascader */
  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.deviceCategories,
    queryFn: () => deviceCategoryApi.list(),
    select: (res) => res.data.data,
  });
  const { data: allSubs = [] } = useQuery({
    queryKey: queryKeys.deviceSubcategories(),
    queryFn: () => deviceCategoryApi.listSubcategories(),
    select: (res) => res.data.data,
  });

  /* protocol baselines — for Select + connection_schema rendering */
  const { data: baselines = [] } = useQuery({
    queryKey: queryKeys.protocolBaselines,
    queryFn: () => deviceProtocolBaselineApi.list(),
    select: (res) => res.data.data,
  });

  const selectedProtocol = Form.useWatch('protocol', form);
  const { data: protocolDetail } = useQuery({
    queryKey: queryKeys.protocolBaselineDetail(selectedProtocol ?? ''),
    queryFn: () => deviceProtocolBaselineApi.get(selectedProtocol!),
    select: (res) => res.data.data,
    enabled: !!selectedProtocol,
  });

  /* init form from source */
  useEffect(() => {
    const src = state.source;
    if (!src) {
      form.resetFields();
      setCommands([]);
      setConnValues({});
      return;
    }
    const sub = allSubs.find((s) => s.id === src.subcategory_id);
    const path = sub ? [sub.category_id, sub.id] : undefined;
    const brand = brands.find((b) => b.id === src.brand_id);
    form.setFieldsValue({
      subcategory_path: path,
      brand_input: brand?.name ?? '',
      model_code: src.model_code,
      name: src.name,
      protocol: src.protocol,
      manual_url: src.manual_url,
      description: src.description,
    });
    setCommands(commandsToRows(src.commands));
    setConnValues((src.connection_defaults as Record<string, unknown>) || {});
  }, [state.source, allSubs, brands, form]);

  /* apply protocol default connection_defaults when baseline changes (only if empty) */
  useEffect(() => {
    if (!protocolDetail) return;
    const props = protocolDetail.connection_schema?.properties as
      | Record<string, ParamsSchemaProperty>
      | undefined;
    if (!props) return;
    setConnValues((prev) => {
      const next = { ...prev };
      for (const [key, p] of Object.entries(props)) {
        if (next[key] === undefined && p.default !== undefined) {
          next[key] = p.default;
        }
      }
      return next;
    });
  }, [protocolDetail]);

  /* categories cascader options */
  const cascaderOptions = useMemo(
    () =>
      categories.map((c) => ({
        value: c.id,
        label: c.name,
        children: allSubs
          .filter((s) => s.category_id === c.id)
          .map((s) => ({ value: s.id, label: s.name })),
      })),
    [categories, allSubs],
  );

  const createMutation = useMutation({
    mutationFn: (body: Parameters<typeof deviceModelApi.create>[0]) => deviceModelApi.create(body),
    onSuccess: () => {
      message.success('型号创建成功');
      onSaved();
    },
  });
  const updateMutation = useMutation({
    mutationFn: (args: { id: number; body: Parameters<typeof deviceModelApi.update>[1] }) =>
      deviceModelApi.update(args.id, args.body),
    onSuccess: () => {
      message.success('型号已更新');
      onSaved();
    },
  });

  const handleSubmit = async () => {
    let values: ModelFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    if (!values.subcategory_path || values.subcategory_path.length !== 2) {
      message.error('请选择小类');
      return;
    }
    const subId = values.subcategory_path[1];
    const brandInput = (values.brand_input ?? '').trim();
    if (!brandInput) {
      message.error('请输入品牌');
      return;
    }
    const matchedBrand = brands.find(
      (b) => b.name === brandInput || b.code === brandInput,
    );

    const cmds = rowsToCommands(commands);

    // validation: command codes unique
    const codeCount = cmds.reduce<Record<string, number>>((acc, c) => {
      acc[c.code] = (acc[c.code] ?? 0) + 1;
      return acc;
    }, {});
    const dupes = Object.entries(codeCount)
      .filter(([, n]) => n > 1)
      .map(([c]) => c);
    if (dupes.length > 0) {
      message.error(`命令 code 重复：${dupes.join(', ')}`);
      return;
    }

    if (state.mode === 'edit' && state.source?.id) {
      if (!matchedBrand) {
        message.error('编辑模式下品牌必须从已有品牌中选择');
        return;
      }
      updateMutation.mutate({
        id: state.source.id,
        body: {
          subcategory_id: subId,
          brand_id: matchedBrand.id,
          name: values.name,
          protocol: values.protocol,
          connection_defaults: connValues,
          commands: cmds,
          manual_url: values.manual_url,
          description: values.description,
        },
      });
    } else {
      // create (含 clone)
      createMutation.mutate({
        subcategory_id: subId,
        brand_id: matchedBrand?.id,
        brand_code: matchedBrand ? undefined : slugifyCode(brandInput),
        brand_name: matchedBrand ? undefined : brandInput,
        model_code: values.model_code,
        name: values.name,
        protocol: values.protocol,
        connection_defaults: connValues,
        commands: cmds,
        manual_url: values.manual_url,
        description: values.description,
      });
    }
  };

  const brandOptions = useMemo(
    () =>
      brands.map((b) => ({
        value: b.name,
        label: (
          <Space>
            {b.logo_url ? (
              <Avatar size={18} src={b.logo_url} />
            ) : (
              <Avatar size={18} style={{ background: 'var(--ant-color-primary-bg)' }}>
                {b.name.slice(0, 1)}
              </Avatar>
            )}
            <span>{b.name}</span>
            <span style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 12 }}>
              {b.code}
            </span>
          </Space>
        ),
      })),
    [brands],
  );

  const title =
    state.mode === 'edit'
      ? `编辑型号：${state.source?.name ?? ''}`
      : state.source
      ? '新建型号（克隆预填）'
      : '新建型号';

  return (
    <Drawer
      title={title}
      open={state.open}
      onClose={onClose}
      width={760}
      destroyOnClose
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
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
      <Form<ModelFormValues> form={form} layout="vertical">
        <Form.Item
          name="subcategory_path"
          label="小类"
          rules={[{ required: true, message: '请选择大类→小类' }]}
        >
          <Cascader options={cascaderOptions} placeholder="大类 → 小类" />
        </Form.Item>

        <Form.Item
          name="brand_input"
          label="品牌"
          rules={[{ required: true, message: '请输入品牌（可新建）' }]}
        >
          <AutoComplete
            placeholder="输入品牌名，匹配已有或回车新建"
            options={brandOptions}
            filterOption={(input, opt) => String(opt?.value ?? '').includes(input)}
          />
        </Form.Item>

        <Form.Item
          name="model_code"
          label="型号编号"
          rules={[
            { required: true, message: '请输入型号编号' },
            {
              pattern: /^[A-Za-z0-9._-]+$/,
              message: '仅支持字母、数字、点号、下划线、短横线',
            },
          ]}
        >
          <Input placeholder="PT-FRQ75CL" disabled={state.mode === 'edit'} />
        </Form.Item>

        <Form.Item
          name="name"
          label="显示名"
          rules={[{ required: true, message: '请输入显示名' }]}
        >
          <Input placeholder="松下 PT-FRQ75CL" />
        </Form.Item>

        <Form.Item
          name="protocol"
          label="协议"
          rules={[{ required: true, message: '请选择协议' }]}
        >
          <Select
            placeholder="选择协议基线"
            options={baselines.map((b: ProtocolBaselineListItemDTO) => ({
              value: b.protocol,
              label: `${b.name}（${b.protocol} · ${b.command_count} 命令）`,
            }))}
          />
        </Form.Item>

        <Form.Item name="manual_url" label="说明书 URL">
          <Input placeholder="https://..." />
        </Form.Item>

        <Form.Item name="description" label="备注 / 描述">
          <Input.TextArea rows={2} />
        </Form.Item>

        <div
          style={{
            borderTop: '1px solid var(--ant-color-border)',
            paddingTop: 12,
            marginBottom: 12,
          }}
        >
          <div style={{ fontWeight: 500, marginBottom: 8 }}>连接参数默认值</div>
          {!protocolDetail ? (
            <div style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 12 }}>
              请先选择协议
            </div>
          ) : (
            <ConnectionDefaultsForm
              baseline={protocolDetail}
              values={connValues}
              onChange={setConnValues}
            />
          )}
        </div>

        <div style={{ borderTop: '1px solid var(--ant-color-border)', paddingTop: 12 }}>
          <div style={{ fontWeight: 500, marginBottom: 8 }}>命令清单</div>
          <CommandListEditor
            value={commands}
            onChange={setCommands}
            protocol={selectedProtocol}
          />
        </div>
      </Form>
    </Drawer>
  );
}

/* ==================== Connection Defaults Form（按 protocol connection_schema 动态渲染）==================== */

function ConnectionDefaultsForm({
  baseline,
  values,
  onChange,
}: {
  baseline: ProtocolBaselineDetailDTO;
  values: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const schema = baseline.connection_schema as
    | { properties?: Record<string, ParamsSchemaProperty>; required?: string[] }
    | undefined;
  const props = schema?.properties ?? {};
  const requiredSet = new Set(schema?.required ?? []);

  const keys = Object.keys(props);
  if (keys.length === 0) {
    return (
      <div style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 12 }}>
        协议 {baseline.protocol} 无连接参数
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
            <div style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', marginBottom: 4 }}>
              {p.title ?? key}
              {required && <span style={{ color: 'var(--ant-color-error)', marginLeft: 4 }}>*</span>}
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

/* ==================== Tab 2: 品牌字典 ==================== */

function BrandsTab({ isAdmin }: { isAdmin: boolean }) {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; brand?: DeviceBrandDTO }>({ open: false });
  const [form] = Form.useForm<{
    code: string;
    name: string;
    logo_url?: string;
    website?: string;
    notes?: string;
  }>();

  const { data: brands = [], isLoading } = useQuery({
    queryKey: queryKeys.deviceBrands({}),
    queryFn: () => deviceBrandApi.list(),
    select: (res) => res.data.data,
  });

  // 获取型号列表（以便统计每个品牌下的型号数）
  const { data: modelData } = useQuery({
    queryKey: queryKeys.deviceModels({ page: 1, page_size: 1000 }),
    queryFn: () => deviceModelApi.list({ page: 1, page_size: 1000 }),
    select: (res) => res.data.data,
  });
  const modelsByBrand = useMemo(() => {
    const map: Record<number, number> = {};
    for (const m of modelData?.list ?? []) {
      map[m.brand_id] = (map[m.brand_id] ?? 0) + 1;
    }
    return map;
  }, [modelData]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['device-brands'] });

  const createMutation = useMutation({
    mutationFn: (body: Parameters<typeof deviceBrandApi.create>[0]) => deviceBrandApi.create(body),
    onSuccess: () => {
      message.success('品牌已创建');
      invalidate();
      setModal({ open: false });
    },
  });
  const updateMutation = useMutation({
    mutationFn: (args: { id: number; body: Parameters<typeof deviceBrandApi.update>[1] }) =>
      deviceBrandApi.update(args.id, args.body),
    onSuccess: () => {
      message.success('品牌已更新');
      invalidate();
      setModal({ open: false });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deviceBrandApi.delete(id),
    onSuccess: () => {
      message.success('品牌已删除');
      invalidate();
    },
  });

  const openCreate = () => {
    form.resetFields();
    setModal({ open: true });
  };

  const openEdit = (brand: DeviceBrandDTO) => {
    form.setFieldsValue({
      code: brand.code,
      name: brand.name,
      logo_url: brand.logo_url,
      website: brand.website,
      notes: brand.notes,
    });
    setModal({ open: true, brand });
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (modal.brand) {
      updateMutation.mutate({
        id: modal.brand.id,
        body: {
          name: values.name,
          logo_url: values.logo_url,
          website: values.website,
          notes: values.notes,
        },
      });
    } else {
      createMutation.mutate({
        code: values.code,
        name: values.name,
        logo_url: values.logo_url,
        website: values.website,
        notes: values.notes,
      });
    }
  };

  const columns: TableColumnsType<DeviceBrandDTO> = [
    {
      title: 'Logo',
      dataIndex: 'logo_url',
      width: 60,
      render: (v: string | undefined, r) =>
        v ? (
          <Avatar src={v} size={32} />
        ) : (
          <Avatar size={32} style={{ background: 'var(--ant-color-primary-bg)' }}>
            {r.name.slice(0, 1)}
          </Avatar>
        ),
    },
    { title: 'code', dataIndex: 'code', width: 140 },
    { title: '品牌名', dataIndex: 'name' },
    {
      title: '关联型号',
      key: 'model_count',
      width: 100,
      render: (_, r) => <Tag>{modelsByBrand[r.id] ?? 0}</Tag>,
    },
    { title: '官网', dataIndex: 'website', render: (v?: string) => v || '-' },
    ...(isAdmin
      ? [
          {
            title: '操作',
            key: 'actions',
            width: 160,
            render: (_: unknown, r: DeviceBrandDTO) => {
              const inUse = (modelsByBrand[r.id] ?? 0) > 0;
              return (
                <Space size={4}>
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>
                    编辑
                  </Button>
                  <Popconfirm
                    title={inUse ? '有型号引用，不能删除' : '确认删除此品牌？'}
                    onConfirm={() => deleteMutation.mutate(r.id)}
                    disabled={inUse}
                  >
                    <Button size="small" danger disabled={inUse}>
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              );
            },
          },
        ]
      : []),
  ];

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        {isAdmin && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建品牌
          </Button>
        )}
      </Space>

      <Table<DeviceBrandDTO>
        columns={columns}
        dataSource={brands}
        loading={isLoading}
        rowKey="id"
        size="middle"
        pagination={false}
      />

      <Modal
        title={modal.brand ? `编辑品牌：${modal.brand.name}` : '新建品牌'}
        open={modal.open}
        onOk={handleSubmit}
        onCancel={() => setModal({ open: false })}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="code"
            label="code（唯一标识）"
            rules={[
              { required: true, message: '请输入 code' },
              {
                pattern: /^[a-z0-9_-]+$/,
                message: '仅支持小写字母、数字、下划线、短横线',
              },
            ]}
          >
            <Input placeholder="panasonic" disabled={!!modal.brand} />
          </Form.Item>
          <Form.Item
            name="name"
            label="品牌名"
            rules={[{ required: true, message: '请输入品牌名' }]}
          >
            <Input placeholder="松下" />
          </Form.Item>
          <Form.Item name="logo_url" label="Logo URL">
            <Input placeholder="https://...（或留空）" />
          </Form.Item>
          <Form.Item name="website" label="官网">
            <Input placeholder="https://panasonic.cn" />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

/* ==================== Helpers ==================== */

function slugifyCode(input: string): string {
  const trimmed = input.trim().toLowerCase();
  const ascii = trimmed.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return ascii || `brand-${Date.now()}`;
}
