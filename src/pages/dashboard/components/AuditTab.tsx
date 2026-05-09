import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Tooltip } from 'antd';
import styles from '../DashboardPage.module.scss';
import { fmtNum, fmtShortDateTime } from './formatters';
import { useAuditFeed } from '../hooks/useAuditFeed';
import StatusTag from '@/components/common/StatusTag';
import { useActionsMap } from '@/lib/authz/useActionsMap';
import { DOMAIN_LABELS } from '@/lib/authz/actionMeta';
import { formatResourceText } from '@/lib/authz/resourceMeta';
import { formatActionDisplay, formatActorText } from '@/lib/authz/auditFormatters';
import type { AppOpItemDTO, AuthzAuditItemDTO } from '@/api/gen/client';
import type { RecentContentItem } from '@/api/gen/client';

type AuditFilter = 'all' | 'app' | 'authz' | 'content';

interface AuditTabProps {
  active: boolean;
}

/** Tab C · 操作审计（摘要 / 过滤条 / 授权审计 / 2 列表） */
export default function AuditTab({ active }: AuditTabProps) {
  const { summary, authz, appOps, legacy } = useAuditFeed(active, 10);
  const [filter, setFilter] = useState<AuditFilter>('all');
  const actionsMap = useActionsMap();

  return (
    <>
      <div className={styles.row} style={{ marginBottom: 20 }}>
        <SummaryCard
          icon="📝"
          iconCls={styles.icPrimary}
          title="今日总操作"
          value={summary.data?.total_ops}
          sub={summary.data?.failed_ops ? `含失败 ${summary.data.failed_ops} 条` : '—'}
        />
        <SummaryCard
          icon="📁"
          iconCls={styles.icCyan}
          title="内容变更"
          value={summary.data?.content_ops}
          sub="上传 / 发布 / 删除"
        />
        <SummaryCard
          icon="🔑"
          iconCls={styles.icWarning}
          title="授权变更"
          value={summary.data?.authz_changes}
          sub="授权 / 撤销 / 供应商管理"
          pill={
            summary.data?.authz_changes
              ? { cls: 'warn', label: `${summary.data.authz_changes} 条` }
              : undefined
          }
        />
        <SummaryCard
          icon="🖥"
          iconCls={styles.icInfo}
          title="展厅运营"
          value={summary.data?.device_hall_ops}
          sub="展厅 / 设备 / 场景 / App"
        />
      </div>

      <div className={styles.sectionHead}>
        <div className={styles.sectionLabel}>审计日志</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className={styles.periodSwitch}>
            <FilterBtn value="all" current={filter} onClick={setFilter}>全部</FilterBtn>
            <FilterBtn value="app" current={filter} onClick={setFilter}>应用操作</FilterBtn>
            <FilterBtn value="authz" current={filter} onClick={setFilter}>授权操作</FilterBtn>
            <FilterBtn value="content" current={filter} onClick={setFilter}>内容变更</FilterBtn>
          </div>
        </div>
      </div>

      {(filter === 'all' || filter === 'authz') && (
        <AuthzAuditPanel
          items={authz.data?.items ?? []}
          loading={authz.isLoading && !authz.data}
          actionsMap={actionsMap}
        />
      )}

      <div className={styles.twoCol}>
        {(filter === 'all' || filter === 'content') && (
          <RecentContentPanel items={legacy.data?.recent_contents ?? []} loading={legacy.isLoading && !legacy.data} />
        )}
        {(filter === 'all' || filter === 'app') && (
          <RecentAppOpsPanel
            items={appOps.data?.items ?? []}
            loading={appOps.isLoading && !appOps.data}
            actionsMap={actionsMap}
          />
        )}
      </div>
    </>
  );
}

// ============================================================================
// 摘要 4 卡
// ============================================================================

function SummaryCard({
  icon,
  iconCls,
  title,
  value,
  sub,
  pill,
}: {
  icon: string;
  iconCls: string;
  title: string;
  value: number | undefined;
  sub: string;
  pill?: { cls: 'ok' | 'warn' | 'err'; label: string };
}) {
  return (
    <div className={styles.card}>
      <div className={styles.statHead}>
        <div className={styles.statTitle}>
          <span className={`${styles.statIcon} ${iconCls}`}>{icon}</span>
          {title}
        </div>
        {pill && <span className={`${styles.pill} ${styles[pill.cls]}`}>{pill.label}</span>}
      </div>
      <div className={styles.statBody}>
        <div>
          <div>
            <span className={styles.statValue}>{fmtNum(value)}</span>
            <span className={styles.statUnit}>次</span>
          </div>
          <div className={styles.statValueSub}>{sub}</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 过滤按钮
// ============================================================================

function FilterBtn({
  value,
  current,
  onClick,
  children,
}: {
  value: AuditFilter;
  current: AuditFilter;
  onClick: (v: AuditFilter) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`${styles.periodBtn} ${current === value ? styles.active : ''}`}
      onClick={() => onClick(value)}
    >
      {children}
    </button>
  );
}

// ============================================================================
// 授权审计面板
// ============================================================================

function AuthzAuditPanel({
  items,
  loading,
  actionsMap,
}: {
  items: AuthzAuditItemDTO[];
  loading: boolean;
  actionsMap: ReturnType<typeof useActionsMap>;
}) {
  return (
    <div className={`${styles.panel} ${styles.panelAccentWarn}`}>
      <div className={styles.panelTitle}>
        <span>
          <span style={{ marginRight: 6 }}>🔑</span>授权审计
        </span>
        <Link to="/platform/authz/audit" className={styles.sectionLink}>
          查看完整审计 →
        </Link>
      </div>
      {loading ? (
        <div className={styles.empty}>加载中…</div>
      ) : items.length === 0 ? (
        <div className={styles.empty}>暂无授权审计记录</div>
      ) : (
        <table className={styles.auditTable}>
          <thead>
            <tr>
              <th style={{ width: 130 }}>操作人</th>
              <th style={{ width: 160 }}>操作</th>
              <th style={{ width: 150 }}>资源</th>
              <th>详情 · 变更摘要</th>
              <th style={{ width: 72 }}>状态</th>
              <th style={{ width: 110 }}>时间</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const display = formatActionDisplay(it.action_code, actionsMap, DOMAIN_LABELS);
              const tooltipText = display.label !== it.action_code ? it.action_code : '';
              return (
                <tr key={it.id}>
                  <td>
                    {formatActorText({
                      actorName: it.actor_name,
                      actorUserId: it.actor_user_id,
                    })}
                  </td>
                  <td>
                    {tooltipText ? (
                      <Tooltip title={`代码：${tooltipText}`}>
                        <span className={`${styles.tag} ${actionTagCls(it)}`}>{display.label}</span>
                      </Tooltip>
                    ) : (
                      <span className={`${styles.tag} ${actionTagCls(it)}`}>{display.label}</span>
                    )}
                  </td>
                  <td>{formatResourceText(it.resource_type, it.resource_id)}</td>
                  <td>{it.reason || '—'}</td>
                  <td>
                    <span className={`${styles.pill} ${it.status === 'success' ? styles.ok : styles.err}`}>
                      {it.status === 'success' ? '成功' : '失败'}
                    </span>
                  </td>
                  <td className={styles.mono}>{fmtShortDateTime(it.occurred_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function actionTagCls(it: AuthzAuditItemDTO): string {
  if (it.is_revoke) return styles.tagRevoke;
  if (it.action_code.startsWith('user.')) return styles.tagUser;
  if (it.action_code.startsWith('vendor.')) return styles.tagVendor;
  if (it.action_code.startsWith('audit.')) return styles.tagAudit;
  return '';
}

// ============================================================================
// 两栏：最近内容 / 最近应用操作
// ============================================================================

function RecentContentPanel({
  items,
  loading,
}: {
  items: RecentContentItem[];
  loading: boolean;
}) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelTitle}>最近内容更新</div>
      {loading ? (
        <div className={styles.empty}>加载中…</div>
      ) : items.length === 0 ? (
        <div className={styles.empty}>暂无数据</div>
      ) : (
        <table className={styles.auditTable}>
          <thead>
            <tr>
              <th>名称</th>
              <th style={{ width: 120 }}>展厅</th>
              <th style={{ width: 80 }}>状态</th>
              <th style={{ width: 110 }}>更新时间</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.name}
                </td>
                <td>{c.hall_name}</td>
                <td><StatusTag status={c.status} /></td>
                <td className={styles.mono}>{fmtShortDateTime(c.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function RecentAppOpsPanel({
  items,
  loading,
  actionsMap,
}: {
  items: AppOpItemDTO[];
  loading: boolean;
  actionsMap: ReturnType<typeof useActionsMap>;
}) {
  const rows = useMemo(() => items.slice(0, 10), [items]);
  return (
    <div className={styles.panel}>
      <div className={styles.panelTitle}>最近应用操作</div>
      {loading ? (
        <div className={styles.empty}>加载中…</div>
      ) : rows.length === 0 ? (
        <div className={styles.empty}>暂无数据</div>
      ) : (
        <table className={styles.auditTable}>
          <thead>
            <tr>
              <th style={{ width: 100 }}>用户</th>
              <th style={{ width: 140 }}>操作</th>
              <th>描述</th>
              <th style={{ width: 110 }}>时间</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((it) => {
              const display = formatActionDisplay(it.action, actionsMap, DOMAIN_LABELS);
              const tooltipText = display.label !== it.action ? it.action : '';
              return (
                <tr key={it.id}>
                  <td>
                    {formatActorText({
                      actorName: it.user_name,
                      actorUserId: it.user_id,
                    })}
                  </td>
                  <td>
                    {tooltipText ? (
                      <Tooltip title={`代码：${tooltipText}`}>
                        <span className={styles.tag}>{display.label}</span>
                      </Tooltip>
                    ) : (
                      <span className={styles.tag}>{display.label}</span>
                    )}
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--color-on-surface)' }}>{it.detail}</td>
                  <td className={styles.mono}>{fmtShortDateTime(it.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

