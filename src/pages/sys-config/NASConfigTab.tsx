import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CopyOutlined,
  KeyOutlined,
  SaveOutlined,
  UndoOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import RiskyActionButton from '@/components/authz/RiskyActionButton';
import { sysConfigApi } from '@/api/sysConfig';
import { nasArchiveApi } from '@/api/nasArchive';
import { queryKeys } from '@/api/queryKeys';
import { useMessage } from '@/hooks/useMessage';
import type { ConfigItem } from '@/api/gen/client';

const { Paragraph, Text } = Typography;

/**
 * NASConfigTab —— 系统参数 NAS 分组专用表单
 *
 * 不同于通用 GroupConfigForm：
 * - `agent_token_hash` 从 DB 读的是 bcrypt hash，编辑无意义；替换为状态显示 + "重新生成 Token" 按钮
 * - 生成成功的明文仅在 Modal 中**一次性展示**，允许一键复制
 * - `alert_user_ids` 作为原始 JSON 数组编辑（Phase 8 可升级为用户选择器）
 */
export default function NASConfigTab() {
  const { message } = useMessage();
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const [plainTokenModal, setPlainTokenModal] = useState<{ open: boolean; token: string }>({
    open: false,
    token: '',
  });

  const { data: configData, isLoading } = useQuery({
    queryKey: queryKeys.sysConfigGroup('nas'),
    queryFn: () => sysConfigApi.getGroupConfigs('nas'),
    select: (res) => res.data.data,
  });

  const items: ConfigItem[] = useMemo(() => configData?.items ?? [], [configData]);
  const byKey = useMemo(() => {
    const m: Record<string, ConfigItem> = {};
    items.forEach((i) => (m[i.key] = i));
    return m;
  }, [items]);

  const tokenItem = byKey['agent_token_hash'];
  const hasToken = !!(tokenItem && tokenItem.value && !tokenItem.value.startsWith('***') && tokenItem.value.length > 0);

  const updateMutation = useMutation({
    mutationFn: (payload: { key: string; value: string }[]) =>
      sysConfigApi.updateGroupConfigs('nas', payload),
    onSuccess: () => {
      message.success('NAS 配置已保存');
      queryClient.invalidateQueries({ queryKey: queryKeys.sysConfigGroup('nas') });
    },
    onError: () => message.error('保存失败'),
  });

  const regenerateMutation = useMutation({
    mutationFn: ({ reason }: { reason?: string }) => nasArchiveApi.regenerateToken(reason),
    onSuccess: (res) => {
      const token = res.data.data.agent_token;
      setPlainTokenModal({ open: true, token });
      queryClient.invalidateQueries({ queryKey: queryKeys.sysConfigGroup('nas') });
    },
    onError: (err: Error) => message.error(err.message || '生成 Token 失败'),
  });

  const handleSave = () => {
    const values = form.getFieldsValue();
    const payload: { key: string; value: string }[] = [];
    items.forEach((item) => {
      if (item.key === 'agent_token_hash') return; // 专用按钮处理，不从表单提交
      const raw = values[item.key];
      if (raw === undefined || raw === null) return;
      payload.push({ key: item.key, value: String(raw) });
    });
    if (payload.length === 0) {
      message.info('没有可保存的改动');
      return;
    }
    updateMutation.mutate(payload);
  };

  const handleReset = () => {
    const init: Record<string, unknown> = {};
    items.forEach((item) => {
      if (item.key === 'agent_token_hash') return;
      init[item.key] = initialValueFor(item);
    });
    form.setFieldsValue(init);
  };

  const handleCopyToken = async () => {
    try {
      await navigator.clipboard.writeText(plainTokenModal.token);
      message.success('Token 已复制到剪贴板');
    } catch {
      message.error('复制失败，请手动选择并复制');
    }
  };

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <Spin />
      </div>
    );
  }

  const initialValues: Record<string, unknown> = {};
  items.forEach((item) => {
    if (item.key === 'agent_token_hash') return;
    initialValues[item.key] = initialValueFor(item);
  });

  return (
    <>
      <Card style={{ marginTop: 16 }} styles={{ body: { paddingTop: 24 } }}>
        <div style={{ marginBottom: 20, fontWeight: 600, fontSize: 15 }}>
          <span
            style={{
              display: 'inline-block',
              width: 3,
              height: 16,
              background: '#722ed1',
              borderRadius: 2,
              marginRight: 8,
              verticalAlign: 'text-bottom',
            }}
          />
          NAS 归档
        </div>

        <Form form={form} layout="horizontal" labelCol={{ span: 6 }} wrapperCol={{ span: 12 }} initialValues={initialValues}>
          {/* 总开关 */}
          {byKey['enabled'] && (
            <Form.Item name="enabled" label="启用 NAS 归档" valuePropName="checked" help="关闭后上传流程与改造前一致，NAS 相关 UI 不可见。" getValueFromEvent={(v) => (v ? 'true' : 'false')} getValueProps={(v) => ({ checked: v === 'true' || v === true })}>
              <Switch />
            </Form.Item>
          )}

          {/* Agent Token 专用控件（不走普通 input） */}
          <Form.Item label="Agent Token" help="用于群晖 Agent 与服务端认证；DB 仅保存 bcrypt 哈希，明文仅在重新生成时返回一次。">
            <Space size={12} wrap>
              {hasToken ? (
                <Tag color="green">已设置</Tag>
              ) : (
                <Tag color="orange" icon={<WarningOutlined />}>尚未生成</Tag>
              )}
              <RiskyActionButton
                action="config.regenerate_nas_token"
                icon={<KeyOutlined />}
                type={hasToken ? 'default' : 'primary'}
                loading={regenerateMutation.isPending}
                confirmTitle="重新生成 NAS Agent Token"
                confirmContent="重新生成将使旧 Token 立即失效，所有群晖 Agent 必须更新配置后才能继续同步。请填写操作原因（≥ 5 字，审计用）。"
                onConfirm={async (reason) => {
                  await regenerateMutation.mutateAsync({ reason });
                }}
              >
                {hasToken ? '重新生成 Token' : '生成 Token'}
              </RiskyActionButton>
            </Space>
          </Form.Item>

          {/* 通用字符串 / 数字字段 */}
          {byKey['share_root'] && (
            <Form.Item name="share_root" label="共享根路径" help="NAS 上共享根目录（容器内映射路径），示例：/volume1/excs">
              <Input placeholder="/volume1/excs" />
            </Form.Item>
          )}
          {byKey['retry_max'] && (
            <Form.Item name="retry_max" label="重试上限" help="Agent 单文件失败重试上限，超过后标记 failed 并告警。">
              <InputNumber min={1} max={100} style={{ width: '100%' }} />
            </Form.Item>
          )}
          {byKey['sts_ttl_sec'] && (
            <Form.Item name="sts_ttl_sec" label="STS TTL（秒）" help="临时凭证过期时间，推荐 900 以内。">
              <InputNumber min={900} max={3600} step={60} style={{ width: '100%' }} />
            </Form.Item>
          )}
          {byKey['sync_timeout_sec'] && (
            <Form.Item name="sync_timeout_sec" label="同步超时（秒）" help="Agent 领取后多久未 ack 将自动回退到 pending。">
              <InputNumber min={60} max={86400} step={60} style={{ width: '100%' }} />
            </Form.Item>
          )}
          {byKey['max_backlog_gb'] && (
            <Form.Item name="max_backlog_gb" label="积压告警阈值（GB）" help="OSS raw 桶积压超过此阈值后告警（每 30 分钟扫描一次）。">
              <InputNumber min={1} max={100_000} style={{ width: '100%' }} />
            </Form.Item>
          )}
          {byKey['alert_user_ids'] && (
            <Form.Item name="alert_user_ids" label="告警接收人" help="用户 ID 列表（JSON 数组，例 [1,2,3]），接收 NAS 离线 / 失败 / 积压短信。">
              <Input placeholder="[]" style={{ fontFamily: 'monospace' }} />
            </Form.Item>
          )}

          <Form.Item wrapperCol={{ offset: 6, span: 12 }}>
            <Space>
              <Button onClick={handleReset} icon={<UndoOutlined />}>重置表单</Button>
              <Button type="primary" onClick={handleSave} loading={updateMutation.isPending} icon={<SaveOutlined />}>
                保存配置
              </Button>
            </Space>
          </Form.Item>
        </Form>

        <Alert
          message="配置生效提示"
          description="开关、Token、路径等 NAS 参数保存后立即生效；修改 Token 后需同步到群晖 Agent 容器的 env。告警接收人通过短信发送。"
          type="info"
          showIcon
          style={{ marginTop: 8 }}
        />
      </Card>

      <Modal
        title={<Space><KeyOutlined />新的 Agent Token</Space>}
        open={plainTokenModal.open}
        onCancel={() => setPlainTokenModal({ open: false, token: '' })}
        footer={[
          <Button key="copy" type="primary" icon={<CopyOutlined />} onClick={handleCopyToken}>
            复制 Token
          </Button>,
          <Button key="close" onClick={() => setPlainTokenModal({ open: false, token: '' })}>
            我已保存，关闭
          </Button>,
        ]}
        maskClosable={false}
        closable={false}
      >
        <Alert
          type="warning"
          showIcon
          message="请立即复制并妥善保存，此明文仅展示一次"
          description="关闭本窗口后将无法再查看此 Token。后续操作必须使用此 Token 配置群晖 Agent。"
          style={{ marginBottom: 16 }}
        />
        <Paragraph
          copyable={{ text: plainTokenModal.token }}
          style={{
            fontFamily: 'monospace',
            fontSize: 13,
            background: 'rgba(114, 46, 209, 0.08)',
            padding: 12,
            borderRadius: 6,
            wordBreak: 'break-all',
            marginBottom: 0,
          }}
        >
          <Text strong>{plainTokenModal.token}</Text>
        </Paragraph>
      </Modal>
    </>
  );
}

function initialValueFor(item: ConfigItem): string | number | boolean {
  switch (item.value_type) {
    case 'int':
      return Number(item.value || 0);
    case 'bool':
      return item.value === 'true';
    default:
      return item.value ?? '';
  }
}
