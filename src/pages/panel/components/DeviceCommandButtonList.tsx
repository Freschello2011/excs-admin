/**
 * <DeviceCommandButtonList> — device_command 编辑器 v2 中 240px 按钮列表
 *
 * S5-9（ADR-0020-v2 Stage 5 admin Phase C · admin-UI §4.20.5 + mockup M2 line 489-545）。
 *
 * 渲染当前 device_command 卡的按钮列表；激活 + hover 上下移按钮 + dashed 新增按钮。
 * 业务态归 host（DeviceCommandButtonEditorV2），本组件只发回调。
 */
import { Button, Empty, Tooltip, Space, Tag } from 'antd';
import {
  PlusOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import type { ButtonViewModel } from './buttonV2Types';

interface Props {
  buttons: ButtonViewModel[];
  activeIndex: number;
  onActivate: (index: number) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
  disabled?: boolean;
}

export default function DeviceCommandButtonList({
  buttons,
  activeIndex,
  onActivate,
  onMove,
  onRemove,
  onAdd,
  disabled,
}: Props) {
  return (
    <aside
      data-testid="device-command-button-list"
      style={{
        background: 'var(--ant-color-bg-container)',
        border: '1px solid var(--ant-color-border-secondary)',
        borderRadius: 12,
        padding: 12,
        position: 'sticky',
        top: 16,
        maxHeight: 'calc(100vh - 96px)',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 4px 8px',
          borderBottom: '1px solid var(--ant-color-border-secondary)',
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--ant-color-text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          卡片内按钮 ({buttons.length})
        </span>
      </div>

      {buttons.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无按钮"
          style={{ padding: '20px 0' }}
        />
      ) : (
        buttons.map((btn, idx) => {
          const active = idx === activeIndex;
          return (
            <div
              key={idx}
              data-testid={`device-command-button-item-${idx}`}
              data-active={active ? 'true' : 'false'}
              role="button"
              tabIndex={0}
              onClick={() => onActivate(idx)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onActivate(idx);
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                borderRadius: 10,
                cursor: 'pointer',
                border: '1px solid',
                borderColor: active
                  ? 'var(--ant-color-primary)'
                  : 'transparent',
                background: active
                  ? 'var(--ant-color-primary-bg)'
                  : 'transparent',
                marginBottom: 4,
                boxShadow: active
                  ? '0 0 0 3px var(--ant-color-primary-bg-hover)'
                  : undefined,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 32,
                  height: 32,
                  flexShrink: 0,
                  borderRadius: 8,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: active
                    ? 'var(--ant-color-primary-bg-hover)'
                    : 'var(--ant-color-fill-quaternary)',
                  color: active
                    ? 'var(--ant-color-primary)'
                    : 'var(--ant-color-text-tertiary)',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 18 }}
                >
                  {btn.icon || 'smart_button'}
                </span>
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--ant-color-text)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {btn.label || <Tag color="warning">未命名</Tag>}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--ant-color-text-tertiary)',
                    marginTop: 2,
                  }}
                >
                  {btn.actions.length} 步 · 设备
                  {btn.actions.filter((a) => a.type === 'device').length} · 内容
                  {btn.actions.filter((a) => a.type === 'content').length}
                </div>
              </div>

              <Space.Compact size="small" onClick={(e) => e.stopPropagation()}>
                <Tooltip title="上移">
                  <Button
                    size="small"
                    type="text"
                    icon={<ArrowUpOutlined />}
                    disabled={disabled || idx === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMove(idx, -1);
                    }}
                    data-testid={`device-command-button-move-up-${idx}`}
                  />
                </Tooltip>
                <Tooltip title="下移">
                  <Button
                    size="small"
                    type="text"
                    icon={<ArrowDownOutlined />}
                    disabled={disabled || idx === buttons.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMove(idx, 1);
                    }}
                    data-testid={`device-command-button-move-down-${idx}`}
                  />
                </Tooltip>
                <Tooltip title="删除">
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    disabled={disabled}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(idx);
                    }}
                    data-testid={`device-command-button-remove-${idx}`}
                  />
                </Tooltip>
              </Space.Compact>
            </div>
          );
        })
      )}

      <Button
        block
        type="dashed"
        icon={<PlusOutlined />}
        onClick={onAdd}
        disabled={disabled}
        style={{ marginTop: 8 }}
        data-testid="device-command-button-add"
      >
        新增按钮
      </Button>
    </aside>
  );
}
