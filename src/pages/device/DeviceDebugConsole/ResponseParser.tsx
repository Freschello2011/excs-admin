/**
 * device-mgmt-v2 P9-C.2 — 响应解析 tab。
 *
 * 流程：
 *   1. 从 effective_commands 找 kind=query 且带 response_schema 的命令；admin select 一条
 *   2. 从 retained payload 取 source 串（fields.raw / fields.last_response，缺失时回退到 fields.channels 重组）
 *   3. 跑 ResponseSchema parser → 高亮命中区 + 列出每个 field 的 raw/value
 *   4. 同时给原始字节 hex+ASCII 双栏（不论 schema 是否命中）
 *
 * 真正的运行时解析在 02-server PollingService；本端是诊断展示。
 */
import { useMemo, useState } from 'react';
import { Alert, Empty, Select, Tag, Typography } from 'antd';
import type { components } from '@/api/gen/schema.gen';
import {
  parseWithSchema,
  pickSourceFromRetained,
  type ParseResult,
} from './responseParserUtil';
import styles from './DeviceDebugConsole.module.scss';

const { Text } = Typography;
type EffectiveCommandDTO = components['schemas']['EffectiveCommandDTO'];

interface Props {
  retainedState: Record<string, unknown> | null;
  effectiveCommands: EffectiveCommandDTO[];
}

function hexAsciiTable(s: string): { hex: string; ascii: string } {
  const bytes = Array.from(s).map((c) => c.charCodeAt(0));
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  const ascii = bytes.map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '·')).join('');
  return { hex, ascii };
}

/** 渲染 source，命中区间高亮成黄底。 */
function HighlightSource({ source, hit }: { source: string; hit: { start: number; end: number } | null }) {
  if (!hit || hit.start >= hit.end) {
    return <span>{source}</span>;
  }
  return (
    <span>
      {source.slice(0, hit.start)}
      <mark style={{ background: '#fde68a', color: '#92400e', padding: '0 2px', borderRadius: 2 }}>
        {source.slice(hit.start, hit.end)}
      </mark>
      {source.slice(hit.end)}
    </span>
  );
}

export default function ResponseParser({ retainedState, effectiveCommands }: Props) {
  const queryCommands = useMemo(() => {
    // gen ResponseSchema 不在 EffectiveCommandDTO 上（DTO 只暴露 params_schema）；
    // 但后端在 v2 分支下会塞 response_schema 字段（见 effectiveCommandsV2 service.go）。
    // 我们用宽松类型读，存在 response_schema 才进列表。
    return effectiveCommands.filter((c) => {
      const ext = c as EffectiveCommandDTO & { response_schema?: components['schemas']['ResponseSchema'] };
      return ext.response_schema != null;
    });
  }, [effectiveCommands]);

  const [selectedCode, setSelectedCode] = useState<string | undefined>(undefined);
  // 默认选第一条 query 命令；queryCommands 变化（admin 切设备）后回退到首条。
  const effectiveSelected = selectedCode ?? queryCommands[0]?.code;

  const fields = (retainedState?.fields ?? null) as Record<string, unknown> | null;
  const source = pickSourceFromRetained(retainedState ?? null);
  const channelsView = useMemo(() => {
    const ch = fields?.channels;
    return typeof ch === 'string' ? hexAsciiTable(ch) : null;
  }, [fields]);

  const selected = queryCommands.find((c) => c.code === effectiveSelected);
  const schema =
    selected
      ? (selected as EffectiveCommandDTO & { response_schema?: components['schemas']['ResponseSchema'] }).response_schema
      : undefined;

  const parseResult: ParseResult | null = useMemo(() => {
    if (!schema) return null;
    return parseWithSchema(schema, source);
  }, [schema, source]);

  if (!retainedState || !fields) {
    return (
      <div className={styles.sideCard}>
        <Empty description="尚未收到 retained 响应 — 请先点 [⟳ 刷新状态] 或等待下一次轮询" />
      </div>
    );
  }

  return (
    <div className={styles.sideCard}>
      <div className={styles.sideCardTitle}>
        <span>响应解析</span>
        <small>原始 + 解析后双栏</small>
      </div>

      {/* schema 选择 */}
      {queryCommands.length === 0 ? (
        <Alert
          type="info"
          showIcon
          message="该设备的 effective-commands 中没有声明 response_schema 的 query 命令"
          description="跳过结构化解析，仅展示原始字段"
          style={{ marginBottom: 12 }}
        />
      ) : (
        <div style={{ marginBottom: 10 }}>
          <Text strong style={{ fontSize: 12 }}>
            按 query 命令解析：
          </Text>
          <Select
            size="small"
            style={{ width: 280, marginLeft: 8 }}
            value={effectiveSelected}
            onChange={setSelectedCode}
            options={queryCommands.map((c) => ({
              value: c.code,
              label: `${c.name}（${c.code}）`,
            }))}
          />
        </div>
      )}

      {/* schema 命中视图 */}
      {schema && parseResult && (
        <>
          <div style={{ marginBottom: 8 }}>
            <Tag color={parseResult.ok ? 'success' : 'warning'}>
              pattern_kind={parseResult.patternKind}
            </Tag>
            <Tag>pattern: {parseResult.pattern}</Tag>
            {parseResult.error && <Tag color="error">{parseResult.error}</Tag>}
          </div>
          <Text strong style={{ fontSize: 12 }}>
            source（命中段高亮）
          </Text>
          <div className={styles.hexBlock} style={{ marginTop: 4 }}>
            <HighlightSource source={parseResult.source} hit={parseResult.hit} />
          </div>
          {parseResult.fields.length > 0 && (
            <>
              <Text strong style={{ fontSize: 12, marginTop: 12, display: 'block' }}>
                字段提取
              </Text>
              <div className={styles.hexBlock} style={{ marginTop: 4 }}>
                {parseResult.fields.map((f) => (
                  <div key={f.name} style={{ marginBottom: 4 }}>
                    <strong>{f.name}</strong>
                    <span style={{ color: 'var(--ant-color-text-tertiary)' }}>（{f.from}）</span>: {' '}
                    {f.error ? (
                      <span style={{ color: '#fa8c16' }}>⚠ {f.error}</span>
                    ) : (
                      <>
                        <span style={{ color: 'var(--ant-color-text-secondary)' }}>raw=</span>
                        <code>{f.raw}</code>{' '}
                        <span style={{ color: 'var(--ant-color-text-secondary)' }}>→ value=</span>
                        <code>{typeof f.value === 'object' ? JSON.stringify(f.value) : String(f.value)}</code>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* 原始 hex / ASCII 双栏（K32 channels 字段优先） */}
      {channelsView && (
        <>
          <Text strong style={{ fontSize: 12, marginTop: 12, display: 'block' }}>
            channels（K32 字符串 / 32 位 A/B）
          </Text>
          <div className={styles.hexBlock} style={{ marginTop: 4 }}>
            <div>HEX:&nbsp;&nbsp;{channelsView.hex}</div>
            <div>ASCII: {channelsView.ascii}</div>
          </div>
        </>
      )}

      <Text strong style={{ fontSize: 12, marginTop: 12, display: 'block' }}>
        全部 fields
      </Text>
      <div className={styles.hexBlock} style={{ marginTop: 4 }}>
        {JSON.stringify(fields, null, 2)}
      </div>
    </div>
  );
}
