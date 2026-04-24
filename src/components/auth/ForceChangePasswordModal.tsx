/**
 * Phase 11.9：首登强制改密 Modal。
 *
 * 行为：
 *   - 由布局层（AdminLayout / VendorLayout）在 /auth/me 返回 must_change_pwd=true 时强制挂载
 *   - 禁止关闭（maskClosable=false + closable=false + ESC 不生效）
 *   - 改密成功后清本地 user.must_change_pwd，Modal 卸载，原 UI 可用
 */
import { useState } from 'react';
import { Alert, Form, Input, Modal } from 'antd';
import { useMessage } from '@/hooks/useMessage';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/stores/authStore';

export default function ForceChangePasswordModal() {
  const { message } = useMessage();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [form] = Form.useForm<{
    old_password: string;
    new_password: string;
    confirm_password: string;
  }>();
  const [submitting, setSubmitting] = useState(false);

  const open = !!user?.must_change_pwd;

  const handleOk = async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    setSubmitting(true);
    try {
      await authApi.changePassword(values.old_password, values.new_password);
      message.success('密码已更新');
      if (user) {
        setUser({ ...user, must_change_pwd: false });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      message.error('改密失败：' + msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title="首次登录需修改密码"
      maskClosable={false}
      keyboard={false}
      closable={false}
      okText="确认修改"
      cancelButtonProps={{ style: { display: 'none' } }}
      confirmLoading={submitting}
      onOk={handleOk}
      destroyOnHidden
    >
      <Alert
        type="info"
        showIcon
        message="出于安全考虑，管理员代开账号的初始密码必须在首次登录时修改。"
        style={{ marginBottom: 12 }}
      />
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          name="old_password"
          label="旧密码（初始密码）"
          rules={[{ required: true, message: '请输入旧密码' }]}
        >
          <Input.Password autoFocus autoComplete="current-password" />
        </Form.Item>
        <Form.Item
          name="new_password"
          label="新密码"
          rules={[
            { required: true, message: '请输入新密码' },
            { min: 8, message: '至少 8 位' },
            {
              validator: (_, v?: string) => {
                if (!v) return Promise.resolve();
                const hasLower = /[a-z]/.test(v);
                const hasUpper = /[A-Z]/.test(v);
                const hasDigit = /[0-9]/.test(v);
                if ([hasLower, hasUpper, hasDigit].filter(Boolean).length < 2) {
                  return Promise.reject(new Error('至少包含大小写字母 / 数字中的两类'));
                }
                return Promise.resolve();
              },
            },
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          name="confirm_password"
          label="确认新密码"
          dependencies={['new_password']}
          rules={[
            { required: true, message: '请再次输入新密码' },
            ({ getFieldValue }) => ({
              validator(_, v?: string) {
                if (!v || getFieldValue('new_password') === v) return Promise.resolve();
                return Promise.reject(new Error('两次密码不一致'));
              },
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
