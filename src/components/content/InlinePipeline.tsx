import { Steps } from 'antd';
import type { PipelineStage } from '@/types/content';

interface InlinePipelineProps {
  stages: PipelineStage[];
  overallProgress: number;
  etaSeconds?: number;
  uploadStatus?: 'pending' | 'uploading' | 'done' | 'error';
  uploadProgress?: number;
  uploadElapsedSec?: number;
}

const STAGE_LABELS: Record<string, string> = {
  upload: '上传',
  encrypt: '加密',
  thumbnail: '缩略图',
  ai_tag: 'AI 标签',
  publish: '发版',
  cleanup: '清理',
  notify: '通知',
};

const STAGE_ICONS: Record<string, string> = {
  upload: 'cloud_upload',
  encrypt: 'lock',
  thumbnail: 'image',
  ai_tag: 'smart_toy',
  publish: 'publish',
  cleanup: 'delete_sweep',
  notify: 'notifications_active',
};

function stageToStepStatus(status: string): 'wait' | 'process' | 'finish' | 'error' {
  switch (status) {
    case 'completed': return 'finish';
    case 'running': return 'process';
    case 'failed': return 'error';
    case 'skipped': return 'finish';
    default: return 'wait';
  }
}

function uploadToStepStatus(status?: string): 'wait' | 'process' | 'finish' | 'error' {
  switch (status) {
    case 'done': return 'finish';
    case 'uploading': return 'process';
    case 'error': return 'error';
    default: return 'wait';
  }
}

function formatElapsed(sec?: number): string {
  if (!sec || sec <= 0) return '';
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m${sec % 60}s`;
}

export default function InlinePipeline({
  stages,
  uploadStatus,
  uploadProgress,
  uploadElapsedSec,
}: InlinePipelineProps) {
  // Build upload step
  const uploadStep = {
    title: STAGE_LABELS.upload,
    status: uploadToStepStatus(uploadStatus),
    description: (() => {
      if (uploadStatus === 'uploading') {
        const parts: string[] = [];
        if (uploadProgress !== undefined) parts.push(`${uploadProgress}%`);
        if (uploadElapsedSec !== undefined && uploadElapsedSec > 0) parts.push(formatElapsed(uploadElapsedSec));
        return parts.length > 0 ? <span style={{ fontSize: 11 }}>{parts.join(' ')}</span> : undefined;
      }
      if (uploadStatus === 'done') return <span style={{ fontSize: 11 }}>完成</span>;
      if (uploadStatus === 'error') return <span style={{ fontSize: 11, color: 'var(--ant-color-error)' }}>失败</span>;
      return undefined;
    })(),
    icon: (
      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
        {STAGE_ICONS.upload}
      </span>
    ),
  };

  // Build backend stage steps
  const backendSteps = stages.map((stage) => ({
    title: STAGE_LABELS[stage.name] || stage.name,
    status: stageToStepStatus(stage.status),
    description: (() => {
      if (stage.status === 'running') {
        const parts: string[] = [];
        if (stage.progress !== undefined && stage.progress > 0) parts.push(`${stage.progress}%`);
        if (stage.duration_seconds !== undefined && stage.duration_seconds > 0) parts.push(`${formatElapsed(stage.duration_seconds)}`);
        return parts.length > 0 ? <span style={{ fontSize: 11 }}>{parts.join(' ')}</span> : undefined;
      }
      if (stage.status === 'completed' && stage.duration_seconds !== undefined) {
        return <span style={{ fontSize: 11 }}>{formatElapsed(stage.duration_seconds)}</span>;
      }
      if (stage.status === 'failed' && stage.error) {
        return <span style={{ fontSize: 11, color: 'var(--ant-color-error)' }}>{stage.error}</span>;
      }
      if (stage.status === 'skipped') {
        return <span style={{ fontSize: 11, color: 'var(--ant-color-text-quaternary)' }}>跳过</span>;
      }
      return undefined;
    })(),
    icon: (
      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
        {STAGE_ICONS[stage.name] || 'pending'}
      </span>
    ),
  }));

  const allSteps = [uploadStep, ...backendSteps];
  const currentIdx = allSteps.findIndex((s) => s.status === 'process');

  return (
    <Steps
      size="small"
      current={currentIdx >= 0 ? currentIdx : allSteps.length}
      items={allSteps}
      style={{ marginTop: 4 }}
    />
  );
}
