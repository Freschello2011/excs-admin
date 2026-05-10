/**
 * device-mgmt-v2 P-C（ADR-0017）— raw_transport inline_commands 行内编辑表格
 *
 * P1 + P2 重构（PRD-inline-command-code-autogen.md D1 / D2）：
 *   - 默认隐藏独立 code 列；code 渲染到 名字 cell 下方小灰副行
 *     - 已持久化行：🔒 ID · xxx
 *     - 未持久化行：系统自动起 · ID · xxx（按名字 slug 实时生成）
 *   - 列：名字 / 类型 / 格式 / 发送内容 / [最近测试] / 操作 [▶ 测试 / ⋯ 详情 / 删]
 *   - 「⋯ 详情」打开 InlineCommandAdvancedDrawer 看 / 改 ID（已存只读 + 复制；未存可改 + 重算）
 *   - autogen 在 prepareInlineCommandsForSave 中执行（调用方保存前 await）
 *
 * 复用于：
 *   - 新建 / 编辑设备抽屉 step1 末尾（保存前一并提交到 inline_commands）
 *   - 设备调试台「命令清单」tab（保存全部走 PUT /devices/:id 全量替换）
 *
 * 校验：
 *   - 行内 live：未持久化空 code 不报错（保存时由 prepareInlineCommandsForSave 兜底生成）
 *   - 已存 code 不允许重复 / 覆盖；hex 格式 request 必须合法 hex
 */
import { useCallback, useMemo, useState } from 'react';
import { Button, Input, Select, Space, Tag, Tooltip, Typography } from 'antd';
import {
  DeleteOutlined,
  EllipsisOutlined,
  PlayCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import type { CommandKind, DeviceCommand } from '@/types/deviceConnector';
import { generateInlineCommandCode } from './inlineCommandCodeAutogen';
import InlineCommandAdvancedDrawer from './InlineCommandAdvancedDrawer';

const { Text } = Typography;

export type RequestFormat = 'text' | 'hex';

export interface InlineCommandRow extends DeviceCommand {
  /** 表格内行 id —— UI 临时 key（后端不用，保存前剥离） */
  _row?: string;
}

export interface TestResult {
  ok: boolean;
  latencyMs?: number;
  detail?: string;
  at: number;
}

export interface ValidationIssue {
  rowKey: string;
  field: 'code' | 'name' | 'request';
  message: string;
}

const HEX_RE = /^[0-9a-f]*$/;

export function isValidHex(input: string): boolean {
  if (!input) return false;
  const cleaned = input.replace(/\s+/g, '').toLowerCase();
  if (cleaned.length === 0 || cleaned.length % 2 !== 0) return false;
  return HEX_RE.test(cleaned);
}

/**
 * Live 校验（用户编辑期实时跑）：
 *   - autogen 开（默认）：未持久化的空 code 不报错，保存时 prepareInlineCommandsForSave 自动按名字生成
 *   - autogen 关（PRD §P4 feature flag）：空 code 视作行错误，引导用户去「⋯ 详情」抽屉手填
 *   - 非空 code 仍要查重 / 名字 / hex 格式
 */
export function validateInlineCommands(
  rows: InlineCommandRow[],
  opts?: { autogenEnabled?: boolean },
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  const autogen = opts?.autogenEnabled !== false;
  rows.forEach((r, idx) => {
    const rowKey = r._row ?? String(idx);
    const code = (r.code ?? '').trim();
    const name = (r.name ?? '').trim();
    const req = r.request ?? '';
    if (code) {
      if (seen.has(code)) {
        issues.push({ rowKey, field: 'code', message: `ID "${code}" 与本设备另一条命令重复` });
      } else {
        seen.add(code);
      }
    } else if (!autogen) {
      issues.push({ rowKey, field: 'code', message: 'ID 必填（自动生成已关闭，请打开「⋯ 详情」手填 ID）' });
    }
    if (!name) {
      issues.push({ rowKey, field: 'name', message: '命令名字必填' });
    }
    if ((r.request_format ?? 'text') === 'hex' && !isValidHex(req)) {
      issues.push({
        rowKey,
        field: 'request',
        message: 'hex 格式需为偶数个 0-9a-f（容忍空白）',
      });
    }
  });
  return issues;
}

/**
 * 保存前一次性把所有空 code 自动填上、再校验。
 * 调用方在 PUT 之前 await 此函数；返回 issues 非空则提示用户修改。
 *
 * autogen 顺序保证：行内已有的 code（含本批次中先生成的）累计入 used 集合，避免后行撞到前行。
 *
 * autogenEnabled=false（PRD §P4 feature flag 关闭）：跳过 generator，空 code 走 validateInlineCommands
 *   报错；调用方据 issues 提示用户。
 */
export async function prepareInlineCommandsForSave(
  rows: InlineCommandRow[],
  opts?: { autogenEnabled?: boolean },
): Promise<{ rows: InlineCommandRow[]; issues: ValidationIssue[] }> {
  const autogen = opts?.autogenEnabled !== false;
  if (!autogen) {
    return { rows, issues: validateInlineCommands(rows, { autogenEnabled: false }) };
  }
  const used = new Set<string>();
  for (const r of rows) {
    if (r.code) used.add(r.code);
  }
  const filled: InlineCommandRow[] = [];
  for (const row of rows) {
    if (row.code) {
      filled.push(row);
      continue;
    }
    const generated = await generateInlineCommandCode(row.name ?? '', Array.from(used));
    used.add(generated);
    filled.push({ ...row, code: generated });
  }
  return { rows: filled, issues: validateInlineCommands(filled, { autogenEnabled: true }) };
}

export function ensureRowKey(row: InlineCommandRow, idx: number): string {
  if (!row._row) row._row = `r${idx}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return row._row;
}

interface Props {
  value: InlineCommandRow[];
  onChange: (next: InlineCommandRow[]) => void;
  /** 注入测试函数 — 调用方负责 throw / 返回；undefined 时隐藏 [▶ 测试] 列 */
  onTest?: (row: InlineCommandRow) => Promise<TestResult>;
  /** 是否显示"最近测试"列（调试台专用） */
  showLastTest?: boolean;
  /** 调试台模式下 dirty 行高亮 */
  dirtyRowKeys?: Set<string>;
  /** 已持久化的行 key 集合（决定「⋯ 详情」抽屉里 ID 字段是否锁死 + 副行 🔒 vs 系统自动起 标识） */
  persistedRowKeys?: Set<string>;
  /** 强制只读 */
  readOnly?: boolean;
  /** PRD §P4：autogen feature flag。false 时空 code 视作行错误 + 副行文案改"ID 必填" */
  autogenEnabled?: boolean;
}

export default function InlineCommandsTable({
  value,
  onChange,
  onTest,
  showLastTest = false,
  dirtyRowKeys,
  persistedRowKeys,
  readOnly = false,
  autogenEnabled = true,
}: Props) {
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerRowIdx, setDrawerRowIdx] = useState<number | null>(null);

  // 60s 缓存：渲染时把超期 result 视作"未测"
  const liveResults = useMemo(() => {
    const cutoff = Date.now() - 60_000;
    const fresh: Record<string, TestResult> = {};
    for (const [k, r] of Object.entries(results)) {
      if (r.at >= cutoff) fresh[k] = r;
    }
    return fresh;
  }, [results]);

  const issues = useMemo(
    () => validateInlineCommands(value, { autogenEnabled }),
    [value, autogenEnabled],
  );
  const issueByRow = useMemo(() => {
    const map: Record<string, ValidationIssue[]> = {};
    for (const i of issues) {
      (map[i.rowKey] ??= []).push(i);
    }
    return map;
  }, [issues]);

  const setRow = useCallback(
    (idx: number, patch: Partial<InlineCommandRow>) => {
      const next = value.slice();
      next[idx] = { ...next[idx], ...patch };
      onChange(next);
    },
    [value, onChange],
  );

  const removeRow = useCallback(
    (idx: number) => {
      const next = value.slice();
      next.splice(idx, 1);
      onChange(next);
    },
    [value, onChange],
  );

  const addRow = useCallback(() => {
    const idx = value.length;
    const row: InlineCommandRow = {
      code: '',
      name: '',
      kind: 'control' as CommandKind,
      request: '',
      request_format: 'text',
    };
    ensureRowKey(row, idx);
    onChange([...value, row]);
  }, [value, onChange]);

  const handleTest = useCallback(
    async (row: InlineCommandRow, rowKey: string) => {
      if (!onTest) return;
      setTestingKey(rowKey);
      try {
        const result = await onTest(row);
        setResults((prev) => ({ ...prev, [rowKey]: { ...result, at: Date.now() } }));
      } catch (err) {
        setResults((prev) => ({
          ...prev,
          [rowKey]: {
            ok: false,
            detail: err instanceof Error ? err.message : String(err),
            at: Date.now(),
          },
        }));
      } finally {
        setTestingKey(null);
      }
    },
    [onTest],
  );

  const cellStyle: React.CSSProperties = {
    padding: '6px 8px',
    borderBottom: '1px solid var(--ant-color-border-secondary)',
    verticalAlign: 'middle',
  };
  const headStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '8px 8px',
    background: 'var(--ant-color-fill-tertiary)',
    color: 'var(--ant-color-text-secondary)',
    fontWeight: 600,
    fontSize: 12,
    borderBottom: '1px solid var(--ant-color-border-secondary)',
  };

  const drawerRow = drawerRowIdx != null ? value[drawerRowIdx] : null;
  const drawerOtherCodes = useMemo(() => {
    if (drawerRowIdx == null) return [];
    return value
      .filter((_, i) => i !== drawerRowIdx)
      .map((r) => r.code ?? '')
      .filter((c) => c !== '');
  }, [value, drawerRowIdx]);
  const drawerIsPersisted =
    drawerRow?._row != null && persistedRowKeys != null && persistedRowKeys.has(drawerRow._row);

  return (
    <div>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 13,
          border: '1px solid var(--ant-color-border-secondary)',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        <thead>
          <tr>
            <th style={{ ...headStyle, width: '32%' }}>名字</th>
            <th style={{ ...headStyle, width: '10%' }}>类型</th>
            <th style={{ ...headStyle, width: '9%' }}>格式</th>
            <th style={{ ...headStyle, width: showLastTest ? '25%' : '32%' }}>发送内容</th>
            {showLastTest && <th style={{ ...headStyle, width: '10%' }}>最近测试</th>}
            <th
              style={{
                ...headStyle,
                width: onTest ? '14%' : '8%',
                textAlign: 'right',
              }}
            >
              操作
            </th>
          </tr>
        </thead>
        <tbody>
          {value.length === 0 && (
            <tr>
              <td
                colSpan={showLastTest ? 6 : 5}
                style={{
                  ...cellStyle,
                  textAlign: 'center',
                  color: 'var(--ant-color-text-tertiary)',
                  padding: '20px 8px',
                }}
              >
                还没有命令，点击下方"+ 新增命令"开始
              </td>
            </tr>
          )}
          {value.map((row, idx) => {
            const rowKey = ensureRowKey(row, idx);
            const rowIssues = issueByRow[rowKey] ?? [];
            const nameIssue = rowIssues.find((i) => i.field === 'name');
            const reqIssue = rowIssues.find((i) => i.field === 'request');
            const codeDupIssue = rowIssues.find((i) => i.field === 'code');
            const result = liveResults[rowKey];
            const isDirty = dirtyRowKeys?.has(rowKey);
            const isPersisted = persistedRowKeys?.has(rowKey) ?? false;
            const code = (row.code ?? '').trim();
            return (
              <tr
                key={rowKey}
                style={isDirty ? { background: 'var(--ant-color-warning-bg)' } : undefined}
              >
                {/* 名字 cell：双行布局（名字 + ID 副行小灰） */}
                <td style={cellStyle}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Input
                      size="small"
                      variant="borderless"
                      value={row.name ?? ''}
                      placeholder="如：开始演示"
                      disabled={readOnly}
                      status={nameIssue ? 'error' : undefined}
                      onChange={(e) => setRow(idx, { name: e.target.value })}
                    />
                    <span
                      style={{
                        fontFamily: 'var(--font-family-mono, ui-monospace, monospace)',
                        fontSize: 11,
                        color: codeDupIssue
                          ? 'var(--ant-color-error)'
                          : 'var(--ant-color-text-tertiary)',
                        padding: '0 6px',
                        marginLeft: 4,
                        cursor: 'default',
                      }}
                      title={
                        isPersisted
                          ? '保存后 ID 锁住，不能再改'
                          : code
                            ? '还没保存，点「⋯ 详情」可手改 ID'
                            : autogenEnabled
                              ? '保存时按名字自动起 ID'
                              : 'ID 必填（自动生成已关闭）'
                      }
                    >
                      {isPersisted
                        ? '🔒 '
                        : code
                          ? ''
                          : autogenEnabled
                            ? '系统自动起 · '
                            : '⚠ '}
                      {code
                        ? `ID · ${code}`
                        : autogenEnabled
                          ? 'ID 待生成'
                          : 'ID 待手填（点「⋯ 详情」）'}
                    </span>
                  </div>
                </td>
                <td style={cellStyle}>
                  <Select
                    size="small"
                    variant="borderless"
                    value={(row.kind ?? 'control') as CommandKind}
                    disabled={readOnly}
                    style={{ width: '100%' }}
                    onChange={(v) => setRow(idx, { kind: v })}
                    options={[
                      { value: 'control', label: 'control' },
                      { value: 'query', label: 'query' },
                    ]}
                  />
                </td>
                <td style={cellStyle}>
                  <Select
                    size="small"
                    variant="borderless"
                    value={(row.request_format ?? 'text') as RequestFormat}
                    disabled={readOnly}
                    style={{ width: '100%' }}
                    onChange={(v) => setRow(idx, { request_format: v })}
                    options={[
                      { value: 'text', label: 'text' },
                      { value: 'hex', label: 'hex' },
                    ]}
                  />
                </td>
                <td style={cellStyle}>
                  <Input
                    size="small"
                    variant="borderless"
                    style={{ fontFamily: 'var(--font-family-mono, ui-monospace, monospace)' }}
                    value={row.request ?? ''}
                    placeholder={
                      (row.request_format ?? 'text') === 'hex' ? '01 02 ff' : 'start'
                    }
                    disabled={readOnly}
                    status={reqIssue ? 'error' : undefined}
                    onChange={(e) => setRow(idx, { request: e.target.value })}
                  />
                </td>
                {showLastTest && (
                  <td style={cellStyle}>
                    {result ? (
                      result.ok ? (
                        <Tag color="success" style={{ marginRight: 0 }}>
                          ✓ {result.latencyMs ?? '?'}ms
                        </Tag>
                      ) : (
                        <Tooltip title={result.detail}>
                          <Tag color="error" style={{ marginRight: 0 }}>
                            ✗ 失败
                          </Tag>
                        </Tooltip>
                      )
                    ) : (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        未测
                      </Text>
                    )}
                  </td>
                )}
                <td style={{ ...cellStyle, textAlign: 'right' }}>
                  <Space size={4}>
                    {onTest && (
                      <Tooltip
                        title={
                          rowIssues.length > 0
                            ? '行有错误：' + rowIssues.map((i) => i.message).join(' / ')
                            : '云端转发到展厅 App 即时发送'
                        }
                      >
                        <Button
                          size="small"
                          icon={<PlayCircleOutlined />}
                          loading={testingKey === rowKey}
                          disabled={readOnly || rowIssues.length > 0}
                          onClick={() => handleTest(row, rowKey)}
                        >
                          测试
                        </Button>
                      </Tooltip>
                    )}
                    <Tooltip title="详情：查看 / 复制 / 改 ID（未保存时）">
                      <Button
                        size="small"
                        icon={<EllipsisOutlined />}
                        disabled={readOnly}
                        onClick={() => {
                          setDrawerRowIdx(idx);
                          setDrawerOpen(true);
                        }}
                      />
                    </Tooltip>
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      disabled={readOnly}
                      onClick={() => removeRow(idx)}
                    />
                  </Space>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {!readOnly && (
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          block
          style={{ marginTop: 8 }}
          onClick={addRow}
        >
          新增命令
        </Button>
      )}

      <InlineCommandAdvancedDrawer
        open={drawerOpen}
        row={drawerRow}
        otherCodes={drawerOtherCodes}
        isPersisted={drawerIsPersisted}
        onClose={() => setDrawerOpen(false)}
        onApply={(patch) => {
          if (drawerRowIdx == null) return;
          setRow(drawerRowIdx, patch);
        }}
      />
    </div>
  );
}
