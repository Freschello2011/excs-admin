import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Switch, Tooltip, Space, Popconfirm, Image, Input, Typography, Card } from 'antd';
import { useMessage } from '@/hooks/useMessage';
import { UploadOutlined, DeleteOutlined, FileImageOutlined, SoundOutlined, EditOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import StatusTag from '@/components/common/StatusTag';
import InlinePipeline from '@/components/content/InlinePipeline';
import { contentApi } from '@/api/content';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import type { ExhibitContentItem } from '@/types/content';
import type { ExhibitListItem } from '@/types/hall';

interface Props {
  hallId: number;
  exhibitId: number;
  exhibit: ExhibitListItem;
  canManage: boolean;
}

interface UploadTask {
  file: File;
  contentId?: number;
  progress: number;
  elapsed: number;
  status: 'pending' | 'uploading' | 'completing' | 'done' | 'error';
  error?: string;
}

function formatFileSize(bytes: number | undefined | null): string {
  if (!bytes || bytes <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export default function ExhibitContentTab({ hallId, exhibitId, exhibit, canManage }: Props) {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const [renamingContentId, setRenamingContentId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const { data: items = [] } = useQuery({
    queryKey: queryKeys.exhibitContent(exhibitId),
    queryFn: () => contentApi.getExhibitContent(exhibitId),
    select: (res) => res.data.data,
    refetchInterval: (query) => {
      const raw = query.state.data;
      const data = raw?.data?.data;
      if (data && data.some((c: ExhibitContentItem) => c.pipeline_status && c.pipeline_status !== 'ready' && c.pipeline_status !== 'completed' && c.pipeline_status !== 'done' && c.pipeline_status !== '' && c.pipeline_status !== 'failed')) {
        // completed 状态仍展示已完成进度条，不参与轮询
        return 2000;
      }
      return false;
    },
  });

  const aiTagMutation = useMutation({
    mutationFn: (enable: boolean) =>
      hallApi.updateExhibit(hallId, exhibitId, { enable_ai_tag: enable }),
    onSuccess: () => {
      message.success('AI 打标设置已更新');
      queryClient.invalidateQueries({ queryKey: queryKeys.exhibits(hallId) });
    },
  });

  const watermarkMutation = useMutation({
    mutationFn: ({ contentId, is_watermarked }: { contentId: number; is_watermarked: boolean }) =>
      contentApi.setWatermark(contentId, { is_watermarked }),
    onSuccess: () => {
      message.success('水印标记已更新');
      queryClient.invalidateQueries({ queryKey: queryKeys.exhibitContent(exhibitId) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (contentId: number) =>
      contentApi.deleteContent(contentId),
    onSuccess: () => {
      message.success('文件已删除');
      queryClient.invalidateQueries({ queryKey: queryKeys.exhibitContent(exhibitId) });
    },
    onError: () => {
      message.error('删除失败');
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ contentId, name }: { contentId: number; name: string }) =>
      contentApi.updateContent(contentId, name),
    onSuccess: () => {
      message.success('名称已更新');
      setRenamingContentId(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.exhibitContent(exhibitId) });
    },
    onError: () => {
      message.error('重命名失败');
    },
  });

  const startRename = (contentId: number, currentName: string) => {
    setRenamingContentId(contentId);
    setRenameValue(currentName);
  };

  const confirmRename = (contentId: number) => {
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    renameMutation.mutate({ contentId, name: trimmed });
  };

  const cancelRename = () => {
    setRenamingContentId(null);
    setRenameValue('');
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFilesChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const tasks: UploadTask[] = fileArray.map((file) => ({
      file,
      progress: 0,
      elapsed: 0,
      status: 'pending' as const,
    }));

    setUploadTasks(tasks);
    e.target.value = '';

    for (let i = 0; i < tasks.length; i++) {
      await uploadOneFile(tasks, i);
    }
  };

  const uploadOneFile = async (tasks: UploadTask[], index: number) => {
    const task = tasks[index];
    const startTime = Date.now();

    try {
      setUploadTasks((prev) => prev.map((t, i) => i === index ? { ...t, status: 'uploading' } : t));

      const stsRes = await contentApi.uploadToExhibit(exhibitId, {
        filename: task.file.name,
        file_size: task.file.size,
        content_type: task.file.type || 'application/octet-stream',
      });

      const { content_id, presigned_url } = stsRes.data.data;
      if (!presigned_url) throw new Error('服务端未返回上传地址');

      setUploadTasks((prev) => prev.map((t, i) => i === index ? { ...t, contentId: content_id } : t));

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', (ev) => {
          if (ev.lengthComputable) {
            const pct = Math.round((ev.loaded / ev.total) * 100);
            const sec = Math.floor((Date.now() - startTime) / 1000);
            setUploadTasks((prev) => prev.map((t, i) => i === index ? { ...t, progress: pct, elapsed: sec } : t));
          }
        });
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`OSS 上传失败 (${xhr.status})`));
        });
        xhr.addEventListener('error', () => reject(new Error('网络错误')));
        xhr.addEventListener('abort', () => reject(new Error('上传已取消')));
        xhr.open('PUT', presigned_url);
        xhr.setRequestHeader('Content-Type', task.file.type || 'application/octet-stream');
        xhr.send(task.file);
      });

      setUploadTasks((prev) => prev.map((t, i) => i === index ? { ...t, status: 'completing', progress: 100 } : t));

      await contentApi.uploadComplete(content_id, { content_id });

      setUploadTasks((prev) => prev.map((t, i) => i === index ? { ...t, status: 'done' } : t));
      message.success(`${task.file.name} 上传成功`);
      queryClient.invalidateQueries({ queryKey: queryKeys.exhibitContent(exhibitId) });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '上传失败';
      setUploadTasks((prev) => prev.map((t, i) => i === index ? { ...t, status: 'error', error: errMsg } : t));
      message.error(`${task.file.name}: ${errMsg}`);
    }
  };

  const hasActiveUpload = uploadTasks.some((t) => t.status === 'uploading' || t.status === 'completing');

  const renderFileRow = (item: ExhibitContentItem) => {
    // 仅在未就绪时展示流水线（处理中 / 失败 / pending 都会显示；ready 全部隐藏）
    const showPipeline = item.status !== 'ready';
    const isRenaming = renamingContentId === item.content_id;

    const renderFilename = () => {
      if (isRenaming) {
        return (
          <Space size={4}>
            <Input
              size="small"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onPressEnter={() => confirmRename(item.content_id)}
              onKeyDown={(e) => { if (e.key === 'Escape') cancelRename(); }}
              style={{ width: 200 }}
              autoFocus
              maxLength={100}
            />
            <Button type="text" size="small" icon={<CheckOutlined />} onClick={() => confirmRename(item.content_id)} loading={renameMutation.isPending} />
            <Button type="text" size="small" icon={<CloseOutlined />} onClick={cancelRename} />
          </Space>
        );
      }
      return (
        <>
          <Typography.Text ellipsis style={{ maxWidth: 240 }}>{item.filename}</Typography.Text>
          {canManage && (
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => startRename(item.content_id, item.filename)}
              style={{ marginLeft: -4 }}
            />
          )}
        </>
      );
    };

    return (
      <div
        key={item.content_id}
        style={{
          padding: '12px 14px',
          borderRadius: 10,
          transition: 'background 180ms',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.background = 'rgba(var(--color-primary-rgb), 0.04)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.background = 'transparent';
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* 缩略图 */}
          <div style={{ flexShrink: 0 }}>
            {item.thumbnail_url ? (
              <Image
                src={item.thumbnail_url}
                width={64}
                height={36}
                style={{ objectFit: 'cover', borderRadius: 6 }}
                fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iMzYiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjM2IiBmaWxsPSIjZjBmMGYwIi8+PC9zdmc+"
                preview={{ mask: false }}
              />
            ) : (
              <div
                style={{
                  width: 64,
                  height: 36,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'linear-gradient(135deg, rgba(var(--color-primary-rgb), 0.15), rgba(var(--color-primary-rgb), 0.06))',
                  color: 'var(--color-primary)',
                  borderRadius: 6,
                  boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.4)',
                }}
              >
                <FileImageOutlined style={{ fontSize: 18 }} />
              </div>
            )}
          </div>

          {/* 文件信息 — 双行：名称 + meta */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* 第一行：文件名 + 重命名笔 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              {renderFilename()}
            </div>
            {/* 第二行：size · duration · sound · version · status */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
                fontSize: 11,
                color: 'var(--color-outline)',
              }}
            >
              <span>{formatFileSize(item.file_size)}</span>
              {item.duration_ms > 0 && <span>{formatDuration(item.duration_ms)}</span>}
              {item.has_audio && (
                <SoundOutlined style={{ color: 'var(--color-primary)', fontSize: 12 }} />
              )}
              <span style={{ fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>
                {typeof item.version === 'string' && item.version.startsWith('v') ? item.version : `v${item.version}`}
              </span>
              <StatusTag status={item.status} />
            </div>
          </div>

          {/* 水印开关（带 tooltip）*/}
          <Tooltip title={item.is_watermarked ? '已标记为水印文件' : '标记为水印文件'}>
            <Switch
              size="small"
              checked={item.is_watermarked}
              loading={watermarkMutation.isPending}
              onChange={(checked) => watermarkMutation.mutate({ contentId: item.content_id, is_watermarked: checked })}
              disabled={!canManage}
            />
          </Tooltip>

          {/* 删除 */}
          {canManage && (
            <Popconfirm
              title="确认删除此文件？"
              description="删除后 OSS 文件和关联标签将一并清除"
              onConfirm={() => deleteMutation.mutate(item.content_id)}
              okText="删除"
              okButtonProps={{ danger: true }}
            >
              <Button type="text" danger size="small" icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </div>

        {/* Inline pipeline */}
        {showPipeline && (
          <div style={{ marginTop: 4, marginLeft: 76 }}>
            <InlinePipeline
              stages={item.pipeline_stages || []}
              overallProgress={item.overall_progress || 0}
              etaSeconds={item.eta_seconds}
              uploadStatus="done"
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* 玻璃工具栏 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginBottom: 16,
          flexWrap: 'wrap',
          padding: '14px 18px',
          background: 'rgba(255, 255, 255, 0.6)',
          border: '1px solid var(--color-outline-variant)',
          borderRadius: 12,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        {canManage && (
          <Button type="primary" icon={<UploadOutlined />} onClick={handleFileSelect} loading={hasActiveUpload}>
            上传文件
          </Button>
        )}
        <div style={{ width: 1, height: 20, background: 'var(--color-outline-variant)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tooltip title="关闭后，新上传的视频将不再自动生成 AI 标签">
            <span style={{ fontSize: 13, color: 'var(--color-on-surface-variant)' }}>AI 自动打标</span>
          </Tooltip>
          <Switch
            checked={exhibit.enable_ai_tag}
            loading={aiTagMutation.isPending}
            onChange={(checked) => aiTagMutation.mutate(checked)}
            disabled={!canManage}
          />
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--color-outline)' }}>
          共 {items.length} 个文件{items.length > 0 && ` · 总计 ${formatFileSize(
            items.reduce((sum, it) => sum + (it.file_size || 0), 0)
          )}`}
        </span>
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          multiple
          onChange={handleFilesChosen}
        />
      </div>

      {/* Upload progress */}
      {uploadTasks.length > 0 && (
        <div
          style={{
            marginBottom: 16,
            padding: 14,
            background: 'rgba(var(--color-primary-rgb), 0.05)',
            border: '1px solid rgba(var(--color-primary-rgb), 0.15)',
            borderRadius: 12,
          }}
        >
          <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 13, color: 'var(--color-on-surface)' }}>
            上传进度
          </div>
          {uploadTasks.map((task, i) => (
            <div key={i} style={{ marginBottom: 4, fontSize: 12 }}>
              <Space>
                <span>{task.file.name}</span>
                <span style={{ color: 'var(--color-on-surface-variant)' }}>({formatFileSize(task.file.size)})</span>
                {task.status === 'uploading' && <span style={{ color: 'var(--color-primary)' }}>{task.progress}%</span>}
                {task.status === 'completing' && <span style={{ color: 'var(--color-primary)' }}>通知后端...</span>}
                {task.status === 'done' && <span style={{ color: 'var(--color-success)' }}>完成</span>}
                {task.status === 'error' && <span style={{ color: 'var(--color-error)' }}>{task.error}</span>}
              </Space>
            </div>
          ))}
        </div>
      )}

      {/* 玻璃卡包文件列表 */}
      {items.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: 40,
            color: 'var(--color-outline)',
            background: 'rgba(var(--color-primary-rgb), 0.03)',
            border: '1px dashed var(--color-outline-variant)',
            borderRadius: 12,
          }}
        >
          暂无内容文件，请上传
        </div>
      ) : (
        <Card styles={{ body: { padding: 8 } }}>
          {items.map((item) => renderFileRow(item))}
        </Card>
      )}
    </div>
  );
}
