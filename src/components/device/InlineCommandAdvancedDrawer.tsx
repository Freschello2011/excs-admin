/**
 * raw_transport inline_commands「⋯ 详情」侧抽屉。
 *
 * PRD: 01-docs/02-device-mgmt/PRD-inline-command-code-autogen.md D1 + D3
 *
 * 行为分两态：
 *   - 命令未保存（baseline 中没有此 code）：ID 输入可改、可点「↻ 按名字重算」一键重生；
 *     底部显示「这个 ID 怎么来的」trace（用户名字 → 拼音 → 整理 → 长度 / 查重）
 *   - 命令已保存（baseline 中有此 code）：ID 字段灰掉只读 + 复制按钮 + 蓝信息框解释为什么
 *
 * 不直接发起 PUT；onApply 把 patch 推回 InlineCommandsTab，由它统一全量 PUT。
 */
import { useEffect, useState } from 'react';
import { Drawer, Input, Select, Tag, Button, message } from 'antd';
import { CopyOutlined, ReloadOutlined } from '@ant-design/icons';
import type { CommandKind } from '@/types/deviceConnector';
import {
  generateInlineCommandCode,
  validateManualCode,
  normalizeManualCode,
} from './inlineCommandCodeAutogen';
import type { InlineCommandRow, RequestFormat } from './InlineCommandsTable';

interface Props {
  open: boolean;
  /** 当前编辑的行（含 _row） */
  row: InlineCommandRow | null;
  /** 同设备其他行的 code（去重 / 校验用，不含本行） */
  otherCodes: ReadonlyArray<string>;
  /** 该 row 是否已经被持久化（baseline 中存在此 code）—— 决定 ID 字段是否锁死 */
  isPersisted: boolean;
  onClose: () => void;
  onApply: (patch: Partial<InlineCommandRow>) => void;
}

interface GenTrace {
  source: 'auto' | 'manual';
  pinyin?: string;
  collisionResolved?: boolean;
}

export default function InlineCommandAdvancedDrawer({
  open,
  row,
  otherCodes,
  isPersisted,
  onClose,
  onApply,
}: Props) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<CommandKind>('control');
  const [format, setFormat] = useState<RequestFormat>('text');
  const [request, setRequest] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [trace, setTrace] = useState<GenTrace | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    if (!open || !row) return;
    setName(row.name ?? '');
    setCode(row.code ?? '');
    setKind((row.kind ?? 'control') as CommandKind);
    setFormat((row.request_format ?? 'text') as RequestFormat);
    setRequest(row.request ?? '');
    setCodeError(null);
    setTrace({ source: row.code ? 'manual' : 'auto' });
  }, [open, row]);

  // 实时校验 code（仅未持久化态有意义）
  useEffect(() => {
    if (isPersisted) {
      setCodeError(null);
      return;
    }
    if (!code) {
      // 留空合法——保存时会自动按名字生成
      setCodeError(null);
      return;
    }
    setCodeError(validateManualCode(code, otherCodes));
  }, [code, otherCodes, isPersisted]);

  const handleRegenerate = async () => {
    if (!name.trim()) {
      message.warning('请先填命令名字');
      return;
    }
    setRegenerating(true);
    try {
      const generated = await generateInlineCommandCode(name, otherCodes);
      setCode(generated);
      setTrace({
        source: 'auto',
        // eslint-disable-next-line no-control-regex
        pinyin: /[^\x00-\x7f]/.test(name) ? generated : undefined,
        collisionResolved: otherCodes.some((c) => generated.startsWith(c.split('_')[0] + '_')),
      });
    } finally {
      setRegenerating(false);
    }
  };

  const handleCopyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      message.success('已复制 ID');
    } catch {
      message.error('复制失败，请手动选中');
    }
  };

  const handleApply = async () => {
    let finalCode = code;
    // 未持久化 + 用户清空 → 保存前自动按名字生成
    if (!isPersisted && !finalCode.trim()) {
      finalCode = await generateInlineCommandCode(name, otherCodes);
    }
    if (!isPersisted) {
      const err = validateManualCode(finalCode, otherCodes);
      if (err) {
        setCodeError(err);
        return;
      }
    }
    onApply({
      name: name.trim(),
      code: finalCode,
      kind,
      request_format: format,
      request,
    });
    onClose();
  };

  if (!row) return null;

  return (
    <Drawer
      title={isPersisted ? '命令详情 · 已保存' : '命令详情 · 未保存'}
      open={open}
      onClose={onClose}
      width={420}
      destroyOnClose
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" onClick={handleApply} disabled={!name.trim()}>
            应用
          </Button>
        </div>
      }
    >
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>命令名字</span>
          {isPersisted && (
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ant-color-text-tertiary)' }}>
              可以改，不影响 ID
            </span>
          )}
        </div>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="如：开始演示"
          maxLength={64}
        />
      </div>

      <div style={{ marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>命令 ID</span>
          {isPersisted ? (
            <Tag color="success" style={{ marginLeft: 'auto' }}>
              🔒 已锁定
            </Tag>
          ) : (
            <Tag color="warning" style={{ marginLeft: 'auto' }}>
              还没保存，可以改
            </Tag>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Input
            value={code}
            onChange={(e) => setCode(normalizeManualCode(e.target.value))}
            disabled={isPersisted}
            status={codeError ? 'error' : undefined}
            placeholder="留空保存时按名字自动生成"
            style={{ fontFamily: 'var(--font-family-mono, ui-monospace, monospace)' }}
          />
          {isPersisted ? (
            <Button icon={<CopyOutlined />} onClick={handleCopyCode} title="复制 ID 到剪贴板">
              复制
            </Button>
          ) : (
            <Button
              icon={<ReloadOutlined />}
              onClick={handleRegenerate}
              loading={regenerating}
              disabled={!name.trim()}
              title="按当前名字重新自动生成"
            >
              按名字重算
            </Button>
          )}
        </div>
        {codeError ? (
          <div style={{ fontSize: 11.5, color: 'var(--ant-color-error)', marginTop: 4 }}>
            {codeError}
          </div>
        ) : (
          !isPersisted && (
            <div
              style={{ fontSize: 11.5, color: 'var(--ant-color-text-tertiary)', marginTop: 4 }}
            >
              只能用小写英文字母 / 数字 / 下划线，最多 32 个字符。
              <br />
              留空或点「按名字重算」时，系统会按命令名字自动起一个。
            </div>
          )
        )}
      </div>

      {isPersisted ? (
        <div
          style={{
            background: 'var(--ant-color-info-bg, #e6f4ff)',
            color: 'var(--ant-color-info-text, #003eb3)',
            border: '1px solid var(--ant-color-info-border, #91caff)',
            borderRadius: 6,
            padding: '8px 10px',
            fontSize: 12,
            lineHeight: 1.6,
            margin: '12px 0',
          }}
        >
          <strong>这条命令保存之后 ID 就不能改了</strong>。它可能已经被这些地方用上：
          <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
            <li>演出里的设备动作</li>
            <li>中控面板按钮</li>
            <li>场景动作 / 流程编排步骤</li>
            <li>调试台「现场别名」</li>
          </ul>
          改 ID 等于把这些位置全断开，演出 / 按钮就会找不到这条命令。
          <br />
          想换个 ID 请新增一条命令、再删旧的（删旧的时候系统会先查是否还有人在用）。
        </div>
      ) : (
        trace && (
          <div
            style={{
              background: 'var(--ant-color-fill-quaternary, #f5f5f5)',
              borderLeft: '3px solid var(--ant-color-primary, #6A4EE8)',
              borderRadius: 6,
              padding: '8px 10px',
              fontSize: 11.5,
              lineHeight: 1.7,
              color: 'var(--ant-color-text-secondary)',
              margin: '12px 0',
            }}
          >
            <strong style={{ color: 'var(--ant-color-primary, #6A4EE8)' }}>这个 ID 怎么来的</strong>
            ：
            {trace.source === 'auto' ? (
              <span style={{ marginLeft: 6 }}>
                按命令名字「{name || '...'}」自动生成 → <code>{code || '?'}</code>
              </span>
            ) : (
              <span style={{ marginLeft: 6 }}>由用户手填</span>
            )}
            <br />
            查重：本设备另外 {otherCodes.length} 条命令的 ID 都没撞上 ✓
            <br />
            长度：{code.length} / 32 个字符
          </div>
        )
      )}

      <hr style={{ border: 0, borderTop: '1px solid var(--ant-color-border-secondary)', margin: '16px 0' }} />

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', marginBottom: 4 }}>
          类型
        </div>
        <Select
          value={kind}
          onChange={setKind}
          style={{ width: '100%' }}
          options={[
            { value: 'control', label: 'control（控制 / 写）' },
            { value: 'query', label: 'query（查询 / 读）' },
          ]}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', marginBottom: 4 }}>
          格式
        </div>
        <Select
          value={format}
          onChange={setFormat}
          style={{ width: '100%' }}
          options={[
            { value: 'text', label: 'text（UTF-8 文本，可用 \\r \\n \\xNN 转义）' },
            { value: 'hex', label: 'hex（按字节十六进制，如 01 02 ff）' },
          ]}
        />
      </div>

      <div style={{ marginBottom: 6 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: 'var(--ant-color-text-secondary)',
            marginBottom: 4,
          }}
        >
          发送内容
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ant-color-text-tertiary)' }}>
            可以改
          </span>
        </div>
        <Input
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          placeholder={format === 'hex' ? '01 02 ff' : 'start'}
          style={{ fontFamily: 'var(--font-family-mono, ui-monospace, monospace)' }}
        />
      </div>
    </Drawer>
  );
}
