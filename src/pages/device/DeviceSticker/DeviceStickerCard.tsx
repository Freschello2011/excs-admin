/**
 * device-mgmt-v2 P9-F — 单张 A6 贴纸视觉组件。
 *
 * 与路由解耦——单页 / 批量 双拼都复用此组件。
 * 数据形状跟 DeviceDebugBundle.device 一致，加 exhibit_name / hall_name / triggers。
 */
import { QRCodeSVG } from 'qrcode.react';
import type { DeviceDebugDeviceView } from '@/api/deviceDebug';
import type { Trigger } from '@/types/deviceConnector';
import { CONNECTOR_KIND_LABEL, CONNECTOR_KIND_ICON, TRANSPORT_LABEL } from '@/lib/deviceConnectorLabels';
import type { ConnectorKind, TransportKind } from '@/types/deviceConnector';
import styles from './DeviceSticker.module.scss';

export interface StickerData {
  device: DeviceDebugDeviceView;
  exhibitName?: string | null;
  hallName?: string | null;
  triggers: Trigger[];
  vendorCredentialLabel?: string | null;
  vendorPhoneMasked?: string | null;
  /** 厂家联系电话（来自备注 / 凭据） */
  vendorContactPhone?: string | null;
  vendorContactName?: string | null;
}

/** 从 connection_config 拆出 "设备 ID（mcuid 或 COM 口或 IP:Port）" */
function pickDeviceIdent(
  kind: ConnectorKind | '',
  config: Record<string, unknown>,
): string {
  // 闪优等 preset：deviceid / mcuid 是身份字段
  const mcuid = (config['deviceid'] ?? config['mcuid']) as string | undefined;
  if (mcuid) {
    if (mcuid.length > 14) return `${mcuid.slice(0, 6)}…${mcuid.slice(-5)}`;
    return mcuid;
  }
  // 串口
  const serialPath = (config['serial_path'] ?? config['port'] ?? config['com_port']) as
    | string
    | undefined;
  if (serialPath && (kind === 'raw_transport' || serialPath.toUpperCase().startsWith('COM') || serialPath.startsWith('/dev/'))) {
    const baud = config['baud_rate'] ?? config['baudrate'];
    return baud ? `${serialPath} @ ${baud}` : serialPath;
  }
  // TCP/UDP/HTTP
  const host = (config['host'] ?? config['ip']) as string | undefined;
  const port = (config['port'] ?? config['tcp_port']) as number | string | undefined;
  if (host) return port ? `${host}:${port}` : host;
  return '-';
}

function pickTransportLabel(
  kind: ConnectorKind | '',
  ref: { preset_key?: string; protocol?: string; transport?: string; plugin_id?: string; plugin_device_key?: string },
): string {
  if (!kind) return 'v1（旧版）';
  const icon = CONNECTOR_KIND_ICON[kind as ConnectorKind] ?? '';
  const label = CONNECTOR_KIND_LABEL[kind as ConnectorKind] ?? kind;
  let detail = '';
  if (kind === 'preset' && ref.preset_key) detail = ref.preset_key;
  else if (kind === 'protocol' && ref.protocol) detail = ref.protocol;
  else if (kind === 'raw_transport' && ref.transport) {
    detail = TRANSPORT_LABEL[ref.transport as TransportKind] ?? ref.transport;
  } else if (kind === 'plugin') {
    detail = `${ref.plugin_id ?? '?'}/${ref.plugin_device_key ?? '?'}`;
  }
  return detail ? `${icon} ${label} · ${detail}` : `${icon} ${label}`;
}

export default function DeviceStickerCard({ data }: { data: StickerData }) {
  const { device, exhibitName, hallName, triggers, vendorCredentialLabel, vendorPhoneMasked, vendorContactPhone, vendorContactName } = data;
  const config = device.connection_config ?? {};
  const ref = device.connector_ref ?? {};

  const qrUrl = `${window.location.origin}/devices/${device.id}/debug?from=qr`;
  const today = new Date().toISOString().slice(0, 10);

  const triggerLabel =
    triggers.length === 0
      ? '—'
      : triggers
          .slice(0, 3)
          .map((t) => t.name)
          .join(' · ') + (triggers.length > 3 ? ` 等 ${triggers.length} 个` : '');

  const groupingLabel = device.exhibit_id == null ? '展厅基础设施' : '展项';
  const exhibitText = exhibitName ?? (device.exhibit_id != null ? `展项 #${device.exhibit_id}` : null);

  return (
    <div className={styles.a6Paper}>
      {/* 顶部 */}
      <div className={styles.stickerTop}>
        <div className={styles.stickerLogo}>
          <div className={styles.stickerLogoIcon}>E</div>
          ExCS
          <span className={styles.stickerLogoSub}>展控系统</span>
        </div>
        <div className={styles.stickerIdTag}>
          #device-{device.id} · {today}
        </div>
      </div>

      {/* 主体 */}
      <div className={styles.stickerMain}>
        <div className={styles.qrBox}>
          <QRCodeSVG value={qrUrl} size={120} level="M" includeMargin={false} />
        </div>
        <div>
          <div className={styles.deviceName}>{device.name}</div>
          <div className={styles.deviceMeta}>
            <strong>📍 {groupingLabel}</strong>
            {exhibitText && <> · {exhibitText}</>}
            <br />
            {hallName ?? `展厅 #${device.hall_id}`}
          </div>
        </div>
      </div>

      {/* 关键参数 */}
      <div className={styles.params}>
        <div className={styles.paramsRow}>
          <span>接入方式</span>
          <strong>{pickTransportLabel(device.connector_kind, ref)}</strong>
        </div>
        <div className={styles.paramsRow}>
          <span>设备 ID</span>
          <strong>{pickDeviceIdent(device.connector_kind, config)}</strong>
        </div>
        {(vendorCredentialLabel || vendorPhoneMasked) && (
          <div className={styles.paramsRow}>
            <span>厂家账号</span>
            <strong>{vendorPhoneMasked ?? vendorCredentialLabel}</strong>
          </div>
        )}
        <div className={styles.paramsRow}>
          <span>已绑触发器</span>
          <strong>{triggerLabel}</strong>
        </div>
      </div>

      {/* 底部 */}
      <div className={styles.stickerBottom}>
        <div className={styles.vendor}>
          {vendorContactName && (
            <>
              <strong>厂家：</strong>{vendorContactName}
              <br />
            </>
          )}
          {vendorContactPhone ? `客服 ${vendorContactPhone}` : '客服 —'}
        </div>
        <div className={styles.bottomRight}>
          <span className={styles.scanHint}>扫码 → 调试台</span>
          <strong>羿无界 · 实施部</strong>
        </div>
      </div>
    </div>
  );
}
