/**
 * device-mgmt-v2 P-C（ADR-0017）— raw_transport inline_commands 行内编辑表格
 *
 * 复用于：
 *   - 新建 / 编辑设备抽屉 step1 末尾（保存前一并提交到 inline_commands）
 *   - 设备调试台「命令清单」tab（保存全部走 PUT /devices/:id 全量替换）
 *
 * 列：名字 / code / kind / format(text|hex) / 发送内容 / [最近测试] / 操作 [▶ 测试 / 删]
 *
 * 校验：
 *   - 行内：code 唯一 + 必填
 *   - hex 格式时 request 必须合法 hex（容忍空白和大小写）
 *   - 父层在保存前调用 validateInlineCommands(commands) 拿到 issues 列表
 *
 * 测试结果缓存：onTest 由父层注入（异步 throw 算 fail；返回 latency 算 ok）；
 * 本组件按 code 在 60s 内缓存最近一次结果。
 */
import { useCallback, useMemo, useState } from 'react';
import { Button, Input, Select, Space, Tag, Tooltip, Typography } from 'antd';
import { DeleteOutlined, PlayCircleOutlined, PlusOutlined } from '@ant-design/icons';
import type { CommandKind, DeviceCommand } from '@/types/deviceConnector';

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

export function validateInlineCommands(rows: InlineCommandRow[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  rows.forEach((r, idx) => {
    const rowKey = r._row ?? String(idx);
    const code = (r.code ?? '').trim();
    const name = (r.name ?? '').trim();
    const req = r.request ?? '';
    if (!code) {
      issues.push({ rowKey, field: 'code', message: 'code 必填' });
    } else if (seen.has(code)) {
      issues.push({ rowKey, field: 'code', message: `code "${code}" 重复` });
    } else {
      seen.add(code);
    }
    if (!name) {
      issues.push({ rowKey, field: 'name', message: '名字必填' });
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
  /** 强制只读 */
  readOnly?: boolean;
}

export default function InlineCommandsTable({
  value,
  onChange,
  onTest,
  showLastTest = false,
  dirtyRowKeys,
  readOnly = false,
}: Props) {
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [testingKey, setTestingKey] = useState<string | null>(null);

  // 60s 缓存：渲染时把超期 result 视作"未测"
  const liveResults = useMemo(() => {
    const cutoff = Date.now() - 60_000;
    const fresh: Record<string, TestResult> = {};
    for (const [k, r] of Object.entries(results)) {
      if (r.at >= cutoff) fresh[k] = r;
    }
    return fresh;
  }, [results]);

  const issues = useMemo(() => validateInlineCommands(value), [value]);
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
            <th style={{ ...headStyle, width: '20%' }}>名字</th>
            <th style={{ ...headStyle, width: '16%' }}>code</th>
            <th style={{ ...headStyle, width: '10%' }}>类型</th>
            <th style={{ ...headStyle, width: '9%' }}>格式</th>
            <th style={{ ...headStyle, width: showLastTest ? '23%' : '30%' }}>发送内容</th>
            {showLastTest && <th style={{ ...headStyle, width: '10%' }}>最近测试</th>}
            <th
              style={{
                ...headStyle,
                width: onTest ? '12%' : '6%',
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
            const codeIssue = rowIssues.find((i) => i.field === 'code');
            const nameIssue = rowIssues.find((i) => i.field === 'name');
            const reqIssue = rowIssues.find((i) => i.field === 'request');
            const result = liveResults[rowKey];
            const isDirty = dirtyRowKeys?.has(rowKey);
            return (
              <tr
                key={rowKey}
                style={isDirty ? { background: 'var(--ant-color-warning-bg)' } : undefined}
              >
                <td style={cellStyle}>
                  <Input
                    size="small"
                    variant="borderless"
                    value={row.name ?? ''}
                    placeholder="如：开始演示"
                    disabled={readOnly}
                    status={nameIssue ? 'error' : undefined}
                    onChange={(e) => setRow(idx, { name: e.target.value })}
                  />
                </td>
                <td style={cellStyle}>
                  <Input
                    size="small"
                    variant="borderless"
                    value={row.code ?? ''}
                    placeholder="start"
                    disabled={readOnly}
                    status={codeIssue ? 'error' : undefined}
                    onChange={(e) => setRow(idx, { code: e.target.value })}
                  />
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
    </div>
  );
}
