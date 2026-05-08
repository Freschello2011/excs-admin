import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Checkbox,
  Collapse,
  Drawer,
  FloatButton,
  Form,
  Input,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  Alert,
} from 'antd';
import {
  SaveOutlined,
  WarningOutlined,
  ArrowLeftOutlined,
  EyeOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import { useMessage } from '@/hooks/useMessage';
import { authzApi } from '@/api/authz';
import { useAuthzMetaStore } from '@/stores/authzMetaStore';
import { DOMAIN_LABELS, RISK_META } from '@/lib/authz/actionMeta';
import type { ActionDef, RiskLevel } from '@/api/gen/client';

const { Text } = Typography;

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

/** 短标题 + ⓘ Tooltip —— FieldRow 范式（与 sys-config / UserProfileCard 对齐） */
function LabelHint({ label, hint }: { label: string; hint: string }) {
  return (
    <Space size={4}>
      <span>{label}</span>
      <Tooltip title={hint}>
        <InfoCircleOutlined style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 12 }} />
      </Tooltip>
    </Space>
  );
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
  const [previewOpen, setPreviewOpen] = useState(false);

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

  // 后端 user.grant 是 critical action，create / update 必带 reason ≥5 字
  // （middleware 走 body.reason / X-Action-Reason 任一兜底）。
  const createMutation = useMutation({
    mutationFn: (args: { body: FormValues; reason: string }) =>
      authzApi.createTemplate(
        {
          code: args.body.code,
          name_zh: args.body.name_zh,
          description: args.body.description,
          action_codes: args.body.action_codes,
        },
        args.reason,
      ),
    onSuccess: () => {
      message.success('模板已创建');
      queryClient.invalidateQueries({ queryKey: ['authz', 'role-templates'] });
      navigate('/platform/authz/role-templates');
    },
    onError: (err: Error) => message.error(err.message || '创建失败'),
  });

  const updateMutation = useMutation({
    mutationFn: (args: { body: FormValues; reason: string }) =>
      authzApi.updateTemplate(
        templateId!,
        {
          name_zh: args.body.name_zh,
          description: args.body.description,
          action_codes: args.body.action_codes,
        },
        args.reason,
      ),
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

    // 内置模板 actions 改动会影响在线用户：先算受影响数（仅 update 路径需要）。
    let affectedUsers = 0;
    if (!isNew && template && template.is_builtin) {
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

    // 后端 user.grant 是 critical：必收 reason ≥5 字。把风险摘要 + reason 输入合进同一 modal。
    const REASON_MIN = 5;
    let reasonVal = '';
    const title = isNew
      ? '创建模板（高风险，需填写原因）'
      : criticalTurnedOn
        ? '模板将变为含 critical action'
        : affectedUsers > 0
          ? `${affectedUsers} 个用户将受影响`
          : '保存模板（高风险，需填写原因）';

    modal.confirm({
      title,
      width: 520,
      content: (
        <div>
          {criticalTurnedOn && (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 12 }}
              message="保存后将含 critical action"
              description="被授予此模板的用户将获得高风险权限，授权将强制带过期时间。"
            />
          )}
          {affectedUsers > 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message={`${affectedUsers} 个用户当前持有此模板`}
              description="这些用户下次刷新 action-set 后将获得新权限。"
            />
          )}
          <div style={{ marginBottom: 8, color: 'var(--ant-color-text-secondary)' }}>
            请填写操作原因（审计必填，≥ {REASON_MIN} 字）：
          </div>
          <Input.TextArea
            rows={3}
            autoFocus
            placeholder="例如：新增『发布经理测试角色』用于 release 灰度测试"
            maxLength={500}
            showCount
            onChange={(e) => {
              reasonVal = e.target.value;
            }}
          />
        </div>
      ),
      okText: isNew ? '创建' : criticalTurnedOn ? '确认保存' : '保存',
      cancelText: '取消',
      okButtonProps: criticalTurnedOn ? { danger: true } : undefined,
      onOk: () => {
        const r = reasonVal.trim();
        if (r.length < REASON_MIN) {
          message.warning(`请输入至少 ${REASON_MIN} 字的操作原因（审计用）`);
          return Promise.reject(new Error('reason too short'));
        }
        return isNew
          ? createMutation.mutateAsync({ body: values, reason: r })
          : updateMutation.mutateAsync({ body: values, reason: r });
      },
    });
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
        {/* P2.4 改单列布局：基本信息 → Action 树；预览搬到右下角浮动 FAB Drawer */}
        <div style={{ maxWidth: 960 }}>
          <Card size="small" title="基本信息" style={{ marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Form.Item
                name="code"
                label={<LabelHint label="Code" hint="模板唯一标识；小写字母 + 数字 + 下划线，以字母开头；新建后不可修改" />}
                rules={[
                  { required: true, message: '请输入 code' },
                  { pattern: /^[a-z][a-z0-9_]*$/, message: '小写字母、数字、下划线，以字母开头' },
                ]}
              >
                <Input placeholder="例如：narrator_senior" disabled={!isNew} />
              </Form.Item>
              <Form.Item
                name="name_zh"
                label={<LabelHint label="中文名" hint="管理员可见的模板显示名；可中英文混合，最长 64 字" />}
                rules={[{ required: true, message: '请输入中文名' }]}
              >
                <Input placeholder="例如：高级讲解员" />
              </Form.Item>
            </div>
            <Form.Item
              name="description"
              label={<LabelHint label="描述" hint="供管理员判断该模板用途；可为空，建议写一两句话" />}
            >
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
                            const meta = RISK_META[a.risk as RiskLevel] ?? RISK_META.info;
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

          {/* 卡片底部分隔线 + 右对齐保存按钮（P2.4 单列布局；预览走 FAB） */}
          <div
            style={{
              marginTop: 16,
              paddingTop: 16,
              borderTop: '1px solid var(--ant-color-border-secondary)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <Space wrap>
              {nextHasCritical && (
                <Tag color="red" icon={<WarningOutlined />}>
                  含 critical · 强制过期
                </Tag>
              )}
              <Text type="secondary" style={{ fontSize: 13 }}>
                已选 {selectedActions.length} / {actions?.length ?? 0} action
              </Text>
            </Space>
            <Space>
              <Button onClick={() => navigate('/platform/authz/role-templates')}>取消</Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={createMutation.isPending || updateMutation.isPending}
                onClick={handleSubmit}
              >
                {isNew ? '创建模板' : '保存修改'}
              </Button>
            </Space>
          </div>
        </div>
      </Form>

      {/* P2.4：右下角浮动 FAB → 实时预览 Drawer */}
      <FloatButton
        icon={<EyeOutlined />}
        type="primary"
        tooltip="实时预览"
        badge={{ count: selectedActions.length, color: nextHasCritical ? 'red' : 'blue' }}
        onClick={() => setPreviewOpen(true)}
        style={{ insetInlineEnd: 24, insetBlockEnd: 24 }}
      />
      <Drawer
        title="实时预览"
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        width={360}
      >
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
              <Tag color="red" icon={<WarningOutlined />}>是（强制过期）</Tag>
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
        <div style={{ marginTop: 16 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>已选 action 列表：</Text>
          <div
            style={{
              marginTop: 6,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 4,
              maxHeight: 360,
              overflowY: 'auto',
            }}
          >
            {selectedActions.length === 0 ? (
              <Text type="secondary">未选择任何 action</Text>
            ) : (
              selectedActions
                .slice()
                .sort()
                .map((c) => (
                  <Tag key={c} style={{ marginInlineEnd: 0 }}>
                    {c}
                  </Tag>
                ))
            )}
          </div>
        </div>
      </Drawer>
    </div>
  );
}
