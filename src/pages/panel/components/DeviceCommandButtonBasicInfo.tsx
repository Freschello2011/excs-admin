/**
 * <DeviceCommandButtonBasicInfo> — 按钮基本信息卡（label / icon / tooltip）
 *
 * S5-9（ADR-0020-v2 Stage 5 admin Phase C · admin-UI §4.20.5 + mockup M2 line 568-595）。
 *
 * 与 Scene 不同：无 type / 无 sort_order / 无 hall.current_scene 状态。
 * 配 antd Alert warning 提示部署人员"按钮 ≠ 场景，不更新激活态"。
 */
import { Alert, Card, Form, Input, Select } from 'antd';
import { ControlOutlined } from '@ant-design/icons';
import { SCENE_ICON_OPTIONS } from '@/pages/command/components/_constants';

interface Props {
  label: string;
  icon: string;
  tooltip: string;
  errors?: Record<string, string>;
  disabled?: boolean;
  onChange: (patch: { label?: string; icon?: string; tooltip?: string }) => void;
}

export default function DeviceCommandButtonBasicInfo({
  label,
  icon,
  tooltip,
  errors = {},
  disabled,
  onChange,
}: Props) {
  return (
    <Card
      size="small"
      variant="outlined"
      data-testid="device-command-button-basic-info"
      style={{ borderRadius: 12, marginBottom: 16 }}
      title={
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 14,
          }}
        >
          <ControlOutlined />
          按钮基本信息
        </span>
      }
    >
      <Form layout="vertical" component="div">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1.4fr',
            gap: 12,
          }}
        >
          <Form.Item
            label="按钮文字 (label)"
            required
            validateStatus={errors.label ? 'error' : ''}
            help={errors.label}
            style={{ marginBottom: 0 }}
          >
            <Input
              value={label}
              onChange={(e) => onChange({ label: e.target.value })}
              placeholder="例：速滑馆"
              maxLength={20}
              disabled={disabled}
              data-testid="device-command-button-basic-label"
            />
          </Form.Item>
          <Form.Item
            label="按钮图标 (icon)"
            validateStatus={errors.icon ? 'error' : ''}
            help={errors.icon}
            style={{ marginBottom: 0 }}
          >
            <Select
              value={icon || undefined}
              onChange={(v) => onChange({ icon: v as string })}
              options={SCENE_ICON_OPTIONS}
              placeholder="选择图标"
              allowClear
              disabled={disabled}
              data-testid="device-command-button-basic-icon"
            />
          </Form.Item>
          <Form.Item
            label="说明 (tooltip · 长按显示)"
            validateStatus={errors.tooltip ? 'error' : ''}
            help={errors.tooltip}
            style={{ marginBottom: 0 }}
          >
            <Input
              value={tooltip}
              onChange={(e) => onChange({ tooltip: e.target.value })}
              placeholder="可选，如：K32 灯 + 联动屏幕"
              maxLength={50}
              disabled={disabled}
              data-testid="device-command-button-basic-tooltip"
            />
          </Form.Item>
        </div>
      </Form>

      <Alert
        type="warning"
        showIcon
        style={{ marginTop: 12 }}
        title="按钮短按即触发 runbook，不更新展厅 current_scene（与场景模式不同）。"
        description="客户在中控 App 看不到「激活态」，只看一次性的执行反馈（运行中→成功/部分失败/失败 toast）。"
      />
    </Card>
  );
}
