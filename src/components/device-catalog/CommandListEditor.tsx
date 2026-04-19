import { useState } from 'react';
import { Button, Collapse, Input, Space, Tag, Tooltip } from 'antd';
import { useMessage } from '@/hooks/useMessage';
import { DeleteOutlined, DownloadOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import ParamsSchemaEditor, { rowsToSchema, schemaToRows } from './ParamsSchemaEditor';
import { deviceProtocolBaselineApi } from '@/api/deviceProtocolBaseline';
import { queryKeys } from '@/api/queryKeys';
import type { ProtocolCommand, ParamsSchema } from '@/types/deviceProtocolBaseline';
import type { ParamsSchemaObject, ParamsSchemaRow } from '@/types/deviceCatalog';

/** 编辑器内部模型：params_schema 已展开为表格行 */
export interface CommandRow {
  code: string;
  name: string;
  category?: string;
  icon?: string;
  description?: string;
  params_rows: ParamsSchemaRow[];
}

const CATEGORY_PRESETS = ['电源', '输入', '亮度', '颜色', '音量', '播放', '运动', '镜头', '通道', '其他'];

/** ProtocolCommand[]（来自后端）→ CommandRow[]（编辑器用） */
export function commandsToRows(commands: ProtocolCommand[] | undefined | null): CommandRow[] {
  if (!commands) return [];
  return commands.map((c) => ({
    code: c.code,
    name: c.name,
    category: c.category,
    icon: c.icon,
    description: c.description,
    params_rows: schemaToRows(c.params_schema as ParamsSchemaObject | null | undefined),
  }));
}

/** CommandRow[] → ProtocolCommand[]（提交到后端）。空 code/name 行自动忽略 */
export function rowsToCommands(rows: CommandRow[]): ProtocolCommand[] {
  return rows
    .filter((r) => r.code.trim() && r.name.trim())
    .map((r) => {
      const schema = rowsToSchema(r.params_rows);
      const cmd: ProtocolCommand = {
        code: r.code.trim(),
        name: r.name.trim(),
      };
      if (r.category?.trim()) cmd.category = r.category.trim();
      if (r.icon?.trim()) cmd.icon = r.icon.trim();
      if (r.description?.trim()) cmd.description = r.description.trim();
      cmd.params_schema = schema as ParamsSchema | null;
      return cmd;
    });
}

/** 向后兼容 Step 5 API：调用方仍可用 normalizeCommands(rows) */
export function normalizeCommands(rows: CommandRow[]): ProtocolCommand[] {
  return rowsToCommands(rows);
}

interface CommandListEditorProps {
  value: CommandRow[];
  onChange: (rows: CommandRow[]) => void;
  /** 当前型号绑定的协议 — 用于「从协议基线导入」按钮；不填则按钮禁用 */
  protocol?: string;
  /** 只读（非 admin 或详情预览） */
  readOnly?: boolean;
}

export default function CommandListEditor({ value, onChange, protocol, readOnly }: CommandListEditorProps) {
  const { message } = useMessage();
  const [activeKeys, setActiveKeys] = useState<string[]>([]);

  const { refetch: fetchBaseline, isFetching: baselineLoading } = useQuery({
    queryKey: queryKeys.protocolBaselineDetail(protocol ?? ''),
    queryFn: () => deviceProtocolBaselineApi.get(protocol!),
    enabled: false,
  });

  const add = () => {
    const next = [...value, { code: '', name: '', params_rows: [] }];
    onChange(next);
    setActiveKeys([`cmd-${next.length - 1}`]);
  };

  const remove = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  const update = (idx: number, patch: Partial<CommandRow>) => {
    onChange(value.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const handleImport = async () => {
    if (!protocol) {
      message.warning('请先选择协议');
      return;
    }
    const res = await fetchBaseline();
    const baseline = res.data?.data.data;
    if (!baseline) {
      message.error('未能加载协议基线');
      return;
    }
    const toImport = baseline.commands ?? [];
    if (toImport.length === 0) {
      message.info(`协议 ${protocol} 未预置命令`);
      return;
    }
    const existingCodes = new Set(value.map((r) => r.code));
    const newCmds = toImport.filter((c) => !existingCodes.has(c.code));
    if (newCmds.length === 0) {
      message.info('协议基线命令已全部导入');
      return;
    }
    const newRows: CommandRow[] = [
      ...value,
      ...newCmds.map((c) => ({
        code: c.code,
        name: c.name,
        category: c.category,
        icon: c.icon,
        description: c.description,
        params_rows: schemaToRows(c.params_schema as ParamsSchemaObject | null | undefined),
      })),
    ];
    onChange(newRows);
    message.success(`已导入 ${newCmds.length} 条命令`);
  };

  if (readOnly && value.length === 0) {
    return <div style={{ color: 'var(--ant-color-text-tertiary)' }}>暂无命令</div>;
  }

  return (
    <div>
      {!readOnly && (
        <Space style={{ marginBottom: 8 }}>
          <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={add}>
            添加命令
          </Button>
          <Tooltip title={protocol ? `从「${protocol}」基线导入标准命令` : '请先在基本信息中选择协议'}>
            <Button
              size="small"
              icon={<DownloadOutlined />}
              onClick={handleImport}
              disabled={!protocol}
              loading={baselineLoading}
            >
              从协议基线导入
            </Button>
          </Tooltip>
          <span style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 12 }}>
            共 {value.length} 条命令
          </span>
        </Space>
      )}

      {value.length === 0 && !readOnly && (
        <div
          style={{
            border: '1px dashed var(--ant-color-border)',
            borderRadius: 6,
            padding: 16,
            textAlign: 'center',
            color: 'var(--ant-color-text-tertiary)',
            fontSize: 12,
            marginBottom: 8,
          }}
        >
          暂无命令。可手动添加，或从协议基线批量导入。
        </div>
      )}

      <Collapse
        size="small"
        activeKey={activeKeys}
        onChange={(keys) => setActiveKeys(keys as string[])}
        items={value.map((row, idx) => ({
          key: `cmd-${idx}`,
          label: (
            <Space size={6}>
              <strong>{row.name || '(未命名)'}</strong>
              <Tag color="blue">{row.code || '(缺 code)'}</Tag>
              {row.category && <Tag>{row.category}</Tag>}
              {row.params_rows.length > 0 && (
                <Tag color="geekblue">{row.params_rows.length} 参数</Tag>
              )}
            </Space>
          ),
          extra: readOnly ? null : (
            <Button
              size="small"
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                remove(idx);
              }}
            />
          ),
          children: (
            <div>
              <Space wrap size={[8, 8]} style={{ width: '100%', marginBottom: 8 }}>
                <Input
                  size="small"
                  style={{ width: 140 }}
                  placeholder="name（中文名）"
                  value={row.name}
                  onChange={(e) => update(idx, { name: e.target.value })}
                  readOnly={readOnly}
                />
                <Input
                  size="small"
                  style={{ width: 160 }}
                  placeholder="code（唯一标识）"
                  value={row.code}
                  onChange={(e) => update(idx, { code: e.target.value })}
                  readOnly={readOnly}
                />
                <Input
                  size="small"
                  style={{ width: 120 }}
                  placeholder="category（分组）"
                  value={row.category ?? ''}
                  onChange={(e) => update(idx, { category: e.target.value })}
                  list={`categories-${idx}`}
                  readOnly={readOnly}
                />
                <datalist id={`categories-${idx}`}>
                  {CATEGORY_PRESETS.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                <Input
                  size="small"
                  style={{ width: 120 }}
                  placeholder="icon（可选）"
                  value={row.icon ?? ''}
                  onChange={(e) => update(idx, { icon: e.target.value })}
                  readOnly={readOnly}
                />
              </Space>
              <Input.TextArea
                size="small"
                rows={1}
                style={{ marginBottom: 8 }}
                placeholder="描述 / 协议示例（如 PJLink %1POWR 1\\r）"
                value={row.description ?? ''}
                onChange={(e) => update(idx, { description: e.target.value })}
                readOnly={readOnly}
              />
              <div style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary)', marginBottom: 4 }}>
                参数 schema
              </div>
              <ParamsSchemaEditor
                value={row.params_rows}
                onChange={(next) => update(idx, { params_rows: next })}
                disabled={readOnly}
              />
            </div>
          ),
        }))}
      />
    </div>
  );
}
