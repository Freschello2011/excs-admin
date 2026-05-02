/**
 * device-mgmt-v2 P9-F — 批量贴纸打印页（A4 横向，2 张 A6 双拼 / 页）
 *
 * 路由：/devices/sticker/batch?ids=12,13,29
 *   - 不挂 AdminLayout
 *   - 每张 A4 横向打 2 台设备
 *   - 奇数台时最后一格留空（不画占位卡，打印不留白）
 */
import { useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Alert, Button, Spin } from 'antd';
import { ArrowLeftOutlined, PrinterOutlined } from '@ant-design/icons';
import { deviceDebugApi } from '@/api/deviceDebug';
import { triggerApi } from '@/api/triggers';
import { hallApi } from '@/api/hall';
import { vendorCredentialApi } from '@/api/vendorCredential';
import DeviceStickerCard, { type StickerData } from './DeviceStickerCard';
import styles from './DeviceSticker.module.scss';

function parseIds(raw: string | null): number[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export default function DeviceStickerBatchPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const ids = useMemo(() => parseIds(searchParams.get('ids')), [searchParams]);

  const bundleQueries = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['device-debug-bundle', id],
      queryFn: () => deviceDebugApi.bundle(id),
      select: (res: Awaited<ReturnType<typeof deviceDebugApi.bundle>>) => res.data.data,
    })),
  });

  const allLoaded = bundleQueries.every((q) => !q.isLoading);
  const anyError = bundleQueries.find((q) => q.error)?.error;
  const bundles = bundleQueries.map((q) => q.data).filter((d): d is NonNullable<typeof d> => !!d);

  // 收集所有 hallId / exhibit / triggers / vendor creds
  const hallIds = Array.from(new Set(bundles.map((b) => b.device.hall_id))).filter((h) => h > 0);

  const hallQueries = useQueries({
    queries: hallIds.map((hallId) => ({
      queryKey: ['hall', hallId],
      queryFn: () => hallApi.getHall(hallId),
      select: (res: Awaited<ReturnType<typeof hallApi.getHall>>) => res.data.data,
    })),
  });

  const exhibitQueries = useQueries({
    queries: hallIds.map((hallId) => ({
      queryKey: ['exhibits', hallId],
      queryFn: () => hallApi.getExhibits(hallId),
      select: (res: Awaited<ReturnType<typeof hallApi.getExhibits>>) => res.data.data,
    })),
  });

  const triggerQueries = useQueries({
    queries: bundles.map((b) => ({
      queryKey: ['triggers', { hall_id: b.device.hall_id, device_id: b.device.id }],
      queryFn: () =>
        triggerApi.list({ hall_id: b.device.hall_id, device_id: b.device.id }),
      select: (res: Awaited<ReturnType<typeof triggerApi.list>>) => res.data.data.list,
    })),
  });

  const hasCredRef = bundles.some(
    (b) => !!b.device.connection_config?.['vendor_credential_id'],
  );
  const { data: vendorCreds } = useQuery({
    queryKey: ['vendor-credentials'],
    queryFn: () => vendorCredentialApi.list(),
    select: (res) => res.data.data,
    enabled: hasCredRef,
  });

  const allReady =
    allLoaded &&
    hallQueries.every((q) => !q.isLoading) &&
    exhibitQueries.every((q) => !q.isLoading) &&
    triggerQueries.every((q) => !q.isLoading);

  // 自动打印：当 print=1 + 数据全好
  useEffect(() => {
    if (searchParams.get('print') !== '1') return;
    if (!allReady || bundles.length === 0) return;
    const t = setTimeout(() => window.print(), 500);
    return () => clearTimeout(t);
  }, [allReady, bundles.length, searchParams]);

  if (ids.length === 0) {
    return (
      <div className={styles.shell}>
        <div className={styles.center}>
          <Alert
            type="warning"
            message="未指定设备 ID"
            description="URL 应为 /devices/sticker/batch?ids=12,13,29"
          />
          <Button onClick={() => navigate('/devices')} style={{ marginTop: 16 }} icon={<ArrowLeftOutlined />}>
            返回设备列表
          </Button>
        </div>
      </div>
    );
  }

  if (anyError) {
    return (
      <div className={styles.shell}>
        <div className={styles.center}>
          <Alert type="error" message="部分设备加载失败" description={String(anyError)} />
          <Button onClick={() => navigate(-1)} style={{ marginTop: 16 }} icon={<ArrowLeftOutlined />}>
            返回
          </Button>
        </div>
      </div>
    );
  }

  if (!allReady) {
    return (
      <div className={styles.shell}>
        <div className={styles.center}>
          <Spin size="large" tip={`正在加载 ${bundles.length}/${ids.length} 台设备…`} />
        </div>
      </div>
    );
  }

  const hallNameById = new Map<number, string>();
  hallQueries.forEach((q, i) => {
    const id = hallIds[i];
    if (q.data && id) hallNameById.set(id, q.data.name);
  });
  const exhibitsByHall = new Map<number, { id: number; name: string }[]>();
  exhibitQueries.forEach((q, i) => {
    const id = hallIds[i];
    if (q.data && id) exhibitsByHall.set(id, q.data as { id: number; name: string }[]);
  });

  const stickers: StickerData[] = bundles.map((bundle, i) => {
    const exh = bundle.device.exhibit_id != null
      ? exhibitsByHall.get(bundle.device.hall_id)?.find((e) => e.id === bundle.device.exhibit_id)
      : null;
    const credId = bundle.device.connection_config?.['vendor_credential_id'] as number | undefined;
    const cred = credId ? vendorCreds?.find((c) => c.id === credId) : undefined;
    return {
      device: bundle.device,
      exhibitName: exh?.name ?? null,
      hallName: hallNameById.get(bundle.device.hall_id) ?? null,
      triggers: triggerQueries[i]?.data ?? [],
      vendorCredentialLabel: cred?.label ?? null,
      vendorPhoneMasked: cred?.phone_masked ?? null,
      vendorContactPhone: null,
      vendorContactName: cred?.vendor_key === 'smyoo' ? '闪优科技' : null,
    };
  });

  // 把 stickers 按 2 张分页
  const pages: StickerData[][] = [];
  for (let i = 0; i < stickers.length; i += 2) {
    pages.push(stickers.slice(i, i + 2));
  }

  return (
    <div className={styles.shell}>
      <div className={styles.batchToolbar}>
        <h1 className={styles.toolbarTitle}>
          🖨️ 批量贴纸打印 — {stickers.length} 台 / {pages.length} 页 A4
        </h1>
        <div className={styles.toolbarActions}>
          <Button size="small" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
            返回
          </Button>
          <Button size="small" type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>
            Ctrl+P 打印
          </Button>
        </div>
      </div>

      {pages.map((page, pi) => (
        <div key={pi}>
          <div className={styles.batchPageNo}>第 {pi + 1} / {pages.length} 页</div>
          <div className={styles.a4Sheet}>
            {page.map((d) => (
              <DeviceStickerCard key={d.device.id} data={d} />
            ))}
            {/* 奇数台时占位（仅 screen 视图，不打印） */}
            {page.length === 1 && (
              <div className={styles.empty}>（半页留空，不打印）</div>
            )}
          </div>
        </div>
      ))}

      {/* 打印用 @page 规则 — 批量：A4 横向 */}
      <style>{`@page { size: A4 landscape; margin: 0; }`}</style>
    </div>
  );
}
