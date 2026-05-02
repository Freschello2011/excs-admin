/**
 * device-mgmt-v2 P9-F — 单设备贴纸打印页（A6）
 *
 * 路由：/devices/:deviceId/sticker?print=1
 *   - 不挂 AdminLayout（独立全屏，便于 Ctrl+P）
 *   - print=1 自动触发打印对话框
 *   - QR 内容：{origin}/devices/:id/debug?from=qr → 扫码经 SSO 跳调试台
 */
import { useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Spin, Alert } from 'antd';
import { ArrowLeftOutlined, PrinterOutlined } from '@ant-design/icons';
import { deviceDebugApi } from '@/api/deviceDebug';
import { triggerApi } from '@/api/triggers';
import { hallApi } from '@/api/hall';
import { vendorCredentialApi } from '@/api/vendorCredential';
import DeviceStickerCard, { type StickerData } from './DeviceStickerCard';
import styles from './DeviceSticker.module.scss';

export default function DeviceStickerPage() {
  const { deviceId: deviceIdStr } = useParams<{ deviceId: string }>();
  const deviceId = Number(deviceIdStr);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const { data: bundle, isLoading, error } = useQuery({
    queryKey: ['device-debug-bundle', deviceId],
    queryFn: () => deviceDebugApi.bundle(deviceId),
    select: (res) => res.data.data,
    enabled: deviceId > 0,
  });

  const hallId = bundle?.device.hall_id ?? 0;

  const { data: hall } = useQuery({
    queryKey: ['hall', hallId],
    queryFn: () => hallApi.getHall(hallId),
    select: (res) => res.data.data,
    enabled: hallId > 0,
  });

  const { data: exhibits } = useQuery({
    queryKey: ['exhibits', hallId],
    queryFn: () => hallApi.getExhibits(hallId),
    select: (res) => res.data.data,
    enabled: hallId > 0,
  });

  const { data: triggerListData } = useQuery({
    queryKey: ['triggers', { hall_id: hallId, device_id: deviceId }],
    queryFn: () => triggerApi.list({ hall_id: hallId, device_id: deviceId }),
    select: (res) => res.data.data.list,
    enabled: hallId > 0 && deviceId > 0,
  });

  const credentialId =
    bundle?.device.connection_config?.['vendor_credential_id'] as number | undefined;

  const { data: vendorCreds } = useQuery({
    queryKey: ['vendor-credentials'],
    queryFn: () => vendorCredentialApi.list(),
    select: (res) => res.data.data,
    enabled: !!credentialId,
  });

  // print=1 → 等数据齐了自动触发打印对话框
  useEffect(() => {
    if (searchParams.get('print') !== '1') return;
    if (!bundle || isLoading) return;
    const t = setTimeout(() => window.print(), 350);
    return () => clearTimeout(t);
  }, [bundle, isLoading, searchParams]);

  if (!deviceId || error) {
    return (
      <div className={styles.shell}>
        <div className={styles.center}>
          <Alert type="error" message="设备不存在或加载失败" description={String(error ?? '')} />
          <Button onClick={() => navigate(-1)} style={{ marginTop: 16 }} icon={<ArrowLeftOutlined />}>
            返回
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading || !bundle) {
    return (
      <div className={styles.shell}>
        <div className={styles.center}>
          <Spin size="large" />
        </div>
      </div>
    );
  }

  const exhibitName =
    bundle.device.exhibit_id != null
      ? exhibits?.find((e) => e.id === bundle.device.exhibit_id)?.name ?? null
      : null;

  const cred = credentialId ? vendorCreds?.find((c) => c.id === credentialId) : undefined;

  const data: StickerData = {
    device: bundle.device,
    exhibitName,
    hallName: hall?.name ?? null,
    triggers: triggerListData ?? [],
    vendorCredentialLabel: cred?.label ?? null,
    vendorPhoneMasked: cred?.phone_masked ?? null,
    vendorContactPhone: null,
    vendorContactName: cred?.vendor_key === 'smyoo' ? '闪优科技' : null,
  };

  return (
    <div className={styles.shell}>
      <div className={styles.toolbar}>
        <h1 className={styles.toolbarTitle}>🖨️ 贴纸打印 — {bundle.device.name}</h1>
        <div className={styles.toolbarActions}>
          <Button
            size="small"
            icon={<ArrowLeftOutlined />}
            onClick={() => {
              if (window.history.length > 1) navigate(-1);
              else navigate('/devices');
            }}
          >
            返回
          </Button>
          <Button
            size="small"
            onClick={() => {
              const url = `${window.location.origin}/devices/${bundle.device.id}/debug?from=qr`;
              navigator.clipboard?.writeText(url);
            }}
          >
            📋 复制扫码 URL
          </Button>
          <Button size="small" type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>
            Ctrl+P 打印
          </Button>
        </div>
      </div>

      <div className={styles.specs}>
        <div>
          <strong>纸张规格</strong>
          A6 不干胶（105 × 148 mm）· 贴在设备外壳显眼处
        </div>
        <div>
          <strong>扫码内容</strong>
          {window.location.origin}/devices/{bundle.device.id}/debug?from=qr · 走 SSO 登录后跳调试台
        </div>
        <div>
          <strong>批量导出</strong>
          回设备列表多选 → [批量打印贴纸] · A4 横向 2 张 A6 双拼
        </div>
      </div>

      <DeviceStickerCard data={data} />

      {/* 打印用 @page 规则 — 单贴纸：A6 portrait */}
      <style>{`@page { size: A6 portrait; margin: 0; }`}</style>
    </div>
  );
}
