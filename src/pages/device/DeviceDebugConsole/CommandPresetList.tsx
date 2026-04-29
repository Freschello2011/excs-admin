/**
 * device-mgmt-v2 P9-C.2 — 指令组（CommandPreset）列表 + 触发 + 实测对比。
 *
 * 触发流程：
 *  1. POST /api/v1/commands/device { device_id, command, params } 走 commandClient.sendDeviceCommand
 *  2. 等 retained MQTT 下一帧（订阅 channel_map 同 topic；这里靠父组件 props.retainedState 自动刷新）
 *  3. 比较 expected_channels 列出的通道在 retained.fields.channels 里是否处于 expected_state
 *  4. 全中 → ✓ 实测通过；任一不中 → ✗ 失败通道列表
 *
 * expected_state 为空 → 跳过实测对比（仅记录调用成功）。
 */
import { Button, Popconfirm, Space, Tag, Tooltip, Typography } from 'antd';
import { CheckOutlined, CloseOutlined, DeleteOutlined, EditOutlined, PlayCircleFilled, PlusOutlined } from '@ant-design/icons';
import type { CommandPreset } from '@/api/commandPreset';
import type { PresetVerifyResult } from './state';
import styles from './DeviceDebugConsole.module.scss';

const { Text } = Typography;

export type { PresetVerifyResult };

interface Props {
  presets: CommandPreset[];
  /** preset.name → 最近一次触发的实测结果（父组件维护） */
  verifyResults: Record<string, PresetVerifyResult | undefined>;
  /** 用于显示 mono 化的命令预览（可选） */
  commandLabelByCode?: Record<string, string>;
  onTrigger: (p: CommandPreset) => void;
  onEdit: (p: CommandPreset) => void;
  onDelete: (p: CommandPreset) => void;
  onAdd: () => void;
  /** 调试用：当前 retained，用于 onTrigger 后 verify。父组件实际做对比。 */
  retainedState?: Record<string, unknown> | null;
  total: number;
}

export default function CommandPresetList({
  presets,
  verifyResults,
  commandLabelByCode,
  onTrigger,
  onEdit,
  onDelete,
  onAdd,
}: Props) {
  return (
    <div>
      {presets.length === 0 ? (
        <Text type="secondary" style={{ fontSize: 12 }}>
          尚未保存任何指令组——拖选通道 → 右键 [加入指令组…] 开始
        </Text>
      ) : (
        presets.map((p) => {
          const v = verifyResults[p.name];
          return (
            <div key={p.name} className={styles.presetItem}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className={styles.presetName}>
                  {p.name}
                  {v?.ok && (
                    <span className={styles.presetVerifyOk}>
                      <CheckOutlined /> 实测通过
                    </span>
                  )}
                  {v && !v.ok && (
                    <Tooltip title={`失败通道：${v.failedChannels.join(', ')}`}>
                      <span className={styles.presetVerifyFail}>
                        <CloseOutlined /> {v.failedChannels.length} 通道未中
                      </span>
                    </Tooltip>
                  )}
                </div>
                <div className={styles.presetMono}>
                  {commandLabelByCode?.[p.command_code] ?? p.command_code}
                  {p.params && Object.keys(p.params).length > 0 && (
                    <span style={{ marginLeft: 6, color: 'var(--ant-color-text-tertiary)' }}>
                      {JSON.stringify(p.params)}
                    </span>
                  )}
                </div>
                {p.description && (
                  <div style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary)', marginTop: 2 }}>
                    {p.description}
                  </div>
                )}
                {p.expected_channels && p.expected_channels.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <Tag color="blue" style={{ fontSize: 10 }}>
                      验证 {p.expected_channels.length} 通道={p.expected_state || '记录'}
                    </Tag>
                  </div>
                )}
              </div>
              <Space size={4}>
                <Button
                  size="small"
                  type="primary"
                  icon={<PlayCircleFilled />}
                  onClick={() => onTrigger(p)}
                >
                  触发
                </Button>
                <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(p)} />
                <Popconfirm
                  title={`删除指令组 ${p.name}？`}
                  onConfirm={() => onDelete(p)}
                >
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            </div>
          );
        })
      )}
      <Button
        type="dashed"
        icon={<PlusOutlined />}
        onClick={onAdd}
        block
        style={{ marginTop: 6 }}
      >
        新增指令组
      </Button>
    </div>
  );
}

