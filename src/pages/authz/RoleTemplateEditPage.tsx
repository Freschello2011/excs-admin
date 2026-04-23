import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Checkbox,
  Collapse,
  Form,
  Input,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  Alert,
} from 'antd';
import { SaveOutlined, WarningOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import { useMessage } from '@/hooks/useMessage';
import { authzApi } from '@/api/authz';
import { useAuthzMetaStore } from '@/stores/authzMetaStore';
import type { ActionDef, RiskLevel } from '@/types/authz';

const { Text } = Typography;

/** 域中文名映射（PRD §5 的分域标题） */
const DOMAIN_LABELS: Record<string, string> = {
  hall: '展厅',
  exhibit: '展项',
  device: '设备',
  scene: '场景',
  content: '内容库',
  show: '演出',
  ai: 'AI',
  template: '形象模板',
  knowledge: '知识库',
  tts: 'TTS',
  panel: '中控面板',
  notification: '通知',
  pairing: '配对',
  app: '展厅 App',
  smarthome: '智能家居',
  analytics: '统计分析',
  dashboard: '仪表盘',
  catalog: '全局资产',
  release: '版本发布',
  config: '系统配置',
  nas: 'NAS 归档',
  user: '用户与授权',
  vendor: '供应商',
  audit: '审计',
};

const RISK_META: Record<RiskLevel, { label: string; color: string }> = {
  info: { label: 'info', color: 'default' },
  low: { label: 'low', color: 'blue' },
  medium: { label: 'medium', color: 'gold' },
  high: { label: 'high', color: 'orange' },
  critical: { label: 'critical', color: 'red' },
};

/** 按 domain 分组 */
function groupByDomain(actions: ActionDef[]): Array<{ domain: string; items: ActionDef[] }> {
  const map = new Map<string, ActionDef[]>();
  for (const a of actions) {
    const arr = map.get(a.domain) ?? [];
    arr.push(a);
    map.set(a.domain, arr);
  }
  return Array.from(map.entries()).map(([domain, items]) => ({
    domain,
    items: items.slice().sort((x, y) => x.code.localeCompare(y.code)),
  }));
}

interface FormValues {
  code: string;
  name_zh: string;
  description?: string;
  action_codes: string[];
}

export default function RoleTemplateEditPage() {
  const { id } = useParams<{ id?: string }>();
  const isNew = !id || id === 'new';
  const templateId = isNew ? undefined : Number(id);

  const navigate = useNavigate();
  const { message, modal } = useMessage();
  const queryClient = useQueryClient();

  const [form] = Form.useForm<FormValues>();
  const [selectedActions, setSelectedActions] = useState<string[]>([]);

  const actions = useAuthzMetaStore((s) => s.actions);
  const loadActions = useAuthzMetaStore((s) => s.loadActions);
  const actionsLoading = useAuthzMetaStore((s) => s.loading);

  useEffect(() => {
    loadActions().catch(() => {
      message.error('加载 Action 注册表失败');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: template, isLoading } = useQuery({
    queryKey: ['authz', 'role-templates', templateId],
    queryFn: () => authzApi.getTemplate(templateId!),
    select: (res) => res.data.data,
    enabled: !isNew,
  });

  useEffect(() => {
    if (template) {
      form.setFieldsValue({
        code: template.code,
        name_zh: template.name_zh,
        description: template.description,
        action_codes: template.action_codes,
      });
      setSelectedActions(template.action_codes ?? []);
    }
  }, [template, form]);

  const createMutation = useMutation({
    mutationFn: (body: FormValues) =>
      authzApi.createTemplate({
        code: body.code,
        name_zh: body.name_zh,
        description: body.description,
        action_codes: body.action_codes,
      }),
    onSuccess: () => {
      message.success('模板已创建');
      queryClient.invalidateQueries({ queryKey: ['authz', 'role-templates'] });
      navigate('/platform/authz/role-templates');
    },
    onError: (err: Error) => message.error(err.message || '创建失败'),
  });

  const updateMutation = useMutation({
    mutationFn: (body: FormValues) =>
      authzApi.updateTemplate(templateId!, {
        name_zh: body.name_zh,
        description: body.description,
        action_codes: body.action_codes,
      }),
    onSuccess: () => {
      message.success('模板已保存');
      queryClient.invalidateQueries({ queryKey: ['authz', 'role-templates'] });
      if (templateId) {
        queryClient.invalidateQueries({ queryKey: ['authz', 'role-templates', templateId] });
      }
    },
    onError: (err: Error) => message.error(err.message || '保存失败'),
  });

  const grouped = useMemo(() => groupByDomain(actions ?? []), [actions]);

  const selectedSet = useMemo(() => new Set(selectedActions), [selectedActions]);

  const nextHasCritical = useMemo(() => {
    if (!actions) return false;
    for (const code of selectedActions) {
      if (code === '*') return true;
      const a = actions.find((x) => x.code === code);
      if (a && a.risk === 'critical') return true;
    }
    return false;
  }, [actions, selectedActions]);

  const originalHasCritical = template?.has_critical ?? false;
  const criticalTurnedOn = !originalHasCritical && nextHasCritical;

  function toggleAction(code: string, checked: boolean) {
    setSelectedActions((prev) => {
      const set = new Set(prev);
      if (checked) set.add(code);
      else set.delete(code);
      const next = Array.from(set);
      form.setFieldValue('action_codes', next);
      return next;
    });
  }

  function toggleDomain(_domain: string, codes: string[], checkAll: boolean) {
    setSelectedActions((prev) => {
      const set = new Set(prev);
      if (checkAll) codes.forEach((c) => set.add(c));
      else codes.forEach((c) => set.delete(c));
      const next = Array.from(set);
      form.setFieldValue('action_codes', next);
      return next;
    });
  }

  async function handleSubmit() {
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    values.action_codes = selectedActions;
    if (values.action_codes.length === 0) {
      message.warning('请至少选择一个 action');
      return;
    }

    const doSubmit = async () => {
      if (isNew) {
        await createMutation.mutateAsync(values);
        return;
      }

      let affectedUsers = 0;
      if (template && template.is_builtin) {
        const orig = new Set(template.action_codes ?? []);
        const next = new Set(selectedActions);
        const changed =
          orig.size !== next.size ||
          Array.from(orig).some((c) => !next.has(c)) ||
          Array.from(next).some((c) => !orig.has(c));
        if (changed) {
          try {
            affectedUsers = await authzApi.getAffectedUserCount(template.id);
          } catch {
            affectedUsers = 0;
          }
        }
      }

      const confirmModify = () => updateMutation.mutateAsync(values);

      if (criticalTurnedOn) {
        modal.confirm({
          title: '模板将变为含 critical action',
          content:
            '保存后，被授予此模板的用户将拥有高风险操作权限，系统会强制要求过期时间。确认继续？',
          okText: '确认保存',
          okButtonProps: { danger: true },
          onOk: async () => {
            if (affectedUsers > 0) {
              modal.confirm({
                title: `${affectedUsers} 个用户将受影响`,
                content: '这些用户下次刷新 action-set 后将获得新权限。确认继续？',
                okText: '仍然保存',
                okButtonProps: { danger: true },
                onOk: confirmModify,
              });
            } else {
              await confirmModify();
            }
          },
        });
        return;
      }

      if (affectedUsers > 0) {
        modal.confirm({
          title: `${affectedUsers} 个用户将受影响`,
          content: '修改内置模板的 action_codes 后，这些用户的权限会在下次刷新时同步更新。',
          okText: '保存',
          onOk: confirmModify,
        });
        return;
      }

      await confirmModify();
    };

    doSubmit();
  }

  if (!isNew && isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        description={
          isNew
            ? '创建自定义角色模板。保存后可用于三步授权向导。'
            : `编辑模板「${template?.name_zh ?? ''}」${template?.is_builtin ? '（内置，code 不可修改）' : ''}`
        }
      />

      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/platform/authz/role-templates')}>
          返回列表
        </Button>
      </Space>

      <Form<FormValues>
        form={form}
        layout="vertical"
        initialValues={{ action_codes: [] }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
          {/* 左：表单 + action 树 */}
          <div>
            <Card size="small" title="基本信息" style={{ marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Form.Item
                  name="code"
                  label="Code"
                  rules={[
                    { required: true, message: '请输入 code' },
                    { pattern: /^[a-z][a-z0-9_]*$/, message: '小写字母、数字、下划线，以字母开头' },
                  ]}
                >
                  <Input placeholder="例如：narrator_senior" disabled={!isNew} />
                </Form.Item>
                <Form.Item
                  name="name_zh"
                  label="中文名"
                  rules={[{ required: true, message: '请输入中文名' }]}
                >
                  <Input placeholder="例如：高级讲解员" />
                </Form.Item>
              </div>
              <Form.Item name="description" label="描述">
                <Input.TextArea rows={2} placeholder="用于管理员理解此模板的用途" />
              </Form.Item>
              <Form.Item name="action_codes" hidden>
                <Input />
              </Form.Item>
            </Card>

            <Card
              size="small"
              title={`选择 Action（已选 ${selectedActions.length} / ${actions?.length ?? 0}）`}
              loading={actionsLoading && !actions}
              extra={
                actions && (
                  <Space size="small">
                    <Button
                      size="small"
                      onClick={() => {
                        const all = (actions ?? []).map((a) => a.code);
                        setSelectedActions(all);
                        form.setFieldValue('action_codes', all);
                      }}
                    >
                      全选
                    </Button>
                    <Button
                      size="small"
                      onClick={() => {
                        setSelectedActions([]);
                        form.setFieldValue('action_codes', []);
                      }}
                    >
                      全不选
                    </Button>
                  </Space>
                )
              }
            >
              {!actions ? (
                <div style={{ textAlign: 'center', padding: 20 }}>
                  <Spin />
                </div>
              ) : (
                <Collapse
                  ghost
                  size="small"
                  defaultActiveKey={grouped.map((g) => g.domain)}
                  items={grouped.map((g) => {
                    const domainSelectedCount = g.items.filter((a) => selectedSet.has(a.code)).length;
                    const allSelected = domainSelectedCount === g.items.length;
                    const indeterminate = domainSelectedCount > 0 && !allSelected;
                    return {
                      key: g.domain,
                      label: (
                        <Space>
                          <Checkbox
                            checked={allSelected}
                            indeterminate={indeterminate}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              toggleDomain(
                                g.domain,
                                g.items.map((it) => it.code),
                                e.target.checked,
                              )
                            }
                          />
                          <strong>{DOMAIN_LABELS[g.domain] ?? g.domain}</strong>
                          <Text type="secondary">
                            {domainSelectedCount} / {g.items.length}
                          </Text>
                        </Space>
                      ),
                      children: (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                          {g.items.map((a) => {
                            const meta = RISK_META[a.risk] ?? RISK_META.info;
                            const checked = selectedSet.has(a.code);
                            return (
                              <div
                                key={a.code}
                                style={{
                                  padding: '6px 10px',
                                  border: '1px solid var(--ant-color-border-secondary)',
                                  borderRadius: 4,
                                  background: checked ? 'var(--ant-color-primary-bg)' : undefined,
                                }}
                              >
                                <Checkbox
                                  checked={checked}
                                  onChange={(e) => toggleAction(a.code, e.target.checked)}
                                >
                                  <Space size="small">
                                    <span>{a.name_zh}</span>
                                    <Tag color={meta.color} style={{ marginInlineEnd: 0 }}>
                                      {meta.label}
                                    </Tag>
                                    {a.require_reason && (
                                      <Tooltip title="critical 动作：授权/操作时要求备注原因">
                                        <Tag color="red">需备注</Tag>
                                      </Tooltip>
                                    )}
                                  </Space>
                                  <div style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary)' }}>
                                    {a.code} · scope: {a.scope_types.join('/')}
                                  </div>
                                </Checkbox>
                              </div>
                            );
                          })}
                        </div>
                      ),
                    };
                  })}
                />
              )}
            </Card>
          </div>

          {/* 右：实时预览 */}
          <div>
            <Card size="small" title="实时预览" style={{ position: 'sticky', top: 16 }}>
              {template?.is_builtin && (
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message="内置模板"
                  description="code 不可修改；action 变更会影响所有已授予此模板的用户。"
                />
              )}

              <div style={{ marginBottom: 12 }}>
                <Text type="secondary">已选 Action：</Text>
                <div style={{ fontSize: 22, fontWeight: 600 }}>{selectedActions.length}</div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <Text type="secondary">含 critical：</Text>
                <div>
                  {nextHasCritical ? (
                    <Tag color="red" icon={<WarningOutlined />}>
                      是（强制过期）
                    </Tag>
                  ) : (
                    <Tag>否</Tag>
                  )}
                </div>
              </div>

              {criticalTurnedOn && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message="模板将变为含 critical"
                  description="保存后，基于此模板的新授权将强制要求过期时间，且需要操作原因。"
                />
              )}

              <Button
                type="primary"
                icon={<SaveOutlined />}
                block
                loading={createMutation.isPending || updateMutation.isPending}
                onClick={handleSubmit}
              >
                {isNew ? '创建模板' : '保存修改'}
              </Button>
            </Card>
          </div>
        </div>
      </Form>
    </div>
  );
}
