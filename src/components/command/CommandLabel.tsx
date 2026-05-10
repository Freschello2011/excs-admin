/**
 * <CommandLabel command={...}/> — 选命令的下拉 / 列表里"主名字 + 副小灰 ID"统一渲染。
 *
 * PRD: 01-docs/02-device-mgmt/PRD-inline-command-code-autogen.md D5
 *
 * 渲染规则：
 *   - 主行：command.name（中文 / 用户起的名字，吸睛）
 *   - 副行：command.code（小灰 11px 等宽字体，给运维 grep 用）
 *   - source=command_preset 时副行额外提示 "现场别名「xxx」→ 拖到时间轴会变成 <resolved_code>"
 *     （ADR-0024：preset 卡落卡时会展开为真 code，让用户提前知道）
 *
 * 覆盖位置：
 *   - 演出时间轴 ActionLibrary 的 device 命令卡（已用 label/sub 分行，本组件可选用作统一）
 *   - ActionStepListEditor 的命令选择 antd Select option
 *   - CommandPresetEditor 的「指向真命令」下拉 option
 *   - 未来中控面板编辑器 command_code 选择器
 */
import type { EffectiveCommand } from '@/api/gen/client';

interface Props {
  command: Pick<EffectiveCommand, 'name' | 'code' | 'source' | 'resolved_code'>;
  /** layout='inline' 时主名字 + 副 code 同一行（select option 默认）；'block' 时分两行（draggable card） */
  layout?: 'inline' | 'block';
}

export default function CommandLabel({ command, layout = 'inline' }: Props) {
  const isPreset =
    command.source === 'command_preset' &&
    typeof command.resolved_code === 'string' &&
    command.resolved_code !== '';

  const subText = isPreset ? (
    <>
      现场别名「{command.code.replace(/^preset:/, '')}」→ 拖到时间轴会变成{' '}
      <strong style={{ color: 'var(--ant-color-primary, #6A4EE8)' }}>
        {command.resolved_code}
      </strong>
    </>
  ) : (
    command.code
  );

  if (layout === 'block') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.35, minWidth: 0 }}>
        <span
          style={{
            fontSize: 13,
            color: 'var(--ant-color-text, #1f1f1f)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {command.name}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
            fontSize: 11,
            color: 'var(--ant-color-text-tertiary, #8c8c8c)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {subText}
        </span>
      </div>
    );
  }

  // inline：单行布局，主名字主色 + 间距 + 副 code 小灰
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {command.name}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
          fontSize: 11,
          color: 'var(--ant-color-text-tertiary, #8c8c8c)',
          flex: '0 1 auto',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {subText}
      </span>
    </span>
  );
}

