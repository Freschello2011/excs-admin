import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Switch, Tooltip, Space, Image, Input, Typography, Card } from 'antd';
import { useMessage } from '@/hooks/useMessage';
import {
  UploadOutlined, DeleteOutlined, FileImageOutlined, SoundOutlined,
  EditOutlined, CheckOutlined, CloseOutlined,
} from '@ant-design/icons';
import StatusTag from '@/components/common/StatusTag';
import InlinePipeline from '@/components/content/InlinePipeline';
import RiskyActionButton from '@/components/authz/RiskyActionButton';
import { contentApi } from '@/api/content';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import type { ExhibitContentItem } from '@/api/gen/client';
import type { ExhibitListItem } from '@/api/gen/client';
import styles from './ExhibitContentTab.module.scss';

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

function hasActivePipeline(items: ExhibitContentItem[] | undefined): boolean {
  if (!items || items.length === 0) return false;
  return items.some((c) => {
    const s = c.pipeline_status;
    return s && s !== 'ready' && s !== 'completed' && s !== 'done' && s !== '' && s !== 'failed';
  });
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
      const data = query.state.data?.data?.data;
      return hasActivePipeline(data) ? 2000 : false;
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
      queryClient.invalidateQueries({ queryKey: ['contents'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ contentId, reason }: { contentId: number; reason?: string }) =>
      contentApi.deleteContent(contentId, reason),
    onSuccess: () => {
      message.success('文件已删除');
      queryClient.invalidateQueries({ queryKey: queryKeys.exhibitContent(exhibitId) });
      queryClient.invalidateQueries({ queryKey: ['contents'] });
    },
    onError: (err: Error) => message.error(err.message || '删除失败'),
  });

  const renameMutation = useMutation({
    mutationFn: ({ contentId, name }: { contentId: number; name: string }) =>
      contentApi.updateContent(contentId, name),
    onSuccess: () => {
      message.success('名称已更新');
      setRenamingContentId(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.exhibitContent(exhibitId) });
      queryClient.invalidateQueries({ queryKey: ['contents'] });
    },
    onError: () => message.error('重命名失败'),
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

  const handleFileSelect = () => fileInputRef.current?.click();

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
      // 演出时间线 ActionLibrary MediaTab 用 ['contents', params]，需广义前缀失活
      queryClient.invalidateQueries({ queryKey: ['contents'] });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '上传失败';
      setUploadTasks((prev) => prev.map((t, i) => i === index ? { ...t, status: 'error', error: errMsg } : t));
      message.error(`${task.file.name}: ${errMsg}`);
    }
  };

  const hasActiveUpload = uploadTasks.some((t) => t.status === 'uploading' || t.status === 'completing');

  const renderFileRow = (item: ExhibitContentItem) => {
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
      <div key={item.content_id} className={styles.fileRow}>
        <div className={styles.fileRowInner}>
          {/* 缩略图 */}
          <div className={styles.thumbWrap}>
            {item.thumbnail_url ? (
              <Image
                src={item.thumbnail_url}
                width={64}
                height={36}
                className={styles.thumbImg}
                fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iMzYiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjM2IiBmaWxsPSIjZjBmMGYwIi8+PC9zdmc+"
                preview={{ mask: false }}
              />
            ) : (
              <div className={styles.thumbPlaceholder}>
                <FileImageOutlined />
              </div>
            )}
          </div>

          {/* 文件信息 — 双行 */}
          <div className={styles.fileInfo}>
            <div className={styles.fileNameRow}>{renderFilename()}</div>
            <div className={styles.fileMetaRow}>
              <span>{formatFileSize(item.file_size)}</span>
              {item.duration_ms > 0 && <span>{formatDuration(item.duration_ms)}</span>}
              {item.has_audio && <SoundOutlined className={styles.fileSoundIcon} />}
              <span className={styles.fileVersion}>
                {typeof item.version === 'string' && item.version.startsWith('v') ? item.version : `v${item.version}`}
              </span>
              <StatusTag status={item.status} />
            </div>
          </div>

          {/* 水印开关 */}
          <Tooltip title={item.is_watermarked ? '已标记为水印文件' : '标记为水印文件'}>
            <Switch
              size="small"
              checked={item.is_watermarked}
              loading={watermarkMutation.isPending}
              onChange={(checked) => watermarkMutation.mutate({ contentId: item.content_id, is_watermarked: checked })}
              disabled={!canManage}
            />
          </Tooltip>

          {canManage && (
            <RiskyActionButton
              action="content.delete"
              type="text"
              danger
              size="small"
              icon={<DeleteOutlined />}
              confirmTitle="删除此文件"
              confirmContent="删除后 OSS 文件和关联标签将一并清除。请填写操作原因（≥ 5 字，审计用）。"
              onConfirm={async (reason) => {
                await deleteMutation.mutateAsync({ contentId: item.content_id, reason });
              }}
            />
          )}
        </div>

        {showPipeline && (
          <div className={styles.pipelineSlot}>
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
      <div className={styles.glassToolbar}>
        {canManage && (
          <Button type="primary" icon={<UploadOutlined />} onClick={handleFileSelect} loading={hasActiveUpload}>
            上传文件
          </Button>
        )}
        <div className={styles.toolbarDivider} />
        <div className={styles.toolbarAiTag}>
          <Tooltip title="关闭后，新上传的视频将不再自动生成 AI 标签">
            <span className={styles.toolbarAiTagLabel}>AI 自动打标</span>
          </Tooltip>
          <Switch
            checked={exhibit.enable_ai_tag}
            loading={aiTagMutation.isPending}
            onChange={(checked) => aiTagMutation.mutate(checked)}
            disabled={!canManage}
          />
        </div>
        <span className={styles.toolbarSummary}>
          共 {items.length} 个文件{items.length > 0 && ` · 总计 ${formatFileSize(
            items.reduce((sum, it) => sum + (it.file_size || 0), 0)
          )}`}
        </span>
        <input ref={fileInputRef} type="file" style={{ display: 'none' }} multiple onChange={handleFilesChosen} />
      </div>

      {/* 上传进度 */}
      {uploadTasks.length > 0 && (
        <div className={styles.uploadPanel}>
          <div className={styles.uploadPanelTitle}>上传进度</div>
          {uploadTasks.map((task, i) => (
            <div key={i} className={styles.uploadPanelRow}>
              <Space>
                <span>{task.file.name}</span>
                <span className={styles.uploadPanelMuted}>({formatFileSize(task.file.size)})</span>
                {task.status === 'uploading' && <span className={styles.uploadPanelAccent}>{task.progress}%</span>}
                {task.status === 'completing' && <span className={styles.uploadPanelAccent}>通知后端...</span>}
                {task.status === 'done' && <span className={styles.uploadPanelSuccess}>完成</span>}
                {task.status === 'error' && <span className={styles.uploadPanelError}>{task.error}</span>}
              </Space>
            </div>
          ))}
        </div>
      )}

      {/* 列表 */}
      {items.length === 0 ? (
        <div className={styles.emptyState}>暂无内容文件，请上传</div>
      ) : (
        <Card styles={{ body: { padding: 8 } }}>
          {items.map((item) => renderFileRow(item))}
        </Card>
      )}
    </div>
  );
}
