/**
 * ReleasePublishModal —— app-upgrade-strategy Phase 4 平台发布对话框。
 *
 * 三块新能力（mockup 07-ui/mockup/ux-overhaul-2026-04-30/05-release-publish.html）：
 *   1. Markdown release notes 分屏编辑/预览（react-markdown + remark-gfm；前端 hard limit 50KB）
 *   2. is_critical 红色 Switch + 警示文案（越权 production，不能越权 paused）
 *   3. 灰度 Radio 4 档（10% / 50% / 100% / 自定义）+ 投放优先级 + 实时预览矩阵
 *
 * 实时预览矩阵：调 GET /halls 按 operation_mode 分组渲染 chip，
 * 紫色高亮 = 纳入本次灰度。优先级默认 commissioning > maintenance > production > paused（永远跳过）。
 */
import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Modal, Form, Input, Select, Radio, Switch, Tag, Button, Progress, Space,
  Alert,
} from 'antd';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import type { HallListItem, OperationMode } from '@/api/gen/client';
import styles from './ReleasePublishModal.module.scss';

const PLATFORMS = [
  { value: 'win-x64', label: 'Windows (x64)' },
  { value: 'osx-arm64', label: 'macOS (Apple Silicon)' },
  { value: 'osx-x64', label: 'macOS (Intel)' },
  { value: 'linux-x64', label: 'Linux (x64)' },
];

// 投放优先级（mockup §1）：commissioning → maintenance → production；paused 永远跳过
const OP_MODE_PRIORITY: Record<OperationMode, number> = {
  commissioning: 0,
  maintenance: 1,
  production: 2,
  paused: 99, // 永远跳过
};

const OP_MODE_LABEL: Record<OperationMode, string> = {
  commissioning: '调试期',
  production: '正式运营',
  maintenance: '检修期',
  paused: '暂停',
};

const OP_MODE_TAG_COLOR: Record<OperationMode, string> = {
  commissioning: 'blue',
  production: 'green',
  maintenance: 'gold',
  paused: 'default',
};

const OP_MODE_EFFECT_TAG: Record<OperationMode, { label: string; color: string }> = {
  commissioning: { label: 'B 倒计时 → 立即升级', color: 'green' },
  maintenance: { label: 'B 倒计时 → 立即升级', color: 'green' },
  production: { label: 'A 待确认 → 用户决策', color: 'gold' },
  paused: { label: '完全跳过', color: 'default' },
};

// release_notes_md 限长 50KB（前后端双闸；后端超长返 400）
const MAX_RELEASE_NOTES_MD_BYTES = 50 * 1024;

// 文件校验
const MAX_FILE_SIZE = 500 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.zip', '.dmg', '.pkg', '.exe', '.msi', '.msix'];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function utf8ByteLen(s: string): number {
  return new Blob([s]).size;
}

type RolloutPolicy = 'all' | 'percent' | 'custom';
type PercentChoice = 10 | 50 | 100;

export interface ReleasePayloadInput {
  platform: string;
  arch: string;
  version: string;
  oss_key: string;
  file_size: number;
  sha256: string;
  release_notes: string;
  release_notes_md: string;
  is_critical: boolean;
  rollout_policy: RolloutPolicy;
  rollout_percent?: number;
  rollout_hall_ids?: number[];
  reason: string;
}

interface ReleasePublishModalProps {
  open: boolean;
  uploading: boolean;
  uploadProgress: number;
  onCancel: () => void;
  onSubmit: (payload: ReleasePayloadInput, file: File) => Promise<void>;
}

export default function ReleasePublishModal({
  open, uploading, uploadProgress, onCancel, onSubmit,
}: ReleasePublishModalProps) {
  const [form] = Form.useForm();

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string>('');
  const [notesMd, setNotesMd] = useState<string>('');
  const [notesMdError, setNotesMdError] = useState<string>('');
  const [isCritical, setIsCritical] = useState(false);
  const [policy, setPolicy] = useState<RolloutPolicy>('all');
  const [percent, setPercent] = useState<PercentChoice>(50);
  const [customHallIds, setCustomHallIds] = useState<number[]>([]);

  // 关闭时复位本地 state（form 由 destroyOnClose 自动清；此处仅清非 form 字段）
  useEffect(() => {
    if (!open) {
      setFile(null);
      setFileError('');
      setNotesMd('');
      setNotesMdError('');
      setIsCritical(false);
      setPolicy('all');
      setPercent(50);
      setCustomHallIds([]);
    }
  }, [open]);

  // 拉展厅列表（无 include_op_mode 参数；list 端点已默认带 operation_mode 字段）
  const { data: halls = [] } = useQuery({
    queryKey: queryKeys.halls({ page: 1, page_size: 200 }),
    queryFn: () => hallApi.getHalls({ page: 1, page_size: 200 }),
    select: (res) => res.data.data?.list ?? [],
    enabled: open,
  });

  // 按 operation_mode 分组（保持 priority 顺序）
  const grouped = useMemo(() => {
    const map = new Map<OperationMode, HallListItem[]>([
      ['commissioning', []],
      ['maintenance', []],
      ['production', []],
      ['paused', []],
    ]);
    for (const h of halls) {
      const mode = (h.operation_mode ?? 'production') as OperationMode;
      map.get(mode)!.push(h);
    }
    return map;
  }, [halls]);

  // 候选优先级排序：commissioning → maintenance → production；paused 不参与
  const prioritized = useMemo(() => {
    return [...halls]
      .filter((h) => (h.operation_mode ?? 'production') !== 'paused')
      .sort((a, b) => {
        const am = (a.operation_mode ?? 'production') as OperationMode;
        const bm = (b.operation_mode ?? 'production') as OperationMode;
        const dp = OP_MODE_PRIORITY[am] - OP_MODE_PRIORITY[bm];
        if (dp !== 0) return dp;
        return a.id - b.id;
      });
  }, [halls]);

  // 实时计算本次纳入灰度的 hall_id 集合
  const rolloutHallIdSet = useMemo<Set<number>>(() => {
    if (policy === 'all') {
      return new Set(prioritized.map((h) => h.id));
    }
    if (policy === 'custom') {
      return new Set(customHallIds);
    }
    // percent
    const total = prioritized.length;
    const take = percent >= 100 ? total : Math.max(1, Math.ceil((percent / 100) * total));
    return new Set(prioritized.slice(0, take).map((h) => h.id));
  }, [policy, percent, customHallIds, prioritized]);

  // 总计
  const totalRollout = rolloutHallIdSet.size;

  // 按钮文案
  const submitLabel = useMemo(() => {
    if (policy === 'all') return '发布到全量（100%）';
    if (policy === 'percent') return `发布到灰度（${percent}%）`;
    return `发布到灰度（自定义 ${customHallIds.length} 展厅）`;
  }, [policy, percent, customHallIds.length]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (!f) { setFileError(''); return; }
    if (f.size > MAX_FILE_SIZE) {
      setFileError(`文件 ${formatFileSize(f.size)} 超过限制（最大 500 MB）`);
      return;
    }
    const ext = '.' + (f.name.split('.').pop()?.toLowerCase() ?? '');
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setFileError(`不支持的文件类型 ${ext}，允许：${ALLOWED_EXTENSIONS.join(', ')}`);
      return;
    }
    setFileError('');
  };

  const handleNotesMdChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setNotesMd(v);
    const bytes = utf8ByteLen(v);
    if (bytes > MAX_RELEASE_NOTES_MD_BYTES) {
      setNotesMdError(`Markdown release notes 当前 ${(bytes / 1024).toFixed(1)} KB，超出 50KB 限制（后端将拒绝）`);
    } else {
      setNotesMdError('');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (!file) { setFileError('请选择安装包'); return; }
      if (fileError) return;
      if (notesMdError) return;

      if (policy === 'custom' && customHallIds.length === 0) {
        return; // 自定义模式必须至少选一个展厅
      }

      const payload: ReleasePayloadInput = {
        platform: values.platform,
        arch: values.platform.split('-').pop() || 'x64',
        version: values.version,
        oss_key: '', // 由 onSubmit 上传后填
        file_size: file.size,
        sha256: '', // 由 onSubmit 上传后计算
        release_notes: values.release_notes ?? '',
        release_notes_md: notesMd,
        is_critical: isCritical,
        rollout_policy: policy,
        ...(policy === 'percent' ? { rollout_percent: percent } : {}),
        ...(policy === 'custom' ? { rollout_hall_ids: customHallIds } : {}),
        reason: values.reason,
      };
      await onSubmit(payload, file);
    } catch {
      // form.validateFields 会自动展示错误
    }
  };

  const notesMdBytes = utf8ByteLen(notesMd);

  return (
    <Modal
      title="发布新版本 · ExCS 展厅 App"
      open={open}
      width={880}
      onCancel={onCancel}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={onCancel} disabled={uploading}>取消</Button>
          <Button
            type="primary"
            danger={isCritical}
            loading={uploading}
            disabled={!!fileError || !!notesMdError || (policy === 'custom' && customHallIds.length === 0)}
            onClick={() => {
              if (isCritical) {
                Modal.confirm({
                  title: '紧急补丁二次确认',
                  content: (
                    <div>
                      <p><strong>is_critical = true</strong> 将<strong>越权所有 production 展厅</strong>的用户确认对话框与非营业时段限制，强制立即升级。</p>
                      <p>仅限<strong>关键安全补丁</strong>或 <strong>P0 故障</strong>使用；后端会再校验当前账号是否拥有 <code>release.publish_critical</code> 权限（super_admin 默认拥有）。</p>
                      <p>请确认现在确实需要紧急补丁。</p>
                    </div>
                  ),
                  okText: '确认发布紧急补丁',
                  okButtonProps: { danger: true },
                  cancelText: '取消',
                  onOk: handleSubmit,
                });
              } else {
                handleSubmit();
              }
            }}
          >
            {submitLabel}
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical">
        {/* Section 1: 基本信息 */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}><span className={styles.num}>1</span>基本信息</div>

          <div className={styles.formRow}>
            <Form.Item
              name="version"
              label="版本号"
              rules={[
                { required: true, message: '请输入版本号' },
                { pattern: /^\d+\.\d+\.\d+/, message: '请输入 semver 格式版本号（如 0.5.2）' },
              ]}
              style={{ flex: 1 }}
            >
              <Input placeholder="例如 0.5.2" />
            </Form.Item>
            <Form.Item
              name="platform"
              label="平台 / 架构"
              rules={[{ required: true, message: '请选择平台' }]}
              style={{ flex: 1, marginLeft: 16 }}
            >
              <Select options={PLATFORMS} placeholder="选择平台" />
            </Form.Item>
          </div>

          <Form.Item label="安装包" required>
            <input
              type="file"
              accept={ALLOWED_EXTENSIONS.join(',')}
              onChange={handleFileChange}
            />
            {file && (
              <div className={styles.fileMeta}>
                <Tag color="blue">{file.name}</Tag>
                <span>{formatFileSize(file.size)}</span>
              </div>
            )}
            {fileError && <div className={styles.errorText}>{fileError}</div>}
          </Form.Item>
        </div>

        {/* Section 2: Markdown release notes */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}><span className={styles.num}>2</span>更新内容（Markdown）</div>

          <div className={styles.mdEditor}>
            <div className={styles.mdHeader}>
              <span>编辑（Markdown）</span>
              <span>预览（react-markdown）</span>
            </div>
            <div className={styles.mdBody}>
              <textarea
                className={styles.mdEditorPane}
                value={notesMd}
                onChange={handleNotesMdChange}
                placeholder={'## 主要修复\n\n- xxx\n\n## 性能提升\n\n- yyy'}
              />
              <div className={styles.mdPreviewPane}>
                {notesMd
                  ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{notesMd}</ReactMarkdown>
                  : <span className={styles.mdEmpty}>预览将在这里显示…</span>}
              </div>
            </div>
            <div className={styles.mdFooter}>
              <span className={notesMdBytes > MAX_RELEASE_NOTES_MD_BYTES ? styles.errorText : styles.helpText}>
                {(notesMdBytes / 1024).toFixed(1)} KB / 50 KB
              </span>
              <span className={styles.helpText}>
                展厅 App 用 Markdig 渲染，<strong>不支持 raw HTML / 脚本</strong>（XSS 安全）
              </span>
            </div>
            {notesMdError && <div className={styles.errorText}>{notesMdError}</div>}
          </div>

          <Form.Item name="release_notes" label="老版纯文本说明（向后兼容，可选）" style={{ marginTop: 12 }}>
            <Input.TextArea rows={2} placeholder="App 端老版本（< 0.8.2）渲染此字段；新版本读 release_notes_md" />
          </Form.Item>
        </div>

        {/* Section 3: 发布策略 */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}><span className={styles.num}>3</span>发布策略</div>

          <div className={`${styles.criticalRow} ${isCritical ? styles.criticalOn : ''}`}>
            <span className={styles.criticalIcon}>⚠</span>
            <div className={styles.criticalInfo}>
              <div className={styles.criticalTitle}>紧急补丁（is_critical = true）</div>
              <div className={styles.criticalDesc}>
                开启后<strong>越权 production 模式</strong>立即升级——绕过 A 待确认对话框、绕过非营业时段限制。
                <strong>不能越权 paused</strong>（暂停态展厅永远跳过）。仅限<strong>关键安全补丁</strong>或 <strong>P0 故障</strong>使用；后端会校验 <code>release.publish_critical</code>。
              </div>
            </div>
            <Switch
              checked={isCritical}
              onChange={setIsCritical}
              checkedChildren="开"
              unCheckedChildren="关"
            />
          </div>

          <Form.Item label="灰度比例" style={{ marginTop: 16 }}>
            <Radio.Group
              value={policy === 'all' ? 100 : policy === 'percent' ? percent : 'custom'}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'custom') { setPolicy('custom'); return; }
                if (v === 100) { setPolicy('all'); return; }
                setPolicy('percent');
                setPercent(v as PercentChoice);
              }}
              optionType="button"
              buttonStyle="solid"
            >
              <Radio.Button value={10}>10%</Radio.Button>
              <Radio.Button value={50}>50%</Radio.Button>
              <Radio.Button value={100}>100% 全量</Radio.Button>
              <Radio.Button value="custom">自定义</Radio.Button>
            </Radio.Group>
            <div className={styles.helpText} style={{ marginTop: 6 }}>
              从一小批展厅开始投放；24h 内无故障告警自动晋级到下一档（晋级巡检 cron 待 Phase 5 实现）。
            </div>
          </Form.Item>

          {policy === 'custom' && (
            <Form.Item label="自定义展厅列表" required>
              <Select
                mode="multiple"
                placeholder="选择展厅（不含 paused）"
                value={customHallIds}
                onChange={setCustomHallIds}
                options={prioritized.map((h) => ({ value: h.id, label: `#${h.id} ${h.name}` }))}
                style={{ width: '100%' }}
              />
              {customHallIds.length === 0 && (
                <div className={styles.errorText}>请至少选择一个展厅</div>
              )}
            </Form.Item>
          )}

          <Form.Item label="投放优先级">
            <Tag color="purple">commissioning</Tag>→
            <Tag color="gold">maintenance</Tag>→
            <Tag color="green">production</Tag>
            <span className={styles.helpText} style={{ marginLeft: 8 }}>paused 永远跳过</span>
          </Form.Item>

          {/* 实时预览矩阵 */}
          <div className={styles.matrix}>
            <div className={styles.matrixHead}>
              <span>实时预览 · 本次灰度将影响哪些展厅</span>
              <span className={styles.matrixSummary}>
                {totalRollout} / {halls.length} 个展厅纳入
              </span>
            </div>
            {(['commissioning', 'maintenance', 'production', 'paused'] as OperationMode[]).map((mode) => {
              const list = grouped.get(mode) ?? [];
              if (list.length === 0) return null;
              const inRollout = list.filter((h) => rolloutHallIdSet.has(h.id)).length;
              const effect = OP_MODE_EFFECT_TAG[mode];
              return (
                <div key={mode} className={styles.matrixGroup}>
                  <div className={styles.matrixGroupHead}>
                    <Tag color={OP_MODE_TAG_COLOR[mode]}>{OP_MODE_LABEL[mode]}</Tag>
                    <span className={styles.helpText}>
                      {mode === 'paused'
                        ? `${list.length} 个展厅 · 不纳入灰度`
                        : `${inRollout} / ${list.length} 个展厅纳入灰度`}
                    </span>
                    <span style={{ marginLeft: 'auto' }}>
                      <Tag color={effect.color}>{effect.label}</Tag>
                    </span>
                  </div>
                  <div className={styles.matrixHalls}>
                    {list.map((h) => {
                      const on = rolloutHallIdSet.has(h.id);
                      return (
                        <span
                          key={h.id}
                          className={`${styles.hallChip} ${on ? styles.hallChipOn : ''}`}
                        >
                          <span className={styles.hallChipId}>#{h.id}</span>
                          <span>{h.name}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {isCritical && (
            <Alert
              type="error"
              showIcon
              style={{ marginTop: 12 }}
              title="紧急补丁会越权所有 production 展厅立即升级；如非 P0 故障请关闭 is_critical。"
            />
          )}
        </div>

        {/* Section 4: 审计原因 */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}><span className={styles.num}>4</span>审计原因</div>
          <Form.Item
            name="reason"
            label="操作原因"
            rules={[
              { required: true, message: '请填写操作原因（审计用）' },
              { min: 5, message: '操作原因至少 5 字' },
            ]}
            help="release.manage 是高风险操作，原因将记入审计日志（≥ 5 字）"
          >
            <Input.TextArea rows={2} maxLength={500} showCount placeholder="例如：发布 win-x64 v0.5.2 修复设备心跳偶发丢失" />
          </Form.Item>
        </div>

        {uploading && <Progress percent={uploadProgress} />}
      </Form>
    </Modal>
  );
}
