import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card, Table, Button, Space, Tag, Tabs, Modal, Form, Input,
  Select, Popconfirm, Progress, Typography,
} from 'antd';
import { useMessage } from '@/hooks/useMessage';
import { UploadOutlined, DeleteOutlined, SendOutlined } from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import { releaseApi } from '@/api/release';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import { useHallStore } from '@/stores/hallStore';
import type { AppRelease } from '@/api/gen/client';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';

const { Text } = Typography;

const PLATFORMS = [
  { value: 'osx-arm64', label: 'macOS (Apple Silicon)' },
  { value: 'osx-x64', label: 'macOS (Intel)' },
  { value: 'win-x64', label: 'Windows (x64)' },
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

  const [uploadForm] = Form.useForm();
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
    mutationFn: (id: number) => releaseApi.deleteRelease(id),
    onSuccess: () => {
      message.success('版本已删除');
      queryClient.invalidateQueries({ queryKey: queryKeys.releases({}) });
    },
    onError: () => message.error('删除失败'),
  });

  // ==================== 上传新版本 ====================

  const handleUpload = async () => {
    try {
      const values = await uploadForm.validateFields();
      const file = values.file?.[0]?.originFileObj || values._file;
      if (!file) {
        message.error('请选择文件');
        return;
      }
      const fileError = validateFile(file);
      if (fileError) {
        message.error(fileError);
        return;
      }

      setUploading(true);
      setUploadProgress(0);

      // 1. 获取上传凭证
      const uploadRes = await releaseApi.requestUpload({
        platform: values.platform,
        arch: values.platform.split('-').pop() || 'x64',
        version: values.version,
        filename: file.name,
        content_type: file.type || 'application/octet-stream',
      });
      const { presigned_url, oss_key } = uploadRes.data.data;

      // 2. 上传文件到 OSS
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

      // 4. 注册版本元数据
      await releaseApi.createRelease({
        platform: values.platform,
        arch: values.platform.split('-').pop() || 'x64',
        version: values.version,
        oss_key,
        file_size: file.size,
        sha256,
        release_notes: values.release_notes || '',
      });

      message.success('版本发布成功');
      setUploadModalOpen(false);
      uploadForm.resetFields();
      queryClient.invalidateQueries({ queryKey: queryKeys.releases({}) });
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // 文件校验
  const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB
  const ALLOWED_EXTENSIONS = ['.zip', '.dmg', '.pkg', '.exe', '.msi', '.msix'];
  const validateFile = (file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) {
      return `文件大小 ${formatFileSize(file.size)} 超过限制（最大 500 MB）`;
    }
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `不支持的文件类型 ${ext}，允许：${ALLOWED_EXTENSIONS.join(', ')}`;
    }
    return null;
  };

  // ==================== 展厅版本指定 ====================

  const { data: hallVersionData } = useQuery({
    queryKey: queryKeys.hallAppVersion(selectedHallId ?? 0),
    queryFn: () => releaseApi.getHallVersion(selectedHallId!),
    select: (res) => res.data.data,
    enabled: !!selectedHallId,
  });

  const assignMutation = useMutation({
    mutationFn: (data: { hallId: number; version: string }) =>
      releaseApi.setHallVersion(data.hallId, { target_version: data.version }),
    onSuccess: (_data, variables) => {
      message.success('目标版本已设置');
      setAssignModalOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.hallAppVersion(variables.hallId) });
    },
    onError: () => message.error('设置失败'),
  });

  const notifyMutation = useMutation({
    mutationFn: (data: { hallId: number; version: string }) =>
      releaseApi.notifyUpdate(data.hallId, data.version),
    onSuccess: () => message.success('更新通知已推送'),
    onError: () => message.error('推送失败'),
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
      render: (s: string) => <Text copyable={{ text: s }} style={{ fontSize: 12 }}>{s.slice(0, 12)}...</Text>,
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
        <Popconfirm title="确认删除此版本？" onConfirm={() => deleteMutation.mutate(record.id)}>
          <Button type="text" danger icon={<DeleteOutlined />} size="small" />
        </Popconfirm>
      ),
    },
  ];

  // ==================== Render ====================

  return (
    <div>
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

      {/* 展厅当前目标版本 + 灰度状态 */}
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
              <Button
                type="link"
                size="small"
                onClick={() => notifyMutation.mutate({
                  hallId: selectedHallId, version: hallVersionData.target_version,
                })}
                loading={notifyMutation.isPending}
              >
                {hallVersionData.rollout_status === 'pending' ? '推送更新通知' : '重新推送'}
              </Button>
            )}
          </Space>
          <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
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

      {/* 上传新版本弹窗 */}
      <Modal
        title="发布新版本"
        open={uploadModalOpen}
        onOk={handleUpload}
        onCancel={() => { setUploadModalOpen(false); uploadForm.resetFields(); }}
        confirmLoading={uploading}
        okText="发布"
        width={520}
      >
        <Form form={uploadForm} layout="vertical">
          <Form.Item name="platform" label="目标平台" rules={[{ required: true }]}>
            <Select options={PLATFORMS} placeholder="选择平台" />
          </Form.Item>
          <Form.Item name="version" label="版本号" rules={[{ required: true, pattern: /^\d+\.\d+\.\d+/, message: '请输入 semver 格式版本号' }]}>
            <Input placeholder="例如 1.2.0" />
          </Form.Item>
          <Form.Item name="_file" label="安装包" rules={[{ required: true, message: '请选择文件' }]}>
            <input
              type="file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadForm.setFieldValue('_file', file);
              }}
            />
          </Form.Item>
          <Form.Item name="release_notes" label="发布说明">
            <Input.TextArea rows={3} placeholder="本次更新内容..." />
          </Form.Item>
          {uploading && <Progress percent={uploadProgress} />}
        </Form>
      </Modal>

      {/* 指定展厅版本弹窗 */}
      <Modal
        title="指定展厅目标版本"
        open={assignModalOpen}
        onOk={async () => {
          const values = await assignForm.validateFields();
          assignMutation.mutate({ hallId: values.hall_id, version: values.version });
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
        </Form>
      </Modal>
    </div>
  );
}
