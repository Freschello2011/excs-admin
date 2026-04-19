import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card, Button, Modal, Form, Input, Space,
  Popconfirm, Empty, Spin, Progress, Row, Col, Tag, Divider,
} from 'antd';
import { useMessage } from '@/hooks/useMessage';
import { PlusOutlined, DeleteOutlined, EyeOutlined, EditOutlined } from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import StatusTag from '@/components/common/StatusTag';
import AvatarSpritePreview from '@/components/ai/AvatarSpritePreview';
import WhiteboardLayoutEditor, { DEFAULT_LAYOUT_CONFIG } from '@/components/ai/WhiteboardLayoutEditor';
import { aiApi } from '@/api/ai';
import { queryKeys } from '@/api/queryKeys';
import type { TemplateListItem, VideoType, LayoutConfig } from '@/types/ai';

/* ─── Upload Task Types ─── */

interface UploadTask {
  type: VideoType;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'completing' | 'done' | 'error';
  error?: string;
}

const VIDEO_LABELS: Record<VideoType, string> = {
  idle: '待机视频',
  thinking: '思考视频',
  talking: '说话视频',
};

const ACCEPTED_VIDEO = '.mp4,.webm,video/mp4,video/webm';

function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export default function AiAvatarLibraryPage() {
  const { message } = useMessage();
  const queryClient = useQueryClient();

  /* ─── List Query (auto-poll when templates are processing) ─── */
  const { data: templates, isLoading } = useQuery({
    queryKey: queryKeys.aiTemplates,
    queryFn: () => aiApi.listTemplates(),
    select: (res) => res.data.data.list,
    refetchInterval: (query) => {
      const list = query.state.data?.data?.data?.list;
      if (list?.some((t: TemplateListItem) => t.status === 'processing' || t.status === 'uploading')) {
        return 3000;
      }
      return false;
    },
  });

  /* ─── Preview Modal ─── */
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewId, setPreviewId] = useState<number | null>(null);

  const { data: previewDetail } = useQuery({
    queryKey: queryKeys.aiTemplateDetail(previewId!),
    queryFn: () => aiApi.getTemplate(previewId!),
    select: (res) => res.data.data,
    enabled: !!previewId && previewOpen,
  });

  const openPreview = (id: number) => {
    setPreviewId(id);
    setPreviewOpen(true);
  };

  /* ─── Edit Modal ─── */
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm] = Form.useForm();
  const [editLayout, setEditLayout] = useState<LayoutConfig>(DEFAULT_LAYOUT_CONFIG);

  // Load full template detail when edit modal opens (for default_layout_config)
  const { data: editDetail } = useQuery({
    queryKey: queryKeys.aiTemplateDetail(editId!),
    queryFn: () => aiApi.getTemplate(editId!),
    select: (res) => res.data.data,
    enabled: !!editId && editOpen,
  });

  useEffect(() => {
    if (editDetail && editOpen) {
      editForm.setFieldsValue({ name: editDetail.name, description: editDetail.description });
      setEditLayout(editDetail.default_layout_config ?? DEFAULT_LAYOUT_CONFIG);
    }
  }, [editDetail, editOpen, editForm]);

  const openEdit = (item: TemplateListItem) => {
    setEditId(item.id);
    editForm.setFieldsValue({ name: item.name, description: item.description });
    setEditLayout(DEFAULT_LAYOUT_CONFIG);
    setEditOpen(true);
  };

  const editMutation = useMutation({
    mutationFn: ({ id, data }: {
      id: number;
      data: { name: string; description: string; default_layout_config: LayoutConfig };
    }) => aiApi.updateTemplate(id, data),
    onSuccess: () => {
      message.success('形象信息已更新');
      queryClient.invalidateQueries({ queryKey: queryKeys.aiTemplates });
      queryClient.invalidateQueries({ queryKey: ['ai', 'template'] });
      setEditOpen(false);
    },
  });

  const handleEditSubmit = () => {
    editForm.validateFields().then((values) => {
      if (!editId) return;
      editMutation.mutate({
        id: editId,
        data: {
          name: values.name,
          description: values.description ?? '',
          default_layout_config: editLayout,
        },
      });
    });
  };

  /* ─── Delete ─── */
  const deleteMutation = useMutation({
    mutationFn: (id: number) => aiApi.deleteTemplate(id),
    onSuccess: () => {
      message.success('形象模板已删除');
      queryClient.invalidateQueries({ queryKey: queryKeys.aiTemplates });
    },
    onError: () => {
      message.error('删除失败，请检查是否有展项关联');
    },
  });

  /* ─── Create Modal ─── */
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const [videoFiles, setVideoFiles] = useState<Record<VideoType, File | null>>({
    idle: null,
    thinking: null,
    talking: null,
  });
  const fileInputRefs = {
    idle: useRef<HTMLInputElement>(null),
    thinking: useRef<HTMLInputElement>(null),
    talking: useRef<HTMLInputElement>(null),
  };

  const resetCreateState = () => {
    createForm.resetFields();
    setVideoFiles({ idle: null, thinking: null, talking: null });
    setUploadTasks([]);
  };

  const handleFileChange = (type: VideoType, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFiles((prev) => ({ ...prev, [type]: file }));
    }
    e.target.value = '';
  };

  const createMutation = useMutation({
    mutationFn: async (values: { name: string; description?: string }) => {
      // 1. Create template
      const createRes = await aiApi.createTemplate(values);
      const template = createRes.data.data;

      // 2. Upload each video
      const types: VideoType[] = ['idle', 'thinking', 'talking'];
      const tasks: UploadTask[] = types.map((type) => ({
        type,
        file: videoFiles[type]!,
        progress: 0,
        status: 'pending' as const,
      }));
      setUploadTasks(tasks);

      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        try {
          setUploadTasks((prev) =>
            prev.map((t, idx) => (idx === i ? { ...t, status: 'uploading' } : t)),
          );

          // Get presigned URL
          const urlRes = await aiApi.getTemplateUploadURL(template.id, {
            type: task.type,
            filename: task.file.name,
            file_size: task.file.size,
            content_type: task.file.type || 'video/mp4',
          });
          const { presigned_url } = urlRes.data.data;

          // Upload via XHR for progress
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.upload.addEventListener('progress', (ev) => {
              if (ev.lengthComputable) {
                const pct = Math.round((ev.loaded / ev.total) * 100);
                setUploadTasks((prev) =>
                  prev.map((t, idx) => (idx === i ? { ...t, progress: pct } : t)),
                );
              }
            });
            xhr.addEventListener('load', () => {
              if (xhr.status >= 200 && xhr.status < 300) resolve();
              else reject(new Error(`OSS 上传失败 (${xhr.status})`));
            });
            xhr.addEventListener('error', () => reject(new Error('网络错误')));
            xhr.open('PUT', presigned_url);
            xhr.setRequestHeader('Content-Type', task.file.type || 'video/mp4');
            xhr.send(task.file);
          });

          // Notify completion
          setUploadTasks((prev) =>
            prev.map((t, idx) => (idx === i ? { ...t, status: 'completing', progress: 100 } : t)),
          );
          await aiApi.completeTemplateUpload(template.id, { type: task.type });

          setUploadTasks((prev) =>
            prev.map((t, idx) => (idx === i ? { ...t, status: 'done' } : t)),
          );
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : '上传失败';
          setUploadTasks((prev) =>
            prev.map((t, idx) => (idx === i ? { ...t, status: 'error', error: errMsg } : t)),
          );
          throw err; // Abort remaining uploads
        }
      }

      return template;
    },
    onSuccess: () => {
      message.success('形象模板创建成功，雪碧图生成中...');
      queryClient.invalidateQueries({ queryKey: queryKeys.aiTemplates });
      setCreateOpen(false);
      resetCreateState();
    },
    onError: (err) => {
      message.error(err instanceof Error ? err.message : '创建失败');
    },
  });

  const handleCreateSubmit = () => {
    createForm.validateFields().then((values) => {
      if (!videoFiles.idle || !videoFiles.thinking || !videoFiles.talking) {
        message.warning('请上传三组视频（待机/思考/说话）');
        return;
      }
      createMutation.mutate(values);
    });
  };

  const hasActiveUpload = uploadTasks.some(
    (t) => t.status === 'uploading' || t.status === 'completing',
  );

  /* ─── Status Mapping ─── */
  const statusMap: Record<string, { status: string; label: string }> = {
    uploading: { status: 'pending', label: '上传中' },
    processing: { status: 'running', label: '处理中' },
    ready: { status: 'active', label: '就绪' },
    error: { status: 'error', label: '错误' },
  };

  /* ─── Render ─── */
  return (
    <div>
      <PageHeader
        title="AI 形象库"
        description="管理全局可复用的 AI 形象模板"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            创建新形象
          </Button>
        }
      />

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Spin />
        </div>
      ) : !templates?.length ? (
        <Empty description="暂无形象模板" style={{ padding: 80 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            创建新形象
          </Button>
        </Empty>
      ) : (
        <Row gutter={[16, 16]}>
          {templates.map((item) => {
            const st = statusMap[item.status] ?? { status: 'default', label: item.status };
            return (
              <Col key={item.id} xs={24} sm={12} md={8} lg={6}>
                <Card
                  hoverable
                  cover={
                    <div
                      style={{
                        height: 180,
                        background: 'var(--ant-color-bg-layout)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                      }}
                    >
                      {item.thumbnail_url ? (
                        <img
                          src={item.thumbnail_url}
                          alt={item.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <span
                          className="material-symbols-outlined"
                          style={{ fontSize: 48, color: 'var(--ant-color-text-quaternary)' }}
                        >
                          smart_toy
                        </span>
                      )}
                    </div>
                  }
                  actions={[
                    <EyeOutlined key="preview" onClick={() => openPreview(item.id)} />,
                    <EditOutlined key="edit" onClick={() => openEdit(item)} />,
                    item.reference_count > 0 ? (
                      <DeleteOutlined
                        key="delete"
                        style={{ color: 'var(--ant-color-text-disabled)', cursor: 'not-allowed' }}
                        title="有关联展项，不可删除"
                      />
                    ) : (
                      <Popconfirm
                        key="delete"
                        title="确认删除此形象模板？"
                        onConfirm={() => deleteMutation.mutate(item.id)}
                        okText="删除"
                        okButtonProps={{ danger: true }}
                      >
                        <DeleteOutlined style={{ color: 'var(--ant-color-error)' }} />
                      </Popconfirm>
                    ),
                  ]}
                >
                  <Card.Meta
                    title={
                      <Space>
                        <span>{item.name}</span>
                        <StatusTag status={st.status} label={st.label} />
                      </Space>
                    }
                    description={
                      <div>
                        <div
                          style={{
                            fontSize: 13,
                            color: 'var(--ant-color-text-secondary)',
                            marginBottom: 4,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.description || '暂无描述'}
                        </div>
                        <Tag color={item.reference_count > 0 ? 'blue' : undefined}>
                          已关联 {item.reference_count} 个展项
                        </Tag>
                      </div>
                    }
                  />
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      {/* ─── Preview Modal ─── */}
      <Modal
        title={previewDetail ? `预览 — ${previewDetail.name}` : '预览'}
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={null}
        width={720}
        destroyOnClose
      >
        {previewDetail ? (
          <AvatarSpritePreview
            templateId={previewDetail.id}
            idleSpriteSheets={previewDetail.idle_sprite_sheets}
            thinkingSpriteSheets={previewDetail.thinking_sprite_sheets}
            talkingSpriteSheets={previewDetail.talking_sprite_sheets}
            autoPlay
          />
        ) : (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin tip="加载中..." />
          </div>
        )}
      </Modal>

      {/* ─── Edit Modal ─── */}
      <Modal
        title="编辑形象模板"
        open={editOpen}
        onOk={handleEditSubmit}
        onCancel={() => setEditOpen(false)}
        okText="保存"
        cancelText="取消"
        confirmLoading={editMutation.isPending}
        width={760}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} maxLength={500} showCount />
          </Form.Item>
        </Form>

        <Divider plain style={{ marginTop: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 13 }}>默认白板布局（展项未覆盖时生效）</span>
        </Divider>
        <WhiteboardLayoutEditor value={editLayout} onChange={setEditLayout} />
      </Modal>

      {/* ─── Create Modal ─── */}
      <Modal
        title="创建新形象"
        open={createOpen}
        onOk={handleCreateSubmit}
        onCancel={() => {
          if (!hasActiveUpload) {
            setCreateOpen(false);
            resetCreateState();
          }
        }}
        okText="创建"
        cancelText="取消"
        confirmLoading={createMutation.isPending}
        width={600}
        maskClosable={!hasActiveUpload}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input maxLength={100} placeholder="如：小艾 · 女性形象" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} maxLength={500} showCount placeholder="简要描述形象特点" />
          </Form.Item>

          {/* Video uploads */}
          {(['idle', 'thinking', 'talking'] as const).map((type) => (
            <Form.Item key={type} label={VIDEO_LABELS[type]} required>
              <Space>
                <Button
                  icon={<PlusOutlined />}
                  onClick={() => fileInputRefs[type].current?.click()}
                  disabled={hasActiveUpload}
                >
                  {videoFiles[type] ? videoFiles[type]!.name : '选择文件'}
                </Button>
                {videoFiles[type] && (
                  <span style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>
                    {formatFileSize(videoFiles[type]!.size)}
                  </span>
                )}
                <input
                  ref={fileInputRefs[type]}
                  type="file"
                  accept={ACCEPTED_VIDEO}
                  style={{ display: 'none' }}
                  onChange={(e) => handleFileChange(type, e)}
                />
              </Space>
            </Form.Item>
          ))}
        </Form>

        {/* Upload progress */}
        {uploadTasks.length > 0 && (
          <div
            style={{
              padding: 12,
              background: 'var(--ant-color-bg-layout)',
              borderRadius: 8,
              marginTop: 8,
            }}
          >
            <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 13 }}>上传进度</div>
            {uploadTasks.map((task) => (
              <div key={task.type} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span>{VIDEO_LABELS[task.type]}</span>
                  <span>
                    {task.status === 'uploading' && `${task.progress}%`}
                    {task.status === 'completing' && '通知后端...'}
                    {task.status === 'done' && '完成'}
                    {task.status === 'error' && (
                      <span style={{ color: 'var(--ant-color-error)' }}>{task.error}</span>
                    )}
                    {task.status === 'pending' && '等待'}
                  </span>
                </div>
                <Progress
                  percent={task.progress}
                  size="small"
                  status={
                    task.status === 'error'
                      ? 'exception'
                      : task.status === 'done'
                        ? 'success'
                        : 'active'
                  }
                  showInfo={false}
                />
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
