/**
 * device-mgmt-v2 P9-B 前端补齐：厂家凭据管理 tab。
 *
 * 挂载：DeviceCatalogPage → [厂家凭据] tab。
 *
 * 功能：
 *   - 列表：vendor_key / label / phone_masked / 完整 / last_rotated_at
 *   - 新建/编辑：vendor_key=smyoo 时强校验 phone/password/client_id/client_secret 4 字段
 *   - 删除：被 device 引用时后端 409，UI toast 中文提示
 *
 * 安全：明文 payload 仅通过 modal Form 提交一次（onClose 后 form 立刻 reset）；
 * 列表绝不显示明文；编辑模式下原值不回显，留空表示"不改"。
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import DangerConfirm from '@/components/common/DangerConfirm';
import { useMessage } from '@/hooks/useMessage';
import {
  vendorCredentialApi,
  SMYOO_REQUIRED_KEYS,
  type VendorCredentialDTO,
} from '@/api/vendorCredential';

interface FormState {
  id?: number;
  vendor_key: string;
  label: string;
  notes: string;
  phone: string;
  password: string;
  client_id: string;
  client_secret: string;
}

const EMPTY_FORM: FormState = {
  vendor_key: 'smyoo',
  label: '',
  notes: '',
  phone: '',
  password: '',
  client_id: '',
  client_secret: '',
};

export default function VendorCredentialsTab() {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<VendorCredentialDTO | null>(null);

  const { data: list = [], isLoading } = useQuery({
    queryKey: ['vendor-credentials'],
    queryFn: () => vendorCredentialApi.list(),
    select: (res) => res.data.data ?? [],
  });

  const createMutation = useMutation({
    mutationFn: vendorCredentialApi.create,
    onSuccess: () => {
      message.success('厂家凭据已新建');
      queryClient.invalidateQueries({ queryKey: ['vendor-credentials'] });
      setEditorOpen(false);
    },
    onError: (err: unknown) => {
      const m = err instanceof Error ? err.message : '新建失败';
      message.error(m);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Parameters<typeof vendorCredentialApi.update>[1] }) =>
      vendorCredentialApi.update(id, body),
    onSuccess: () => {
      message.success('厂家凭据已更新');
      queryClient.invalidateQueries({ queryKey: ['vendor-credentials'] });
      setEditorOpen(false);
    },
    onError: (err: unknown) => {
      const m = err instanceof Error ? err.message : '更新失败';
      message.error(m);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: vendorCredentialApi.delete,
    onSuccess: () => {
      message.success('厂家凭据已删除');
      queryClient.invalidateQueries({ queryKey: ['vendor-credentials'] });
    },
    onError: (err: unknown) => {
      // axios 拦截器把 409 拍成 Error("...")；中文友好提示
      const e = err as { response?: { status?: number; data?: { message?: string } } };
      if (e?.response?.status === 409) {
        message.error(
          e.response?.data?.message || '该凭据被设备引用中，无法删除——请先把使用中的设备改用其它凭据',
        );
      } else {
        message.error(e?.response?.data?.message || (err instanceof Error ? err.message : '删除失败'));
      }
    },
  });

  const openCreate = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const openEdit = (record: VendorCredentialDTO) => {
    setEditing(record);
    setEditorOpen(true);
  };

  const columns: TableColumnsType<VendorCredentialDTO> = [
    {
      title: '凭据',
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontWeight: 500 }}>{r.label}</span>
          <span style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary)' }}>
            <Tag style={{ marginInlineEnd: 4 }}>{r.vendor_key}</Tag>
            {r.phone_masked && <code>{r.phone_masked}</code>}
          </span>
        </Space>
      ),
    },
    {
      title: '完整',
      width: 90,
      render: (_, r) =>
        r.complete ? (
          <Tag color="success">✓ 齐全</Tag>
        ) : (
          <Tooltip title="必填字段不全（闪优需 phone/password/client_id/client_secret）">
            <Tag color="warning">⚠ 缺字段</Tag>
          </Tooltip>
        ),
    },
    {
      title: '上次轮换',
      dataIndex: 'last_rotated_at',
      width: 160,
      render: (v?: string | null) => {
        if (!v) return <span style={{ color: 'var(--ant-color-text-tertiary)' }}>从未轮换</span>;
        return <span style={{ fontSize: 12 }}>{new Date(v).toLocaleString('zh-CN', { hour12: false })}</span>;
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 160,
      render: (v: string) => (
        <span style={{ fontSize: 12 }}>{new Date(v).toLocaleString('zh-CN', { hour12: false })}</span>
      ),
    },
    {
      title: '备注',
      dataIndex: 'notes',
      ellipsis: true,
      render: (v?: string) => v || <span style={{ color: 'var(--ant-color-text-tertiary)' }}>-</span>,
    },
    {
      title: '操作',
      width: 160,
      render: (_, r) => (
        <Space size="small">
          <a onClick={() => openEdit(r)}>编辑/轮换</a>
          <DangerConfirm
            title={`删除凭据「${r.label}」？`}
            description="如被设备引用将拒绝删除（409）；删除后该凭据加密 payload 永久丢失"
            onConfirm={() => deleteMutation.mutate(r.id)}
          >
            <a style={{ color: 'var(--ant-color-error)' }}>删除</a>
          </DangerConfirm>
        </Space>
      ),
    },
  ];

  const handleSubmit = async (values: FormState) => {
    if (editing) {
      // 更新：仅在 admin 填了字段时把 payload 传上去（触发 last_rotated_at = now）
      const payload: Record<string, string> = {};
      if (values.phone) payload.phone = values.phone;
      if (values.password) payload.password = values.password;
      if (values.client_id) payload.client_id = values.client_id;
      if (values.client_secret) payload.client_secret = values.client_secret;
      const body: Parameters<typeof vendorCredentialApi.update>[1] = {
        label: values.label,
        notes: values.notes,
      };
      if (Object.keys(payload).length > 0) {
        body.payload = payload;
      }
      updateMutation.mutate({ id: editing.id, body });
    } else {
      const payload: Record<string, string> = {
        phone: values.phone,
        password: values.password,
        client_id: values.client_id,
        client_secret: values.client_secret,
      };
      createMutation.mutate({
        vendor_key: values.vendor_key,
        label: values.label,
        notes: values.notes || undefined,
        payload,
      });
    }
  };

  return (
    <div>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="厂家凭据库（excs_vendor_credentials）"
        description={
          <span>
            存储 vendor 账号 phone/password/client_id/client_secret，AES-256-GCM 加密入库，永不在 UI 回显。
            闪优 16 路 4G 开关 preset 通过 vendor_credential_id 委托 SmyooPlugin 使用本表凭据登录云端。
            服务器迁移时务必同步主密钥（详见{' '}
            <Typography.Link href="/01-docs/05-ops/deploy-guide.md" target="_blank">
              deploy-guide.md
            </Typography.Link>
            ）。
          </span>
        }
      />

      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新建凭据
        </Button>
        <span style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 12 }}>
          共 {list.length} 条
        </span>
      </Space>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={list}
        loading={isLoading}
        pagination={false}
        size="middle"
      />

      <CredentialEditor
        open={editorOpen}
        editing={editing}
        loading={createMutation.isPending || updateMutation.isPending}
        onCancel={() => setEditorOpen(false)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

function CredentialEditor({
  open,
  editing,
  loading,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  editing: VendorCredentialDTO | null;
  loading: boolean;
  onCancel: () => void;
  onSubmit: (values: FormState) => void;
}) {
  const [form] = Form.useForm<FormState>();

  // open 时填充 editing 元数据；payload 字段始终留空（明文不回显）
  const initialValues: FormState = editing
    ? {
        ...EMPTY_FORM,
        vendor_key: editing.vendor_key,
        label: editing.label,
        notes: editing.notes ?? '',
      }
    : EMPTY_FORM;

  // vendor_key 字段在编辑模式下 disabled、新建模式下默认 smyoo —— 无需 useWatch
  // （Form.useWatch 在 modal 关闭时 form 未挂载会触发 antd 警告）。
  const isSmyoo = editing ? editing.vendor_key === 'smyoo' : true;

  return (
    <Modal
      open={open}
      title={editing ? `编辑凭据 — ${editing.label}` : '新建厂家凭据'}
      onCancel={() => {
        form.resetFields();
        onCancel();
      }}
      onOk={async () => {
        try {
          const v = await form.validateFields();
          onSubmit(v);
        } catch {
          /* validate 失败 antd 会自动定位 */
        }
      }}
      okText={editing ? '保存' : '新建'}
      confirmLoading={loading}
      destroyOnClose
      width={560}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={initialValues}
        preserve={false}
      >
        <Form.Item
          name="vendor_key"
          label="厂家 key"
          rules={[{ required: true, message: '必填' }]}
          extra="如 smyoo（闪优 4G）；与 preset 的 delegate_plugin.plugin_id 对齐"
        >
          <Input maxLength={64} disabled={!!editing} placeholder="smyoo" />
        </Form.Item>

        <Form.Item
          name="label"
          label="显示名"
          rules={[{ required: true, message: '必填' }, { max: 100 }]}
          extra="如「我公司主账号」、「广州二号项目专用账号」"
        >
          <Input placeholder="我公司主账号 20019****" />
        </Form.Item>

        {isSmyoo && (
          <>
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message={
                editing
                  ? '编辑模式：留空表示不修改；任何字段填了就会触发完整 payload 重写 + last_rotated_at 刷新。'
                  : '闪优 vendor_key=smyoo 必填以下 4 字段（缺一不可），从闪优后台开发者中心获取。'
              }
            />
            <Form.Item
              name="phone"
              label="phone（账号手机号）"
              rules={editing ? [] : [{ required: true, message: '闪优凭据必填' }]}
            >
              <Input maxLength={32} placeholder="20019812736" />
            </Form.Item>
            <Form.Item
              name="password"
              label="password"
              rules={editing ? [] : [{ required: true, message: '闪优凭据必填' }]}
            >
              <Input.Password autoComplete="new-password" placeholder={editing ? '留空 = 不修改' : ''} />
            </Form.Item>
            <Form.Item
              name="client_id"
              label="client_id"
              rules={editing ? [] : [{ required: true, message: '闪优凭据必填' }]}
            >
              <Input placeholder={editing ? '留空 = 不修改' : ''} />
            </Form.Item>
            <Form.Item
              name="client_secret"
              label="client_secret"
              rules={editing ? [] : [{ required: true, message: '闪优凭据必填' }]}
            >
              <Input.Password autoComplete="new-password" placeholder={editing ? '留空 = 不修改' : ''} />
            </Form.Item>
          </>
        )}

        <Form.Item name="notes" label="备注（可选）" extra="厂家联系人 / 续费日期等管理信息">
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// 触发 SMYOO_REQUIRED_KEYS 不被 unused 报错（值校验在后端，前端只用做 type assertion）
void SMYOO_REQUIRED_KEYS;
