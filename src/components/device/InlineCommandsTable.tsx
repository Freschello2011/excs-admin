/**
 * device-mgmt-v2 P-C（ADR-0017）— raw_transport inline_commands 行内编辑表格
 *
 * P1 + P2 重构（PRD-inline-command-code-autogen.md D1 / D2）：
 *   - 默认隐藏独立 code 列；code 渲染到 名字 cell 下方小灰副行
 *     - 已持久化行：🔒 ID · xxx
 *     - 未持久化行：系统自动起 · ID · xxx（按名字 slug 实时生成）
 *   - 列：名字 / 类型 / 格式 / 发送内容 / 响应判定 / [最近测试] / 操作 [▶ 测试 / ⋯ 详情 / 删]
 *   - 「⋯ 详情」打开 InlineCommandAdvancedDrawer 看 / 改 ID（已存只读 + 复制；未存可改 + 重算）
 *   - autogen 在 prepareInlineCommandsForSave 中执行（调用方保存前 await）
 *
 * Step 7（ADR-0030 §D3）— 响应判定列：
 *   - mode 下拉 4 选 1：发完就算 / 来啥都行 / 看回应 / 原样回声（界面用业务词，落 DB 仍用 none/any/match/echo）
 *   - mode=match → 同 cell 出现「期望」正则 inline 输入
 *   - 新建命令默认 mode=match（D3 决策聚焦响应设备）
 *   - 老命令缺 expect_response → 显示"未配置（按发完就算处理）"提示鼓励选模式；server 端 applyInlineCommandsDefaults 兜底
 *
 * 复用于：
 *   - 新建 / 编辑设备抽屉 step1 末尾（保存前一并提交到 inline_commands）
 *   - 设备调试台「命令清单」tab（保存全部走 PUT /devices/:id 全量替换）
 *
 * 校验：
 *   - 行内 live：未持久化空 code 不报错（保存时由 prepareInlineCommandsForSave 兜底生成）
 *   - 已存 code 不允许重复 / 覆盖；hex 格式 request 必须合法 hex
 *   - mode=match → match_pattern 必填且为合法正则（server ValidateInlineCommands 同规则双向对齐）
 */
import { useCallback, useMemo, useState } from 'react';
import { Button, Input, Select, Space, Tag, Tooltip, Typography } from 'antd';
import {
  DeleteOutlined,
  EllipsisOutlined,
  PlayCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import type {
  CommandKind,
  DeviceCommand,
  ExpectResponse,
  ExpectResponseMode,
} from '@/types/deviceConnector';
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
  /** ADR-0030 §D5：失败时的结构化错误码（READ_TIMEOUT / EXPECT_NOT_MATCHED / 等）。成功时不填 */
  errorCode?: string;
  at: number;
}

/** error_code → 中文部署员视角短语；缺省直接显示原始 code（兜底防新加 code 不更新映射） */
const ERROR_CODE_LABELS: Record<string, string> = {
  READ_TIMEOUT: '读响应超时',
  READ_EMPTY: '设备未回应',
  READ_FAILED: '读响应异常',
  EXPECT_NOT_MATCHED: '回应不符合期望',
  EXPECT_FAIL_MATCHED: '命中失败模式',
  EXPECT_ECHO_MISMATCH: '回声不匹配',
  REGEX_TIMEOUT: '正则匹配超时',
  MISCONFIGURED: '配置不全',
  ACK_TIMEOUT: '展厅 App 没回',
  NO_HALL_MASTER_ONLINE: '本展厅无展厅 App 在线',
};

/** 渲染服务端 detail 的三段卡片（ADR-0030 §D5：已发送 N 字节 / 已读 M 字节 / 匹配 OK）+ 失败时高亮 error_code */
export function renderTestDetailCard(detail: string | undefined, errorCode: string | undefined, ok: boolean): React.ReactNode {
  if (!detail) {
    return <span style={{ fontSize: 12 }}>无详细信息</span>;
  }
  // server 写好的格式按 " / " 分段，前端只负责按段渲染（不重排版）
  const segments = detail.split(' / ').map((s) => s.trim()).filter(Boolean);
  return (
    <div style={{ fontSize: 12, lineHeight: 1.6, maxWidth: 360 }}>
      {!ok && errorCode && (
        <div style={{ marginBottom: 4 }}>
          <Tag
            color="error"
            style={{
              marginRight: 0,
              fontFamily: 'var(--font-family-mono, ui-monospace, monospace)',
              fontSize: 11,
            }}
          >
            {ERROR_CODE_LABELS[errorCode] ?? errorCode}
          </Tag>
        </div>
      )}
      {segments.map((seg, i) => (
        <div key={i} style={{ display: 'flex', gap: 6 }}>
          <span style={{ color: 'var(--ant-color-text-tertiary)', minWidth: 14 }}>
            {i === 0 ? '①' : i === 1 ? '②' : i === 2 ? '③' : `${i + 1}.`}
          </span>
          <span>{seg}</span>
        </div>
      ))}
    </div>
  );
}

export interface ValidationIssue {
  rowKey: string;
  field: 'code' | 'name' | 'request' | 'expect_response';
  message: string;
}

const HEX_RE = /^[0-9a-f]*$/;

export function isValidHex(input: string): boolean {
  if (!input) return false;
  const cleaned = input.replace(/\s+/g, '').toLowerCase();
  if (cleaned.length === 0 || cleaned.length % 2 !== 0) return false;
  return HEX_RE.test(cleaned);
}

/** 业务词 → mode enum 的反查表（select 选项 + 渲染都用） */
export const EXPECT_RESPONSE_MODE_LABELS: Record<ExpectResponseMode, string> = {
  none: '发完就算',
  any: '来啥都行',
  match: '看回应',
  echo: '原样回声',
};

/** select 的 dropdown 选项（带次行解释，部署员视角） */
export const EXPECT_RESPONSE_MODE_OPTIONS: ReadonlyArray<{
  value: ExpectResponseMode;
  label: string;
  desc: string;
}> = [
  { value: 'none', label: '发完就算', desc: '写完就关，不等设备回话（灯光盒类）' },
  { value: 'any', label: '来啥都行', desc: '读到任何字节都算成功（调试 / 探测协议用）' },
  { value: 'match', label: '看回应', desc: '设备回话里要匹配某段文字才算成功（命令-响应主流）' },
  { value: 'echo', label: '原样回声', desc: '设备必须把发出去的内容原样回来才算成功' },
];

/** 校验单条 expect_response（match_pattern 必填 + 合法正则；与 server ValidateExpectResponse 同规则） */
export function validateExpectResponseCell(er: ExpectResponse | undefined | null): string | null {
  if (!er || !er.mode) {
    // null / 缺 mode 不视为行错误 —— admin 显示提示鼓励选；server applyInlineCommandsDefaults 会兜底 mode=none
    return null;
  }
  if (er.mode === 'match') {
    const p = (er.match_pattern ?? '').trim();
    if (!p) return '响应判定选「看回应」时，必须填一段期望文字（正则）';
    try {
      new RegExp(p);
    } catch (e) {
      return `期望正则不合法：${e instanceof Error ? e.message : String(e)}`;
    }
  }
  if (er.mode === 'echo') {
    if ((er.match_pattern ?? '').trim() || (er.fail_pattern ?? '').trim()) {
      return '响应判定选「原样回声」时不需要再填期望 / 失败文字（语义冲突）';
    }
  }
  return null;
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
    const erErr = validateExpectResponseCell(r.expect_response ?? null);
    if (erErr) {
      issues.push({ rowKey, field: 'expect_response', message: erErr });
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
    // ADR-0030 §D3：新建命令默认 mode=match（部署员选「看回应」需手动改 / chip 切到灯光盒一键改 none）
    const row: InlineCommandRow = {
      code: '',
      name: '',
      kind: 'control' as CommandKind,
      request: '',
      request_format: 'text',
      expect_response: { mode: 'match' },
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
            <th style={{ ...headStyle, width: showLastTest ? '22%' : '25%' }}>名字</th>
            <th style={{ ...headStyle, width: '8%' }}>类型</th>
            <th style={{ ...headStyle, width: '7%' }}>格式</th>
            <th style={{ ...headStyle, width: showLastTest ? '20%' : '22%' }}>发送内容</th>
            <th style={{ ...headStyle, width: showLastTest ? '18%' : '20%' }}>
              <Tooltip title="设备回什么算成功 — 4 选 1：发完就算 / 来啥都行 / 看回应 / 原样回声">
                <span>响应判定</span>
              </Tooltip>
            </th>
            {showLastTest && <th style={{ ...headStyle, width: '10%' }}>最近测试</th>}
            <th
              style={{
                ...headStyle,
                width: onTest ? (showLastTest ? '15%' : '18%') : '18%',
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
                colSpan={showLastTest ? 7 : 6}
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
            const erIssue = rowIssues.find((i) => i.field === 'expect_response');
            const er = row.expect_response ?? null;
            const erMode = er?.mode;
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
                <td style={cellStyle}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <Select
                      size="small"
                      variant="borderless"
                      value={erMode}
                      placeholder="未配置"
                      disabled={readOnly}
                      style={{ width: '100%' }}
                      status={erIssue ? 'error' : undefined}
                      onChange={(v: ExpectResponseMode) => {
                        const next: ExpectResponse = { ...(er ?? {}), mode: v };
                        // 切到 echo → 清空 match/fail（语义冲突，server validation 同规则）
                        if (v === 'echo') {
                          delete next.match_pattern;
                          delete next.fail_pattern;
                        }
                        setRow(idx, { expect_response: next });
                      }}
                      options={EXPECT_RESPONSE_MODE_OPTIONS.map((o) => ({
                        value: o.value,
                        label: (
                          <Tooltip title={o.desc} placement="left" mouseEnterDelay={0.3}>
                            <span>{o.label}</span>
                          </Tooltip>
                        ),
                      }))}
                    />
                    {erMode === 'match' && (
                      <Input
                        size="small"
                        variant="borderless"
                        style={{
                          fontFamily: 'var(--font-family-mono, ui-monospace, monospace)',
                          fontSize: 12,
                        }}
                        value={er?.match_pattern ?? ''}
                        placeholder="期望（正则）如 ^OK"
                        disabled={readOnly}
                        status={erIssue ? 'error' : undefined}
                        onChange={(e) =>
                          setRow(idx, {
                            expect_response: {
                              ...(er ?? { mode: 'match' as const }),
                              match_pattern: e.target.value,
                            },
                          })
                        }
                      />
                    )}
                    {!erMode && (
                      <Tooltip title="老命令缺响应判定 —— 不阻断保存，server 端按「发完就算」兜底；建议显式选模式">
                        <span
                          style={{
                            fontSize: 11,
                            color: 'var(--ant-color-text-tertiary)',
                            padding: '0 6px',
                          }}
                        >
                          未配置（按发完就算处理）
                        </span>
                      </Tooltip>
                    )}
                    {erIssue && (
                      <span
                        style={{
                          fontSize: 11,
                          color: 'var(--ant-color-error)',
                          padding: '0 6px',
                        }}
                      >
                        {erIssue.message}
                      </span>
                    )}
                  </div>
                </td>
                {showLastTest && (
                  <td style={cellStyle}>
                    {result ? (
                      <Tooltip
                        title={renderTestDetailCard(result.detail, result.errorCode, result.ok)}
                        placement="left"
                        overlayInnerStyle={{ maxWidth: 380 }}
                      >
                        <Tag color={result.ok ? 'success' : 'error'} style={{ marginRight: 0, cursor: 'help' }}>
                          {result.ok
                            ? `✓ ${result.latencyMs ?? '?'}ms`
                            : result.errorCode
                              ? `✗ ${ERROR_CODE_LABELS[result.errorCode] ?? result.errorCode}`
                              : '✗ 失败'}
                        </Tag>
                      </Tooltip>
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
