/**
 * device-mgmt-v2 P6 — 4 大 connector_kind 卡片选择器（设备新建抽屉 step 1）
 */
import type { ConnectorKind } from '@/types/deviceConnector';
import { CONNECTOR_KIND_LABEL, CONNECTOR_KIND_ICON, CONNECTOR_KIND_DESC } from '@/lib/deviceConnectorLabels';

const KINDS: Array<{
  kind: ConnectorKind;
  scenario: string;
}> = [
  { kind: 'preset', scenario: '场景：投影机（PJLink）/ 秀展 K32 / 激光笔接收器' },
  { kind: 'protocol', scenario: '场景：通用 PJLink 设备 / Modbus PLC / Art-Net 灯具' },
  { kind: 'raw_transport', scenario: '场景：自研 ESP32 / 串口设备 / 自定义协议' },
  { kind: 'plugin', scenario: '场景：闪优开关 / 米家 / 涂鸦智能（P7 接入）' },
];

interface Props {
  value?: ConnectorKind;
  onChange: (k: ConnectorKind) => void;
  disabled?: boolean;
}

export default function ConnectorKindCards({ value, onChange, disabled }: Props) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 12,
      }}
    >
      {KINDS.map(({ kind, scenario }) => {
        const selected = value === kind;
        return (
          <button
            key={kind}
            type="button"
            disabled={disabled}
            onClick={() => onChange(kind)}
            style={{
              padding: 16,
              border: `2px solid ${selected ? 'var(--ant-color-primary)' : 'var(--ant-color-border)'}`,
              borderRadius: 12,
              background: selected ? 'var(--ant-color-primary-bg)' : 'var(--ant-color-bg-container)',
              textAlign: 'left',
              cursor: disabled ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 4 }}>{CONNECTOR_KIND_ICON[kind]}</div>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
              {CONNECTOR_KIND_LABEL[kind]}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', marginBottom: 6 }}>
              {CONNECTOR_KIND_DESC[kind]}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary)' }}>
              {scenario}
            </div>
          </button>
        );
      })}
    </div>
  );
}
