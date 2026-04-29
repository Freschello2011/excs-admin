/**
 * device-mgmt-v2 P9-C.2 — K32 联级 chip 选择器（1-3 单元）。
 *
 * admin 切换 chip → PATCH /devices/:id { connection_config: { cascade_units: N } }
 * → 后端 max_channel = spec.base_channel × N。
 *
 * 降档（如 96 → 32）时如果现有 channel_map 含超界条目，弹 confirm 警告——admin
 * 须先在矩阵里清掉超界条目再降档（后端 PATCH 会以 400 拒，前端这里先一道把关）。
 */
import { Modal, Tooltip } from 'antd';
import type { ChannelEntry } from '@/api/channelMap';
import styles from './DeviceDebugConsole.module.scss';

interface Props {
  baseChannel: number;
  cascadeUnits: number;
  channelMap: ChannelEntry[];
  onChange: (next: number) => Promise<void> | void;
  /** 切换中（API 调用中）禁用 chip。 */
  loading?: boolean;
}

const OPTIONS = [
  { units: 1, label: '⛀ 单台', cols: 8 },
  { units: 2, label: '⛀⛀ 双联', cols: 16 },
  { units: 3, label: '⛀⛀⛀ 三联', cols: 24 },
];

export default function CascadeSelector({
  baseChannel,
  cascadeUnits,
  channelMap,
  onChange,
  loading,
}: Props) {
  const handleClick = async (next: number) => {
    if (next === cascadeUnits || loading) return;
    if (baseChannel <= 0) {
      // 兜底场景：catalog 没声明 base_channel 时 chip 仅作展示
      return;
    }
    const newMax = baseChannel * next;
    const overflow = channelMap.filter((e) => e.index > newMax);
    if (overflow.length > 0) {
      Modal.confirm({
        title: `降级到 ${newMax} 路会让 ${overflow.length} 条已配置 channel 超界`,
        content: (
          <div>
            <p>以下通道在新 max_channel={newMax} 下不再合法：</p>
            <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
              {overflow.slice(0, 8).map((e) => (
                <li key={e.index}>
                  通道 {e.index}（{e.label}）
                </li>
              ))}
              {overflow.length > 8 && <li>…还有 {overflow.length - 8} 条</li>}
            </ul>
            <p style={{ color: '#fa8c16' }}>
              请先到通道矩阵里删除这些条目（右键 → 打标签 → 留空保存即可清除），
              再切换联级。否则后端 PATCH 会以 400 拒。
            </p>
          </div>
        ),
        okText: '我知道了',
        cancelButtonProps: { style: { display: 'none' } },
      });
      return;
    }
    await onChange(next);
  };

  return (
    <>
      <span className={styles.toolsLabel}>联级配置:</span>
      {OPTIONS.map((o) => {
        const total = baseChannel > 0 ? baseChannel * o.units : '?';
        const active = o.units === cascadeUnits;
        const cls = `${styles.chip} ${active ? styles.active : ''} ${
          loading ? styles.chipDisabled : ''
        }`.trim();
        return (
          <Tooltip
            key={o.units}
            title={
              baseChannel > 0
                ? `${o.units} 单元 × ${baseChannel} = ${total} 路（${o.cols}×4）`
                : '该型号未声明 base_channel'
            }
          >
            <span className={cls} onClick={() => handleClick(o.units)}>
              {o.label} {total} 路
            </span>
          </Tooltip>
        );
      })}
    </>
  );
}
