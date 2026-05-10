/**
 * PRD-inline-command-code-autogen.md §三·D4 / §五·P3.3 — 引用方冲突 modal。
 *
 * 服务端 PUT inline_commands 时，若被删除（O \ N）的 code 仍被现存场景动作 / 演出动作 /
 * 中控面板按钮 / 同设备 command_preset 引用，返回 409 + InlineCommandReferencedDetails。
 * request 拦截器把 data.items 挂到 error.__inlineCommandReferenced，调用方在 onError
 * 里调本函数弹结构化 modal，列举所有引用方 + 给出"清理引用后再删"的明确指引。
 *
 * MVP 不开「强制删除」入口（PRD §三·D4 末段）——避免静默破坏数据。
 */
import type { ModalStaticFunctions } from 'antd/es/modal/confirm';

export interface InlineCommandReference {
  type: 'show_action' | 'scene_action' | 'panel_card' | 'command_preset' | string;
  id: number;
  label: string;
}

export interface InlineCommandReferencedItem {
  command_code: string;
  command_name: string;
  referenced_by: InlineCommandReference[];
}

const TYPE_LABELS: Record<string, string> = {
  show_action: '演出动作',
  scene_action: '场景动作',
  panel_card: '中控面板按钮',
  command_preset: '现场别名',
};

export function isInlineCommandReferencedError(
  err: unknown,
): err is { __inlineCommandReferenced: InlineCommandReferencedItem[] } {
  if (!err || typeof err !== 'object') return false;
  const items = (err as { __inlineCommandReferenced?: unknown }).__inlineCommandReferenced;
  return Array.isArray(items);
}

/**
 * 弹结构化 modal。modal 来自 useMessage()（App.useApp().modal）；不返回 Promise。
 */
export function showInlineCommandReferencedModal(
  modal: Pick<ModalStaticFunctions, 'error'>,
  items: InlineCommandReferencedItem[],
) {
  const total = items.reduce((s, it) => s + (it.referenced_by?.length ?? 0), 0);
  const title = items.length === 1
    ? `命令"${items[0].command_name || items[0].command_code}"被 ${total} 处引用，无法删除`
    : `${items.length} 条命令被 ${total} 处引用，无法删除`;

  modal.error({
    title,
    width: 560,
    okText: '我去清理引用',
    content: (
      <div style={{ marginTop: 12, maxHeight: 400, overflowY: 'auto' }}>
        <div style={{ marginBottom: 12, color: 'rgba(0, 0, 0, 0.65)', fontSize: 13 }}>
          删除会让这些场景 / 演出 / 中控面板的引用变成无效命令；先去引用方那侧改掉再回来删。
        </div>
        {items.map((it) => (
          <div
            key={it.command_code}
            style={{
              marginBottom: 12,
              padding: 10,
              border: '1px solid var(--ant-color-border-secondary)',
              borderRadius: 6,
              background: 'var(--ant-color-fill-quaternary)',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
              {it.command_name || <em>未命名</em>}
              <span
                style={{
                  marginLeft: 8,
                  fontFamily: 'var(--font-family-mono, ui-monospace, monospace)',
                  fontSize: 12,
                  color: 'var(--ant-color-text-tertiary)',
                  fontWeight: 400,
                }}
              >
                ID · {it.command_code}
              </span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              {it.referenced_by.map((r) => (
                <li key={`${r.type}-${r.id}`} style={{ marginBottom: 4 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      minWidth: 88,
                      color: 'var(--ant-color-text-secondary)',
                      fontSize: 12,
                    }}
                  >
                    {TYPE_LABELS[r.type] || r.type}
                  </span>
                  <span>{r.label}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    ),
  });
}
