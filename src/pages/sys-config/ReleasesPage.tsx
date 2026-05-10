import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card, Table, Button, Space, Tag, Tabs, Modal, Form, Input,
  Select, Typography,
} from 'antd';
import { useMessage } from '@/hooks/useMessage';
import { UploadOutlined, DeleteOutlined, SendOutlined, DownloadOutlined, CopyOutlined } from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import RiskyActionButton from '@/components/authz/RiskyActionButton';
import { releaseApi } from '@/api/release';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import { useHallStore } from '@/stores/hallStore';
import type { AppRelease } from '@/api/gen/client';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import ReleasePublishModal, { type ReleasePayloadInput } from './ReleasePublishModal';
import styles from './ReleasesPage.module.scss';

const { Text } = Typography;

const PLATFORMS = [
  { value: 'win-x64', label: 'Windows (x64)' },
  { value: 'osx-arm64', label: 'macOS (Apple Silicon)' },
  { value: 'osx-x64', label: 'macOS (Intel)' },
  { value: 'linux-x64', label: 'Linux (x64)' },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ReleasesPage() {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const { selectedHallId } = useHallStore();

  // 获取展厅列表（用于展厅版本指定下拉）
  const { data: hallsData } = useQuery({
    queryKey: queryKeys.halls({ page: 1, page_size: 200 }),
    queryFn: () => hallApi.getHalls({ page: 1, page_size: 200 }),
    select: (res) => res.data.data?.list ?? [],
  });

  const [platform, setPlatform] = useState<string>('');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  const [assignForm] = Form.useForm();

  // ==================== 版本列表 ====================

  const { data: releasesData, isLoading } = useQuery({
    queryKey: queryKeys.releases({ platform }),
    queryFn: () => releaseApi.listReleases({ platform, page: 1, page_size: 100 }),
    select: (res) => res.data.data,
  });

  const releases = releasesData?.list ?? [];

  // ==================== 删除版本 ====================

  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      releaseApi.deleteRelease(id, reason),
    onSuccess: () => {
      message.success('版本已删除');
      queryClient.invalidateQueries({ queryKey: queryKeys.releases({}) });
    },
    onError: (err: Error) => message.error(err.message || '删除失败'),
  });

  // ==================== 上传新版本 ====================

  // Phase 4：Modal 升级为 Markdown + is_critical + 灰度，主流程移到 ReleasePublishModal。
  // 这里只做：拿凭证 → PUT OSS → 计 SHA-256 → 调 createRelease（带 5 个新字段）。
  const handlePublish = async (payload: ReleasePayloadInput, file: File) => {
    try {
      setUploading(true);
      setUploadProgress(0);

      // 1. 上传凭证
      const uploadRes = await releaseApi.requestUpload({
        platform: payload.platform,
        arch: payload.arch,
        version: payload.version,
        filename: file.name,
        content_type: file.type || 'application/octet-stream',
      }, payload.reason);
      const { presigned_url, oss_key } = uploadRes.data.data;

      // 2. PUT 到 OSS
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        });
        xhr.addEventListener('load', () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`上传失败: ${xhr.status}`)));
        xhr.addEventListener('error', () => reject(new Error('网络错误')));
        xhr.open('PUT', presigned_url);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.send(file);
      });

      // 3. 计算 SHA-256
      const buffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const sha256 = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

      // 4. 注册（含 5 个新字段）
      await releaseApi.createRelease({
        platform: payload.platform,
        arch: payload.arch,
        version: payload.version,
        oss_key,
        file_size: file.size,
        sha256,
        release_notes: payload.release_notes,
        release_notes_md: payload.release_notes_md || undefined,
        is_critical: payload.is_critical || undefined,
        rollout_policy: payload.rollout_policy,
        rollout_percent: payload.rollout_percent,
        rollout_hall_ids: payload.rollout_hall_ids?.map((id) => id),
      }, payload.reason);

      message.success(payload.is_critical ? '紧急补丁已发布' : '版本发布成功');
      setUploadModalOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.releases({}) });
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // ==================== 展厅版本指定 ====================

  const { data: hallVersionData } = useQuery({
    queryKey: queryKeys.hallAppVersion(selectedHallId ?? 0),
    queryFn: () => releaseApi.getHallVersion(selectedHallId!),
    select: (res) => res.data.data,
    enabled: !!selectedHallId,
  });

  const assignMutation = useMutation({
    mutationFn: (data: { hallId: number; version: string; reason?: string }) =>
      releaseApi.setHallVersion(data.hallId, { target_version: data.version }, data.reason),
    onSuccess: (_data, variables) => {
      message.success('目标版本已设置');
      setAssignModalOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.hallAppVersion(variables.hallId) });
    },
    onError: () => message.error('设置失败'),
  });

  const notifyMutation = useMutation({
    mutationFn: (data: { hallId: number; version: string; reason?: string }) =>
      releaseApi.notifyUpdate(data.hallId, data.version, data.reason),
    onSuccess: () => message.success('更新通知已推送'),
    onError: (err: Error) => message.error(err.message || '推送失败'),
  });

  // ==================== 表格列 ====================

  const columns: ColumnsType<AppRelease> = [
    { title: '版本号', dataIndex: 'version', key: 'version', width: 120 },
    {
      title: '平台', dataIndex: 'platform', key: 'platform', width: 160,
      render: (p: string) => <Tag>{PLATFORMS.find(x => x.value === p)?.label ?? p}</Tag>,
    },
    { title: '文件大小', dataIndex: 'file_size', key: 'file_size', width: 100, render: formatFileSize },
    {
      title: 'SHA-256', dataIndex: 'sha256', key: 'sha256', width: 160,
      render: (s: string) => <Text copyable={{ text: s }} className={styles.shaMono}>{s.slice(0, 12)}...</Text>,
    },
    {
      title: '发布说明', dataIndex: 'release_notes', key: 'release_notes', ellipsis: true,
    },
    {
      title: '发布时间', dataIndex: 'created_at', key: 'created_at', width: 170,
      render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作', key: 'action', width: 80,
      render: (_, record) => (
        <RiskyActionButton
          action="release.manage"
          type="text"
          danger
          icon={<DeleteOutlined />}
          size="small"
          confirmTitle={`删除版本 ${record.version}`}
          confirmContent="删除版本会从 OSS 移除安装包，已设置该版本为目标版本的展厅将无法升级。请填写操作原因（≥ 5 字，审计用）。"
          onConfirm={async (reason) => {
            await deleteMutation.mutateAsync({ id: record.id, reason });
          }}
        />
      ),
    },
  ];

  // ==================== Render ====================

  return (
    <div>
      {/* 📥 安装器（Phase 4c）— 现场新增展项首装专用，永久不变下载链接 */}
      <Card
        size="small"
        style={{ marginBottom: 16, background: '#f6ffed', borderColor: '#b7eb8f' }}
        styles={{ body: { padding: 12 } }}
        title={<span>📥 现场首装专用 · Bootstrap Installer 安装器</span>}
      >
        <Text type="secondary" style={{ fontSize: 12 }}>
          安装器永远拉取当前最新稳定版本（不参与灰度）。新增展项时把对应平台的链接发给现场即可，
          双击安装包后自动从云端拉最新版 + 写开机自启 + 启动展厅 App。
        </Text>
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {/* Windows 卡 */}
          <Card size="small" type="inner" title="Windows x64">
            <Space direction="vertical" style={{ width: '100%' }} size={4}>
              <Text style={{ fontSize: 12 }}>
                <code style={{ fontSize: 11 }}>
                  https://excs.crossovercg.com.cn/api/v1/installer/download/win-x64
                </code>
              </Text>
              <Text type="secondary" style={{ fontSize: 11 }}>
                ~2 MB · 双击 .exe → UAC 同意 → 自动拉当前最新展厅 App + 写 All Users 开机自启 · 适用 Win 10+
              </Text>
              <Space size={8} style={{ marginTop: 4 }}>
                <Button
                  type="primary"
                  size="small"
                  icon={<DownloadOutlined />}
                  href="/api/v1/installer/download/win-x64"
                  target="_blank"
                >
                  直接下载
                </Button>
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={async () => {
                    const url = `${window.location.origin}/api/v1/installer/download/win-x64`;
                    try {
                      await navigator.clipboard.writeText(url);
                      message.success('已复制下载链接');
                    } catch {
                      message.error('复制失败，请手动选中链接复制');
                    }
                  }}
                >
                  复制链接
                </Button>
              </Space>
            </Space>
          </Card>
          {/* Linux 卡（Phase 6） */}
          <Card size="small" type="inner" title="Linux x64 (Ubuntu 24.04)">
            <Space direction="vertical" style={{ width: '100%' }} size={4}>
              <Text style={{ fontSize: 12 }}>
                <code style={{ fontSize: 11 }}>
                  https://excs.crossovercg.com.cn/api/v1/installer/download/linux-x64
                </code>
              </Text>
              <Text type="secondary" style={{ fontSize: 11 }}>
                ~12 KB shell · <code style={{ fontSize: 10 }}>chmod +x ./*.run &amp;&amp; sudo ./*.run</code> 或一行
                {' '}<code style={{ fontSize: 10 }}>curl -fsSL &lt;url&gt; | sudo bash</code> · 自动 apt 装 VLC + 写 systemd 自启
              </Text>
              <Space size={8} style={{ marginTop: 4 }}>
                <Button
                  type="primary"
                  size="small"
                  icon={<DownloadOutlined />}
                  href="/api/v1/installer/download/linux-x64"
                  target="_blank"
                >
                  直接下载
                </Button>
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={async () => {
                    const url = `${window.location.origin}/api/v1/installer/download/linux-x64`;
                    try {
                      await navigator.clipboard.writeText(url);
                      message.success('已复制下载链接');
                    } catch {
                      message.error('复制失败，请手动选中链接复制');
                    }
                  }}
                >
                  复制链接
                </Button>
              </Space>
            </Space>
          </Card>
          {/* macOS 卡（暂缓） */}
          <Card size="small" type="inner" title="macOS Apple Silicon">
            <Space direction="vertical" style={{ width: '100%' }} size={4}>
              <Tag color="default">暂缓发布</Tag>
              <Text type="secondary" style={{ fontSize: 11 }}>
                Phase 3 待完成 — 需 Apple Developer ID Installer 证书 + first-install 完整 .app
                bundle 发布通道（PRD §六.6 已选方案 A）
              </Text>
              <Text type="secondary" style={{ fontSize: 11 }}>
                现阶段 mac 展项仍走人工分发 .dmg
              </Text>
            </Space>
          </Card>
        </div>
      </Card>

      <PageHeader
        title="版本管理"
        description="管理展厅 App 版本发布，设置展厅目标版本实现灰度升级"
        extra={
          <Space>
            <Button type="primary" icon={<UploadOutlined />} onClick={() => setUploadModalOpen(true)}>
              发布新版本
            </Button>
            {selectedHallId && (
              <Button icon={<SendOutlined />} onClick={() => setAssignModalOpen(true)}>
                指定展厅版本
              </Button>
            )}
          </Space>
        }
      />

      {/* 展厅当前目标版本 + 灰度状态 + 现网装版（app-bootstrap-installer Phase 4） */}
      {selectedHallId && hallVersionData && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Space wrap>
            <span>当前展厅目标版本：</span>
            <Tag color="blue">{hallVersionData.target_version}</Tag>
            <Tag color={
              hallVersionData.rollout_status === 'done' ? 'green' :
              hallVersionData.rollout_status === 'rolling' ? 'orange' : 'default'
            }>
              {hallVersionData.rollout_status === 'pending' ? '待推送' :
               hallVersionData.rollout_status === 'rolling' ? '推送中' :
               hallVersionData.rollout_status === 'done' ? '已完成' :
               hallVersionData.rollout_status}
            </Tag>
            {hallVersionData.rollout_status !== 'done' && (
              <RiskyActionButton
                action="release.notify"
                type="link"
                size="small"
                loading={notifyMutation.isPending}
                confirmTitle="推送 App 更新通知"
                confirmContent={`将向展厅 App 广播版本 ${hallVersionData.target_version} 可升级。请填写操作原因（≥ 5 字，审计用）。`}
                onConfirm={async (reason) => {
                  await notifyMutation.mutateAsync({
                    hallId: selectedHallId,
                    version: hallVersionData.target_version,
                    reason,
                  });
                }}
              >
                {hallVersionData.rollout_status === 'pending' ? '推送更新通知' : '重新推送'}
              </RiskyActionButton>
            )}
          </Space>
          {/* 现网装版 + 心跳鲜度（让 admin 一眼看清升级是否到位） */}
          <Space wrap style={{ marginTop: 8 }}>
            <span>现网装版：</span>
            {hallVersionData.installed_version ? (
              <Tag color={
                hallVersionData.installed_version === hallVersionData.target_version ? 'green' : 'orange'
              }>
                {hallVersionData.installed_version}
                {hallVersionData.installed_version !== hallVersionData.target_version && ' ⚠ 与目标版本不一致'}
              </Tag>
            ) : (
              <Tag color="default">展厅 App 从未上报</Tag>
            )}
            <span style={{ marginLeft: 16 }}>心跳：</span>
            {hallVersionData.last_report_at ? (() => {
              const ageMin = dayjs().diff(dayjs(hallVersionData.last_report_at), 'minute');
              const stale = ageMin > 5;
              return (
                <Tag color={stale ? 'red' : 'green'}>
                  {ageMin < 1 ? '刚才' :
                   ageMin < 60 ? `${ageMin} 分钟前` :
                   `${Math.floor(ageMin / 60)} 小时前`}
                  {stale && ' ⚠ 离线'}
                </Tag>
              );
            })() : (
              <Tag color="default">无心跳记录</Tag>
            )}
          </Space>
          <div className={styles.flowHint}>
            流程：设置目标版本（待推送）→ 推送通知（推送中）→ 终端确认安装（已完成）
          </div>
        </Card>
      )}

      {/* 版本列表（按平台分 Tab） */}
      <Card>
        <Tabs
          activeKey={platform}
          onChange={setPlatform}
          items={[
            { key: '', label: '全部' },
            ...PLATFORMS.map(p => ({ key: p.value, label: p.label })),
          ]}
        />
        <Table
          rowKey="id"
          columns={columns}
          dataSource={releases}
          loading={isLoading}
          pagination={false}
          size="small"
        />
      </Card>

      {/* 上传新版本弹窗（Phase 4：Markdown + is_critical + 灰度 + 实时预览矩阵） */}
      <ReleasePublishModal
        open={uploadModalOpen}
        uploading={uploading}
        uploadProgress={uploadProgress}
        onCancel={() => { if (!uploading) setUploadModalOpen(false); }}
        onSubmit={handlePublish}
      />

      {/* 指定展厅版本弹窗 */}
      <Modal
        title="指定展厅目标版本"
        open={assignModalOpen}
        onOk={async () => {
          const values = await assignForm.validateFields();
          assignMutation.mutate({
            hallId: values.hall_id,
            version: values.version,
            reason: values.reason,
          });
        }}
        onCancel={() => { setAssignModalOpen(false); assignForm.resetFields(); }}
        confirmLoading={assignMutation.isPending}
        okText="确认"
      >
        <Form form={assignForm} layout="vertical" initialValues={{ hall_id: selectedHallId }}>
          <Form.Item name="hall_id" label="展厅" rules={[{ required: true }]}>
            <Select
              placeholder="选择展厅"
              options={(hallsData ?? []).map(h => ({ value: h.id, label: h.name }))}
            />
          </Form.Item>
          <Form.Item name="version" label="目标版本" rules={[{ required: true }]}>
            <Select
              placeholder="选择版本"
              options={releases.map(r => ({ value: r.version, label: `${r.version} (${r.platform})` }))}
            />
          </Form.Item>
          <Form.Item
            name="reason"
            label="操作原因"
            rules={[
              { required: true, message: '请填写操作原因（审计用）' },
              { min: 5, message: '操作原因至少 5 字' },
            ]}
            help="release.manage 是高风险操作，原因将记入审计日志（≥ 5 字）"
          >
            <Input.TextArea rows={2} maxLength={500} showCount placeholder="例如：序厅试点灰度升级到 v1.3.0" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
