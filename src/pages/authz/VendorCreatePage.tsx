import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Button, Card, Form, Input, InputNumber, Result, Space, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import PageHeader from '@/components/common/PageHeader';
import { useMessage } from '@/hooks/useMessage';
import { vendorApi } from '@/api/vendor';
import { makeDefaultExpiry } from '@/lib/authz/expiry';
import type { CreateVendorBody, Vendor } from '@/types/authz';

const { Text, Paragraph } = Typography;

interface FormValues {
  code: string;
  name: string;
  contact_name: string;
  contact_phone: string;
  contact_email?: string;
  grant_days: number;
  notes?: string;
}

/**
 * VendorCreatePage —— 新建供应商 + 主账号（PRD §7.7 Step 1）。
 *
 * 提交后：
 *   - 后端同步调 SSO 创建主账号，拿到 excs_users.id + sso_user_id；
 *   - 自动发 content_vendor @ O grant；
 *   - Redis 存一次性邀请 token，TTL 24h；
 *
 * 成功态页展示：
 *   - vendor 基本信息
 *   - 「跳转用户详情权限 Tab」按钮（授权前端 /platform/users/:id?tab=authz）
 *   - 「查看供应商详情」按钮 → /platform/authz/vendors/:id
 */
export default function VendorCreatePage() {
  const navigate = useNavigate();
  const { message } = useMessage();
  const [form] = Form.useForm<FormValues>();
  const [createdVendor, setCreatedVendor] = useState<Vendor | null>(null);

  const createMutation = useMutation({
    mutationFn: (body: CreateVendorBody) => vendorApi.create(body),
    onSuccess: (res) => {
      const v = res.data.data;
      if (v) {
        setCreatedVendor(v);
        message.success('供应商已创建，邀请链接已生成');
      }
    },
    onError: (err: Error) => {
      message.error(err.message || '创建失败');
    },
  });

  /** vendor 默认授权期 180 天（PRD §6.4），走统一 helper */
  const defaultDays = (() => {
    const d: Dayjs | null = makeDefaultExpiry(false, 'vendor');
    return d ? d.diff(dayjs(), 'day') : 180;
  })();

  function handleSubmit(values: FormValues) {
    const grantExpiresAt = dayjs().add(values.grant_days, 'day').toISOString();
    createMutation.mutate({
      code: values.code.trim(),
      name: values.name.trim(),
      contact_name: values.contact_name.trim(),
      contact_phone: values.contact_phone.trim(),
      contact_email: values.contact_email?.trim(),
      grant_expires_at: grantExpiresAt,
      notes: values.notes?.trim(),
    });
  }

  if (createdVendor) {
    return (
      <div>
        <PageHeader title="供应商创建成功" />
        <Result
          status="success"
          title={`${createdVendor.name} 已创建`}
          subTitle={
            <Space direction="vertical" size={4} style={{ marginTop: 8 }}>
              <Text>
                vendor_id: <Text code>{createdVendor.id}</Text> · 主账号 user_id:{' '}
                <Text code>{createdVendor.primary_user_id}</Text>
              </Text>
              <Text type="secondary">
                邀请链接已通过 Redis 生成（TTL 24h）；请从 SSO 管理后台查询该账号的初始密码并一同发给主账号。
              </Text>
            </Space>
          }
          extra={[
            <Button key="detail" type="primary" onClick={() => navigate(`/platform/authz/vendors/${createdVendor.id}`)}>
              查看供应商详情
            </Button>,
            <Button
              key="authz"
              onClick={() =>
                navigate(`/platform/users/${createdVendor.primary_user_id}?tab=authz`)
              }
            >
              跳转用户权限 Tab
            </Button>,
            <Button
              key="another"
              onClick={() => {
                setCreatedVendor(null);
                form.resetFields();
              }}
            >
              继续创建
            </Button>,
          ]}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="新建供应商"
        extra={<Button onClick={() => navigate('/platform/authz/vendors')}>返回列表</Button>}
      />
      <Card>
        <Paragraph type="secondary">
          填写供应商公司信息 + 主账号联系人。提交后会同步在 SSO 创建账号（account_type=vendor）并自动发 content_vendor @ O 授权；
          系统会生成一次性邀请链接（TTL 24h），复制给主账号完成首次登录。
        </Paragraph>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ grant_days: defaultDays }}
          onFinish={handleSubmit}
          style={{ maxWidth: 640 }}
        >
          <Form.Item
            name="code"
            label="供应商代码（唯一）"
            rules={[{ required: true, message: '必填' }, { max: 64 }]}
          >
            <Input placeholder="如 acme_media" />
          </Form.Item>
          <Form.Item
            name="name"
            label="供应商名称"
            rules={[{ required: true, message: '必填' }, { max: 128 }]}
          >
            <Input placeholder="如 北京优异数字媒体有限公司" />
          </Form.Item>
          <Form.Item
            name="contact_name"
            label="主账号联系人姓名"
            rules={[{ required: true, message: '必填' }, { max: 64 }]}
          >
            <Input placeholder="如 张三" />
          </Form.Item>
          <Form.Item
            name="contact_phone"
            label="主账号手机号（SSO 注册 + 登录用）"
            rules={[
              { required: true, message: '必填' },
              { pattern: /^1\d{10}$/, message: '请输入 11 位大陆手机号' },
            ]}
          >
            <Input placeholder="如 13800138000" />
          </Form.Item>
          <Form.Item
            name="contact_email"
            label="主账号邮箱（可选）"
            rules={[{ type: 'email', message: '邮箱格式无效' }]}
          >
            <Input placeholder="如 zhangsan@acme.com" />
          </Form.Item>
          <Form.Item
            name="grant_days"
            label="授权期（天）"
            rules={[{ required: true, type: 'number', min: 1, max: 3650 }]}
            extra="默认 180 天（PRD §6.4 vendor 强制过期），可调整。"
          >
            <InputNumber style={{ width: 180 }} min={1} max={3650} />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} maxLength={500} showCount />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={createMutation.isPending}>
                创建供应商 + 主账号
              </Button>
              <Button onClick={() => navigate('/platform/authz/vendors')}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
