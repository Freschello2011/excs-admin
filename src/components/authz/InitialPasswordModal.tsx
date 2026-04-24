/**
 * InitialPasswordModal —— Phase 9 gap #2 的一次性初始密码展示。
 *
 * 背景：
 *   - POST /authz/vendors（+ /members/invite）响应体带 `initial_password`（SSO 本次代生
 *     成），仅此一次可见；关闭弹窗后不会再有明文。
 *   - 前端必须提示管理员/主账号「立即复制并线下发送给新用户」。
 *
 * 用法：
 *   <InitialPasswordModal open password="abc123" phone="13800000000" onClose={...} />
 * 关闭按钮在复制 3 秒内变「已复制」，但不会强制先复制再关闭（避免使用阻塞）。
 */
import { useEffect, useState } from 'react';
import { Alert, Button, Input, Modal, Space, Typography } from 'antd';
import { useMessage } from '@/hooks/useMessage';

const { Text } = Typography;

interface InitialPasswordModalProps {
  open: boolean;
  /** SSO 本次返回的初始密码；空字符串时给出"未返回"提示而不是崩溃 */
  password: string;
  /** 展示用："密码给 13800138000" */
  phone?: string;
  /** 可选说明（默认：请复制并线下交给该账号） */
  description?: React.ReactNode;
  onClose: () => void;
}

export default function InitialPasswordModal({
  open,
  password,
  phone,
  description,
  onClose,
}: InitialPasswordModalProps) {
  const { message } = useMessage();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  async function handleCopy() {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      message.success('初始密码已复制到剪贴板');
      setTimeout(() => setCopied(false), 3000);
    } catch {
      message.error('复制失败，请手动选中上方密码并复制');
    }
  }

  return (
    <Modal
      title="账号已创建，初始密码仅此一次可见"
      open={open}
      onCancel={onClose}
      destroyOnHidden
      footer={[
        <Button key="copy" type="primary" disabled={!password} onClick={handleCopy}>
          {copied ? '已复制 ✓' : '复制初始密码'}
        </Button>,
        <Button key="close" onClick={onClose}>
          我已保存，关闭
        </Button>,
      ]}
    >
      {!password ? (
        <Alert
          type="warning"
          showIcon
          message="SSO 未返回初始密码"
          description="该账号可能由用户自设密码，或 SSO 版本较旧；请通过 SSO 管理后台或「忘记密码」流程给用户设置密码。"
        />
      ) : (
        <>
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message="关闭本弹窗后将无法再次查看此密码"
            description={
              description ??
              '请立即复制并通过安全渠道（线下 / 企业微信私聊）交给账号本人；用户首次登录后建议自行修改。'
            }
          />
          {phone && (
            <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
              接收账号（手机）：<Text code>{phone}</Text>
            </Text>
          )}
          <Space.Compact style={{ width: '100%' }}>
            <Input
              value={password}
              readOnly
              onFocus={(e) => e.currentTarget.select()}
              style={{ fontFamily: 'monospace' }}
            />
            <Button onClick={handleCopy}>{copied ? '已复制' : '复制'}</Button>
          </Space.Compact>
        </>
      )}
    </Modal>
  );
}
