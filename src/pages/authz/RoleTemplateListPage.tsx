import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Button, Space, Tag, Tooltip, Modal, Form, Input, Select, Switch } from 'antd';
import { PlusOutlined, CopyOutlined, DeleteOutlined, EditOutlined, WarningOutlined } from '@ant-design/icons';
import type { TableColumnsType } from 'antd';
import dayjs from 'dayjs';
import PageHeader from '@/components/common/PageHeader';
import { useMessage } from '@/hooks/useMessage';
import Can from '@/components/authz/Can';
import { authzApi } from '@/api/authz';
import type { RoleTemplate, CopyRoleTemplateBody } from '@/types/authz';

const queryKey = ['authz', 'role-templates'];

export default function RoleTemplateListPage() {
  const { message, modal } = useMessage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [copySource, setCopySource] = useState<RoleTemplate | null>(null);
  const [copyForm] = Form.useForm<CopyRoleTemplateBody>();

  /* P2.3（2026-04-25）：URL 同步 ?keyword=&domain=&critical= */
  const [searchParams, setSearchParams] = useSearchParams();
  const keyword = searchParams.get('keyword') ?? '';
  const domainFilter = searchParams.get('domain') ?? 'all';
  const criticalOnly = searchParams.get('critical') === '1';

  function patch(p: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams);
    Object.entries(p).forEach(([k, v]) => {
      if (v == null || v === '' || v === 'all' || v === '0') next.delete(k);
      else next.set(k, v);
    });
    setSearchParams(next, { replace: true });
  }

  const [keywordDraft, setKeywordDraft] = useState(keyword);
  useEffect(() => { setKeywordDraft(keyword); }, [keyword]);

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => authzApi.listTemplates(),
    select: (res) => res.data.data?.list ?? [],
  });

  /** 列表中所有 action_codes 的 domain（取 code 的 . 前缀），构造 filter 选项 */
  const domainOptions = useMemo(() => {
    const set = new Set<string>();
    (data ?? []).forEach((t) => {
      (t.action_codes ?? []).forEach((c) => {
        const dot = c.indexOf('.');
        if (dot > 0) set.add(c.slice(0, dot));
        if (c === '*') set.add('*');
      });
    });
    return Array.from(set).sort().map((d) => ({ value: d, label: d }));
  }, [data]);

  const filtered = useMemo(() => {
    return (data ?? []).filter((t) => {
      if (criticalOnly && !t.has_critical) return false;
      if (domainFilter !== 'all') {
        const hit = (t.action_codes ?? []).some((c) =>
          domainFilter === '*' ? c === '*' : c.startsWith(`${domainFilter}.`),
        );
        if (!hit) return false;
      }
      if (keyword) {
        const hay = [t.name_zh, t.code, t.description ?? ''].join(' ').toLowerCase();
        if (!hay.includes(keyword.toLowerCase())) return false;
      }
      return true;
    });
  }, [data, criticalOnly, domainFilter, keyword]);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => authzApi.deleteTemplate(id),
    onSuccess: () => {
      message.success('模板已删除');
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: Error) => {
      message.error(err.message || '删除失败');
    },
  });

  const copyMutation = useMutation({
    mutationFn: (args: { sourceId: number; body: CopyRoleTemplateBody }) =>
      authzApi.copyTemplate(args.sourceId, args.body),
    onSuccess: (res) => {
      message.success('模板已复制');
      queryClient.invalidateQueries({ queryKey });
      setCopySource(null);
      copyForm.resetFields();
      const newId = res.data.data?.id;
      if (newId) navigate(`/platform/authz/role-templates/${newId}/edit`);
    },
    onError: (err: Error) => {
      message.error(err.message || '复制失败');
    },
  });

  const handleDelete = (tpl: RoleTemplate) => {
    if (tpl.is_builtin) {
      message.warning('内置模板不能删除');
      return;
    }
    modal.confirm({
      title: `删除模板「${tpl.name_zh}」？`,
      content: '删除后该模板产生的授权记录仍保留，但后续无法再基于此模板创建新授权。',
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: () => deleteMutation.mutateAsync(tpl.id),
    });
  };

  const handleCopy = (tpl: RoleTemplate) => {
    copyForm.setFieldsValue({
      new_code: `${tpl.code}_copy`,
      new_name: `${tpl.name_zh} 副本`,
    });
    setCopySource(tpl);
  };

  const submitCopy = async () => {
    const values = await copyForm.validateFields();
    if (copySource) {
      copyMutation.mutate({ sourceId: copySource.id, body: values });
    }
  };

  const columns: TableColumnsType<RoleTemplate> = [
    {
      title: '模板',
      dataIndex: 'name_zh',
      render: (_: string, record) => (
        <Space direction="vertical" size={2}>
          <Link to={`/platform/authz/role-templates/${record.id}/edit`}>
            <strong>{record.name_zh}</strong>
          </Link>
          <span style={{ color: 'var(--ant-color-text-secondary)', fontSize: 12 }}>
            {record.code}
          </span>
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'is_builtin',
      width: 80,
      render: (v: boolean) => (v ? <Tag color="blue">内置</Tag> : <Tag>自定义</Tag>),
    },
    {
      title: 'Action 数',
      dataIndex: 'action_codes',
      width: 100,
      align: 'center',
      render: (codes: string[]) => codes?.length ?? 0,
    },
    {
      title: '风险',
      dataIndex: 'has_critical',
      width: 100,
      render: (v: boolean) =>
        v ? (
          <Tag color="red" icon={<WarningOutlined />}>
            含 critical
          </Tag>
        ) : (
          <Tag>普通</Tag>
        ),
    },
    {
      title: '版本',
      dataIndex: 'version',
      width: 70,
      align: 'center',
      render: (v: number) => `v${v}`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (s: string) => (
        <Tag color={s === 'active' ? 'green' : 'default'}>
          {s === 'active' ? '启用' : '停用'}
        </Tag>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      ellipsis: true,
      render: (v?: string) => v || '-',
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      width: 160,
      render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'),
    },
    {
      title: '操作',
      width: 220,
      render: (_: unknown, record) => (
        <Space size="small">
          <Can action="user.grant">
            <Button
              size="small"
              type="link"
              icon={<EditOutlined />}
              onClick={() => navigate(`/platform/authz/role-templates/${record.id}/edit`)}
            >
              编辑
            </Button>
          </Can>
          <Can action="user.grant">
            <Button
              size="small"
              type="link"
              icon={<CopyOutlined />}
              onClick={() => handleCopy(record)}
            >
              复制
            </Button>
          </Can>
          <Can action="user.grant">
            <Tooltip title={record.is_builtin ? '内置模板不能删除' : ''}>
              <Button
                size="small"
                type="link"
                danger
                icon={<DeleteOutlined />}
                disabled={record.is_builtin}
                onClick={() => handleDelete(record)}
                loading={deleteMutation.isPending && deleteMutation.variables === record.id}
              >
                删除
              </Button>
            </Tooltip>
          </Can>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader description="管理系统角色模板：内置模板可改名/改 action，自定义模板可增删。" />

      <Space wrap style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Space wrap>
          <Input.Search
            placeholder="搜索模板名 / code / 描述"
            allowClear
            style={{ width: 260 }}
            value={keywordDraft}
            onChange={(e) => setKeywordDraft(e.target.value)}
            onSearch={(v) => patch({ keyword: v })}
            onBlur={() => { if (keywordDraft !== keyword) patch({ keyword: keywordDraft }); }}
          />
          <Select
            style={{ width: 180 }}
            value={domainFilter}
            onChange={(v) => patch({ domain: v })}
            options={[{ value: 'all', label: '全部 domain' }, ...domainOptions]}
            placeholder="按 action domain 过滤"
            showSearch
            optionFilterProp="label"
          />
          <Tooltip title="仅显示含 critical 高危 action 的模板">
            <Space size={6}>
              <span style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary)' }}>
                仅含 critical
              </span>
              <Switch
                size="small"
                checked={criticalOnly}
                onChange={(v) => patch({ critical: v ? '1' : undefined })}
              />
            </Space>
          </Tooltip>
          <span style={{ color: 'var(--ant-color-text-secondary)', fontSize: 12 }}>
            共 {filtered.length} / {data?.length ?? 0} 个模板
          </span>
        </Space>
        <Can action="user.grant">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/platform/authz/role-templates/new')}
          >
            新建模板
          </Button>
        </Can>
      </Space>

      <Table<RoleTemplate>
        columns={columns}
        dataSource={filtered}
        loading={isLoading}
        rowKey="id"
        pagination={false}
        size="middle"
      />

      <Modal
        title={`复制模板「${copySource?.name_zh ?? ''}」`}
        open={!!copySource}
        onCancel={() => {
          setCopySource(null);
          copyForm.resetFields();
        }}
        onOk={submitCopy}
        confirmLoading={copyMutation.isPending}
        okText="创建副本"
      >
        <Form form={copyForm} layout="vertical">
          <Form.Item
            name="new_code"
            label="新模板 code"
            rules={[
              { required: true, message: '请输入 code' },
              { pattern: /^[a-z][a-z0-9_]*$/, message: '只允许小写字母、数字、下划线，以字母开头' },
            ]}
          >
            <Input placeholder="例如：technician_senior" />
          </Form.Item>
          <Form.Item
            name="new_name"
            label="新模板中文名"
            rules={[{ required: true, message: '请输入中文名' }]}
          >
            <Input placeholder="例如：高级技术员" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
