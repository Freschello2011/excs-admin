/**
 * device-mgmt-v2 P9-E.2 — 顶栏直连模式状态指示 chip。
 *
 * 三态展示（ADR-0016 §1）：
 *   ☁️ 云端 200ms       — mode='cloud'
 *   🏠 本地直连           — mode='lan'
 *   ❌ 断开              — mode='disconnected'
 *
 * 点击 → 弹小窗（LanConfigDialog）：手动配 lan address + token / 切换模式 / 看 pending 暂存。
 */
import { useState } from 'react';
import { Tooltip } from 'antd';
import { useDirectConnect } from '@/stores/directConnectStore';
import LanConfigDialog from './LanConfigDialog';
import styles from './ConnectStatusPill.module.scss';

export default function ConnectStatusPill() {
  const mode = useDirectConnect((s) => s.mode);
  const cloudLatencyMs = useDirectConnect((s) => s.cloudLatencyMs);
  const pendingCount = useDirectConnect((s) => s.pendingCount);
  const [dialogOpen, setDialogOpen] = useState(false);

  let icon: string;
  let text: string;
  let dotClass: string;
  let modClass: string;
  let tooltip: string;

  if (mode === 'cloud') {
    icon = '☁️';
    text = cloudLatencyMs != null ? `云端 ${cloudLatencyMs}ms` : '云端';
    dotClass = styles['dot--success'];
    modClass = styles['pill--cloud'];
    tooltip = '当前走云端 API；点击查看 / 切换直连模式';
  } else if (mode === 'lan') {
    icon = '🏠';
    text = '本地直连';
    dotClass = styles['dot--warning'];
    modClass = styles['pill--lan'];
    tooltip = '当前走展厅 App 9900 直连；写云端依赖资源会暂存到本地';
  } else {
    icon = '❌';
    text = '断开';
    dotClass = styles['dot--error'];
    modClass = styles['pill--disconnected'];
    tooltip = '云端 + 局域网都不通；点击配置直连地址';
  }

  return (
    <>
      <Tooltip title={tooltip}>
        <button
          type="button"
          className={`${styles.pill} ${modClass}`}
          onClick={() => setDialogOpen(true)}
        >
          <span className={`${styles.dot} ${dotClass}`} aria-hidden="true" />
          <span className={styles.icon} aria-hidden="true">
            {icon}
          </span>
          <span className={styles.text}>{text}</span>
          {pendingCount > 0 && (
            <span className={styles.badge} title={`${pendingCount} 笔待同步暂存`}>
              {pendingCount}
            </span>
          )}
        </button>
      </Tooltip>
      <LanConfigDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </>
  );
}
