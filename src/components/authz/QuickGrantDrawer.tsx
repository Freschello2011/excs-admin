/**
 * QuickGrantDrawer —— P1.5（2026-04-25）：快速授权抽屉。
 *
 * 与三步向导（GrantWizardPage）的分工：
 *   - 95% 的日常授权场景：模板已选好、范围 = 全局 / 单展厅、过期走默认
 *     → 用本抽屉，3 字段一次性提交
 *   - 5% 的复杂场景：多模板分别不同 scope / 不同过期 / 需要原因审计 / 排除展项
 *     → 点抽屉底部「切换高级模式」跳 GrantWizardPage
 *
 * 入口（P1.7 接线）：
 *   - UserListPage 行操作 「快速授权」
 *   - UserAuthzPanel 顶部 「+ 授权」 主 CTA
 *
 * 设计说明：
 *   - critical 模板 → 强制 reason（≥5 字）+ critical 二次确认
 *   - vendor 用户 → 过期默认 180 天且不允许永久
 *   - 多模板叠加创建 N 条 Grant（顺序调 createGrant，与向导 createGrantBatch 行为一致）
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Divider,
  Drawer,
  Empty,
  Input,
  Radio,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import { ArrowRightOutlined, KeyOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Dayjs } from 'dayjs';
import { useMessage } from '@/hooks/useMessage';
import { useAuthStore } from '@/stores/authStore';
import { authzApi } from '@/api/authz';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import { makeDefaultExpiry } from '@/lib/authz/expiry';
import { useCan } from '@/lib/authz/can';
import AccountTypeTag from '@/components/authz/common/AccountTypeTag';
import { resolveAccountType, type LoginUser } from '@/api/gen/client';
import type { CreateGrantBody, RoleTemplate, ScopeType } from '@/api/gen/client';

const { Text, Paragraph } = Typography;

type ScopeMode = 'G' | 'H';

export interface QuickGrantTarget {
  /** ExCS user.id */
  id: number;
  name: string;
  email?: string;
  /** 用于决定过期默认值（vendor → 180d）；可传任意带 account_type/user_type 的对象 */
  account_type?: LoginUser['account_type'];
  user_type?: string;
}

interface Props {
  open: boolean;
  target: QuickGrantTarget | null;
  onClose: () => void;
}

export default function QuickGrantDrawer({ open, target, onClose }: Props) {
  const navigate = useNavigate();
  const { message, modal } = useMessage();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const refreshActionSet = useAuthStore((s) => s.refreshActionSet);

  const [templateIds, setTemplateIds] = useState<number[]>([]);
  const [scopeMode, setScopeMode] = useState<ScopeMode>('G');
  const [scopeHallId, setScopeHallId] = useState<number | undefined>(undefined);
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState<Dayjs | null>(null);
  const [expiryTouched, setExpiryTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const accountType = target ? resolveAccountType(target as Partial<LoginUser>) : 'internal';
  const isVendor = accountType === 'vendor';

  /* ------ data ------ */
  // 守门：模板列表归 user.view 域，深度防御 (drawer 通常只在持 user.grant 用户主动打开)
  const canViewUsers = useCan('user.view');
  const { data: templates, isLoading: loadingTemplates } = useQuery({
    queryKey: ['authz', 'role-templates'],
    queryFn: () => authzApi.listTemplates(),
    select: (res) => res.data.data?.list ?? [],
    enabled: open && canViewUsers,
  });

  const { data: halls, isLoading: loadingHalls } = useQuery({
    queryKey: queryKeys.halls({ page: 1, page_size: 100 }),
    queryFn: () => hallApi.getHalls({ page: 1, page_size: 100 }),
    select: (res) => res.data.data?.list ?? [],
    enabled: open,
  });

  const selected = useMemo<RoleTemplate[]>(
    () => (templates ?? []).filter((t) => templateIds.includes(t.id)),
    [templates, templateIds],
  );
  const hasCritical = selected.some((t) => t.has_critical);
  const mergedActions = useMemo(() => {
    const s = new Set<string>();
    selected.forEach((t) => (t.action_codes ?? []).forEach((c) => s.add(c)));
    return Array.from(s);
  }, [selected]);

  /* ------ effects ------ */

  // 抽屉打开时重置状态；按 target 重新初始化默认过期
  useEffect(() => {
    if (open) {
      setTemplateIds([]);
      setScopeMode('G');
      setScopeHallId(undefined);
      setReason('');
      setExpiryTouched(false);
      setExpiresAt(makeDefaultExpiry(false, isVendor ? 'vendor' : 'internal'));
    }
  }, [open, isVendor]);

  // 选模板后按 critical / vendor 重算默认过期（用户没手动改时）
  useEffect(() => {
    if (!open || expiryTouched || templateIds.length === 0) return;
    setExpiresAt(makeDefaultExpiry(hasCritical, isVendor ? 'vendor' : 'internal'));
  }, [open, expiryTouched, templateIds.length, hasCritical, isVendor]);

  /* ------ submit ------ */

  const canSubmit = useMemo(() => {
    if (!target) return false;
    if (templateIds.length === 0) return false;
    if (scopeMode === 'H' && !scopeHallId) return false;
    if ((hasCritical || isVendor) && !expiresAt) return false;
    if (hasCritical && reason.trim().length < 5) return false;
    return true;
  }, [target, templateIds, scopeMode, scopeHallId, hasCritical, isVendor, expiresAt, reason]);

  async function doSubmit() {
    if (!target || !canSubmit) return;

    const scopeType: ScopeType = scopeMode;
    const scopeId = scopeType === 'H' ? String(scopeHallId ?? '') : '';
    const expiresIso = expiresAt ? expiresAt.toISOString() : null;

    const bodies: CreateGrantBody[] = templateIds.map((tid) => ({
      user_id: target.id,
      template_id: tid,
      scope_type: scopeType,
      scope_id: scopeId,
      expires_at: expiresIso,
      reason: reason.trim() || undefined,
    }));

    setSubmitting(true);
    const results = await authzApi.createGrantBatch(bodies);
    setSubmitting(false);

    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;

    if (failCount === 0) {
      message.success(`已创建 ${okCount} 条授权`);
    } else if (okCount === 0) {
      message.error(`授权全部失败：${results[0].error ?? ''}`);
      return; // 不关 drawer
    } else {
      modal.warning({
        title: `${okCount} 条成功 / ${failCount} 条失败`,
        content: (
          <div>
            {results
              .filter((r) => !r.ok)
              .map((r, i) => (
                <div key={i} style={{ color: 'var(--ant-color-error)' }}>
                  模板 #{r.body.template_id}: {r.error}
                </div>
              ))}
          </div>
        ),
      });
    }

    // 失效相关查询
    queryClient.invalidateQueries({ queryKey: ['authz', 'grants'] });
    queryClient.invalidateQueries({ queryKey: ['authz', 'user-view', target.id] });
    if (target.id === currentUser?.id) {
      try { await refreshActionSet(); } catch { /* swallow */ }
    }
    onClose();
  }

  // critical 模板需要二次确认
  const triggerSubmit = useMutation({
    mutationFn: async () => {
      if (!hasCritical) {
        return doSubmit();
      }
      // critical 二次确认
      return new Promise<void>((resolve) => {
        modal.confirm({
          title: '⚠ 含 critical 模板，再次确认',
          content: (
            <div>
              <p>
                以下模板含 critical action，将永久写入审计：
                {selected.filter((t) => t.has_critical).map((t) => (
                  <Tag color="red" key={t.id} style={{ marginInlineStart: 4 }}>
                    {t.name_zh}
                  </Tag>
                ))}
              </p>
              <p>授权原因：{reason.trim()}</p>
            </div>
          ),
          okText: '确认授权',
          okButtonProps: { danger: true },
          cancelText: '取消',
          onOk: async () => {
            await doSubmit();
            resolve();
          },
          onCancel: () => resolve(),
        });
      });
    },
  });

  /* ------ render ------ */

  return (
    <Drawer
      title={
        <Space>
          <KeyOutlined />
          <span>快速授权</span>
          {target && (
            <Text type="secondary" style={{ fontSize: 13, fontWeight: 400 }}>
              · {target.name}
              {target.email && <> · {target.email}</>}
            </Text>
          )}
          {target && <AccountTypeTag accountType={accountType} />}
        </Space>
      }
      open={open}
      onClose={onClose}
      width={520}
      destroyOnHidden
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button
            type="link"
            icon={<ArrowRightOutlined />}
            onClick={() => {
              if (!target) return;
              onClose();
              navigate(`/platform/authz/users/${target.id}/grant`);
            }}
          >
            切换高级模式（多模板逐条 scope / 排除展项）
          </Button>
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button
              type="primary"
              loading={submitting || triggerSubmit.isPending}
              disabled={!canSubmit}
              onClick={() => triggerSubmit.mutate()}
            >
              授权 {templateIds.length > 0 && `(${templateIds.length} 条)`}
            </Button>
          </Space>
        </div>
      }
    >
      {!target ? (
        <Empty description="未指定目标用户" />
      ) : (
        <>
          {/* 模板多选 */}
          <div style={{ marginBottom: 20 }}>
            <strong>选择角色模板（可多选）</strong>
            {loadingTemplates ? (
              <div style={{ textAlign: 'center', padding: 20 }}>
                <Spin />
              </div>
            ) : (
              <Checkbox.Group
                value={templateIds}
                onChange={(v) => setTemplateIds(v as number[])}
                style={{ width: '100%', marginTop: 8 }}
              >
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  {(templates ?? []).map((t) => (
                    <div
                      key={t.id}
                      style={{
                        padding: '8px 10px',
                        border: '1px solid var(--ant-color-border)',
                        borderRadius: 6,
                        background: templateIds.includes(t.id)
                          ? 'var(--ant-color-primary-bg)'
                          : undefined,
                      }}
                    >
                      <Checkbox value={t.id} style={{ marginRight: 6 }}>
                        <Space size={6}>
                          <strong>{t.name_zh}</strong>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {t.code} · {t.action_codes?.length ?? 0} actions
                          </Text>
                          {t.is_builtin && <Tag color="blue">内置</Tag>}
                          {t.has_critical && <Tag color="red">含 critical</Tag>}
                        </Space>
                      </Checkbox>
                    </div>
                  ))}
                </Space>
              </Checkbox.Group>
            )}
            {selected.length > 0 && (
              <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                合并预览：{mergedActions.length} 条 action（去重）
                {hasCritical && (
                  <Tag color="red" style={{ marginLeft: 8 }}>
                    含 critical
                  </Tag>
                )}
              </Paragraph>
            )}
          </div>

          <Divider style={{ margin: '12px 0' }} />

          {/* 范围 */}
          <div style={{ marginBottom: 20 }}>
            <strong>授权范围</strong>
            <div style={{ marginTop: 8 }}>
              <Radio.Group value={scopeMode} onChange={(e) => setScopeMode(e.target.value)}>
                <Radio value="G">全局（所有展厅）</Radio>
                <Radio value="H">单个展厅</Radio>
              </Radio.Group>
              {scopeMode === 'H' && (
                <div style={{ marginTop: 8 }}>
                  <Select
                    style={{ width: '100%' }}
                    placeholder="请选择展厅"
                    loading={loadingHalls}
                    value={scopeHallId}
                    onChange={setScopeHallId}
                    options={(halls ?? []).map((h) => ({ value: h.id, label: h.name }))}
                    showSearch
                    optionFilterProp="label"
                  />
                </div>
              )}
            </div>
          </div>

          {/* 过期 */}
          <div style={{ marginBottom: 20 }}>
            <strong>过期时间</strong>
            {(hasCritical || isVendor) && (
              <Tag color="red" style={{ marginLeft: 8 }}>
                必填
              </Tag>
            )}
            <div style={{ marginTop: 8 }}>
              <DatePicker
                showTime
                style={{ width: 260 }}
                value={expiresAt}
                placeholder={hasCritical || isVendor ? '必填（强制过期）' : '留空 = 永久'}
                onChange={(v) => {
                  setExpiryTouched(true);
                  setExpiresAt(v);
                }}
              />
              <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                {hasCritical
                  ? '默认 90 天后（含 critical）'
                  : isVendor
                    ? '默认 180 天后（vendor 强制过期）'
                    : '默认永久'}
              </Text>
            </div>
          </div>

          {/* 原因 */}
          <div>
            <strong>授权原因</strong>
            {hasCritical && (
              <Tag color="red" style={{ marginLeft: 8 }}>
                必填（≥ 5 字）
              </Tag>
            )}
            <Input.TextArea
              style={{ marginTop: 8 }}
              rows={2}
              placeholder="用于审计：为什么要授予此权限？"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              showCount
            />
          </div>

          {hasCritical && (
            <Alert
              type="warning"
              showIcon
              style={{ marginTop: 12 }}
              message="提交前会再次弹窗确认 critical 操作"
            />
          )}
        </>
      )}
    </Drawer>
  );
}
