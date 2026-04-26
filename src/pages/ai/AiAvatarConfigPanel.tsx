import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card, Form, Input, InputNumber, Switch, Button, Space, Spin,
  Select, Slider, Tabs, Checkbox, Collapse, Popover, Upload, Table, Tag,
  Segmented, Alert,
} from 'antd';
import { useMessage } from '@/hooks/useMessage';
import {
  SoundOutlined, DeleteOutlined, UploadOutlined, SettingOutlined,
  LoadingOutlined, PauseCircleOutlined,
} from '@ant-design/icons';
import { aiApi } from '@/api/ai';
import { queryKeys } from '@/api/queryKeys';
import type {
  AiAvatarBody, AiToolName, TagSearchConfig,
  VoiceItem, KnowledgeFile, VideoType, LayoutConfig, HotwordExtensions,
} from '@/api/gen/client';
import AvatarSpritePreview from '@/components/ai/AvatarSpritePreview';
import ChatSimulator from '@/components/ai/ChatSimulator';
import WhiteboardLayoutEditor, {
  DEFAULT_LAYOUT_CONFIG, LayoutPreview,
} from '@/components/ai/WhiteboardLayoutEditor';
import HotwordExtensionsEditor from '@/components/ai/HotwordExtensionsEditor';
import styles from './AiAvatarConfigPanel.module.scss';

interface AiAvatarConfigPanelProps {
  exhibitId: number;
  hallId: number;
}

const ALL_TOOLS: { key: AiToolName; label: string; hint?: string }[] = [
  { key: 'switch_scene', label: '场景切换' },
  { key: 'control_exhibit', label: '展项控制' },
  { key: 'search_by_tag', label: '标签搜索', hint: '白板 v1.1 拆分自 play_by_tag' },
  { key: 'play_media', label: '白板媒体播放' },
  { key: 'media_control', label: '媒体控制' },
  { key: 'trigger_show', label: '演出触发' },
  { key: 'control_device', label: '设备控制' },
];

const DEFAULT_TOOL_KEYS: AiToolName[] = [
  'switch_scene', 'control_exhibit', 'search_by_tag',
  'play_media', 'media_control', 'trigger_show', 'control_device',
];

const DEFAULT_TAG_CONFIG: TagSearchConfig = {
  segment_duration_ms: 10000,
  transition_type: 'fade',
  search_scope: 'exhibit',
  max_segments: 5,
  min_confidence: 0.5,
};


function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

const FILE_STATUS_MAP: Record<string, { color: string; label: string }> = {
  uploaded: { color: 'default', label: '已上传' },
  processing: { color: 'processing', label: '解析中' },
  ready: { color: 'success', label: '已解析' },
  failed: { color: 'error', label: '解析失败' },
};

export default function AiAvatarConfigPanel({ exhibitId, hallId }: AiAvatarConfigPanelProps) {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();

  // ─── Avatar preview state (controlled by chat simulator) ───
  const [avatarState, setAvatarState] = useState<VideoType>('idle');

  // ─── Audio playback state ───
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // ─── Tag search config (managed outside form for popover) ───
  const [tagConfig, setTagConfig] = useState<TagSearchConfig>(DEFAULT_TAG_CONFIG);

  // ─── Layout config (exhibit-level override, outside form for custom UI) ───
  const [layoutMode, setLayoutMode] = useState<'template' | 'override'>('template');
  const [layoutOverride, setLayoutOverride] = useState<LayoutConfig>(DEFAULT_LAYOUT_CONFIG);

  // ─── Hotword extensions (outside form) ───
  const [hotwordExt, setHotwordExt] = useState<HotwordExtensions>({});

  // ─── Knowledge file upload state ───
  const [uploading, setUploading] = useState(false);

  // ─── Fetch avatar detail ───
  const { data: avatarDetail, isLoading, isError } = useQuery({
    queryKey: queryKeys.aiAvatarDetail(exhibitId),
    queryFn: () => aiApi.getAvatar(exhibitId, { skipErrorMessage: true }),
    select: (res) => res.data.data,
    retry: false,
  });

  // ─── Fetch template list ───
  const { data: templates } = useQuery({
    queryKey: queryKeys.aiTemplates,
    queryFn: () => aiApi.listTemplates(),
    select: (res) => res.data.data.list,
  });

  // ─── Fetch voice list ───
  const { data: voices } = useQuery({
    queryKey: queryKeys.aiVoices,
    queryFn: () => aiApi.listVoices(),
    select: (res) => res.data.data.list,
  });

  // ─── Fetch knowledge files ───
  const { data: knowledgeFiles } = useQuery({
    queryKey: queryKeys.aiKnowledgeFiles({ exhibit_id: exhibitId, hall_id: hallId }),
    queryFn: () => aiApi.listKnowledgeFiles({ exhibit_id: exhibitId, hall_id: hallId }),
    select: (res) => res.data.data.list,
    refetchInterval: (query) => {
      const list = query.state.data?.data?.data?.list;
      if (list?.some((f: KnowledgeFile) => f.status === 'processing' || f.status === 'uploaded')) {
        return 3000;
      }
      return false;
    },
  });

  // ─── Selected template detail for thumbnail ───
  const selectedTemplateId = Form.useWatch('template_id', form);
  const selectedTemplate = templates?.find((t) => t.id === selectedTemplateId);

  // ─── Template detail (for sprite sheets in preview) ───
  const { data: templateDetail } = useQuery({
    queryKey: queryKeys.aiTemplateDetail(selectedTemplateId!),
    queryFn: () => aiApi.getTemplate(selectedTemplateId!),
    select: (res) => res.data.data,
    enabled: !!selectedTemplateId && selectedTemplateId > 0,
  });

  // ─── Populate form when data arrives ───
  useEffect(() => {
    if (avatarDetail) {
      // Auto-expand legacy play_by_tag → new tool set (server also handles but UI should show consistent)
      const tools = (avatarDetail.tools_enabled ?? DEFAULT_TOOL_KEYS).flatMap((t) =>
        t === 'play_by_tag' ? ['search_by_tag', 'play_media', 'media_control'] as AiToolName[] : [t],
      );
      form.setFieldsValue({
        template_id: avatarDetail.template_id,
        voice_id: avatarDetail.config?.voice_id ?? undefined,
        speech_rate: avatarDetail.config?.speech_rate ?? 1.0,
        persona_text: avatarDetail.persona_text ?? '',
        knowledge_text: avatarDetail.knowledge_text ?? '',
        greeting_message: avatarDetail.greeting_message ?? '',
        tools_enabled: Array.from(new Set(tools)),
        visitor_input_enabled: avatarDetail.visitor_input_enabled,
        temperature: avatarDetail.conversation_config?.temperature ?? 0.7,
        max_tokens: avatarDetail.conversation_config?.max_tokens ?? 500,
        tts_preview_text: '欢迎来到展厅，我是您的 AI 讲解员。',
        image_display_ms: avatarDetail.image_display_ms ?? 10000,
        image_per_slide_ms: avatarDetail.image_per_slide_ms ?? 5000,
        hotword_enabled: avatarDetail.hotword_enabled ?? true,
      });
      setTagConfig(avatarDetail.tag_search_config ?? DEFAULT_TAG_CONFIG);
      // Layout
      if (avatarDetail.layout_config_override) {
        setLayoutMode('override');
        setLayoutOverride(avatarDetail.layout_config_override);
      } else {
        setLayoutMode('template');
        setLayoutOverride(
          avatarDetail.layout_config_effective
          ?? avatarDetail.template_default_layout_config
          ?? DEFAULT_LAYOUT_CONFIG,
        );
      }
      setHotwordExt(avatarDetail.hotword_extensions ?? {});
    } else if (isError) {
      form.resetFields();
      setTagConfig(DEFAULT_TAG_CONFIG);
      setLayoutMode('template');
      setLayoutOverride(DEFAULT_LAYOUT_CONFIG);
      setHotwordExt({});
    }
  }, [avatarDetail, isError, form]);

  // Reset form when exhibitId changes
  useEffect(() => {
    form.resetFields();
    setTagConfig(DEFAULT_TAG_CONFIG);
    setLayoutMode('template');
    setLayoutOverride(DEFAULT_LAYOUT_CONFIG);
    setHotwordExt({});
  }, [exhibitId, form]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // ─── Save mutation ───
  const updateMutation = useMutation({
    mutationFn: (data: AiAvatarBody) => aiApi.updateAvatar(exhibitId, data),
    onSuccess: () => {
      message.success('数字人配置已保存');
      queryClient.invalidateQueries({ queryKey: ['ai'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.exhibits(hallId) });
    },
  });

  // ─── TTS synthesize mutation ───
  const ttsMutation = useMutation({
    mutationFn: () => {
      const voiceId = form.getFieldValue('voice_id');
      const speechRate = form.getFieldValue('speech_rate') ?? 1.0;
      const text = form.getFieldValue('tts_preview_text') || '欢迎来到展厅，我是您的 AI 讲解员。';
      if (!voiceId) {
        return Promise.reject(new Error('请先选择声音'));
      }
      return aiApi.synthesizeSpeech({ text, voice_id: voiceId, speech_rate: speechRate });
    },
    onSuccess: (res) => {
      const { audio_url } = res.data.data;
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(audio_url);
      audioRef.current = audio;
      audio.onplay = () => setIsPlaying(true);
      audio.onended = () => setIsPlaying(false);
      audio.onerror = () => {
        setIsPlaying(false);
        message.error('音频播放失败');
      };
      audio.play();
    },
    onError: (err) => {
      message.error(err instanceof Error ? err.message : '试听失败');
    },
  });

  // ─── Knowledge file delete mutation ───
  const deleteFileMutation = useMutation({
    mutationFn: (fileId: number) => aiApi.deleteKnowledgeFile(fileId),
    onSuccess: () => {
      message.success('文件已删除');
      queryClient.invalidateQueries({ queryKey: queryKeys.aiKnowledgeFiles({ exhibit_id: exhibitId }) });
    },
  });

  // ─── Knowledge file upload ───
  const handleKnowledgeUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      // 1. Get presigned URL
      const urlRes = await aiApi.getKnowledgeUploadURL({
        hall_id: hallId,
        exhibit_id: exhibitId,
        filename: file.name,
        file_size: file.size,
        content_type: file.type || 'application/octet-stream',
      });
      const { file_id, presigned_url } = urlRes.data.data;

      // 2. Upload to OSS
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`上传失败 (${xhr.status})`));
        });
        xhr.addEventListener('error', () => reject(new Error('网络错误')));
        xhr.open('PUT', presigned_url);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.send(file);
      });

      // 3. Notify completion
      await aiApi.completeKnowledgeUpload(file_id);
      message.success(`${file.name} 上传成功，正在解析...`);
      queryClient.invalidateQueries({ queryKey: queryKeys.aiKnowledgeFiles({ exhibit_id: exhibitId }) });
    } catch (err) {
      message.error(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
    }
  }, [exhibitId, hallId, queryClient]);

  // ─── Save handler ───
  const handleSave = () => {
    form.validateFields().then((values) => {
      const body: AiAvatarBody = {
        template_id: values.template_id || null,
        persona_text: values.persona_text || '',
        knowledge_text: values.knowledge_text || '',
        greeting_message: values.greeting_message || '',
        tools_enabled: values.tools_enabled ?? [],
        tag_search_config: tagConfig,
        conversation_config: {
          temperature: values.temperature ?? 0.7,
          max_tokens: values.max_tokens ?? 500,
        },
        visitor_input_enabled: values.visitor_input_enabled ?? false,
        config: {
          voice_id: values.voice_id || undefined,
          speech_rate: values.speech_rate || undefined,
        },
        // Whiteboard v1.1
        layout_config: layoutMode === 'override' ? layoutOverride : null,
        image_display_ms: values.image_display_ms ?? 10000,
        image_per_slide_ms: values.image_per_slide_ms ?? 5000,
        hotword_enabled: values.hotword_enabled ?? true,
        hotword_extensions: hotwordExt,
      };
      updateMutation.mutate(body);
    });
  };

  // ─── Stop audio helper ───
  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin tip="加载配置..." />
      </div>
    );
  }

  // ─── Tag search config popover content ───
  const tagConfigContent = (
    <div style={{ width: 300 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ marginBottom: 4, fontSize: 13 }}>片段时长 (秒)</div>
        <Slider
          min={5} max={30} step={1}
          value={tagConfig.segment_duration_ms / 1000}
          onChange={(v) => setTagConfig((c) => ({ ...c, segment_duration_ms: v * 1000 }))}
          marks={{ 5: '5', 10: '10', 20: '20', 30: '30' }}
        />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ marginBottom: 4, fontSize: 13 }}>过渡方式</div>
        <Select
          value={tagConfig.transition_type}
          onChange={(v) => setTagConfig((c) => ({ ...c, transition_type: v }))}
          style={{ width: '100%' }}
          options={[
            { value: 'fade', label: '淡入淡出' },
            { value: 'cut', label: '直切' },
          ]}
        />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ marginBottom: 4, fontSize: 13 }}>搜索范围</div>
        <Select
          value={tagConfig.search_scope}
          onChange={(v) => setTagConfig((c) => ({ ...c, search_scope: v }))}
          style={{ width: '100%' }}
          options={[
            { value: 'exhibit', label: '仅本展项' },
            { value: 'hall', label: '全展厅' },
          ]}
        />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ marginBottom: 4, fontSize: 13 }}>最大片段数</div>
        <InputNumber
          min={1} max={20} value={tagConfig.max_segments}
          onChange={(v) => v && setTagConfig((c) => ({ ...c, max_segments: v }))}
          style={{ width: '100%' }}
        />
      </div>
      <div>
        <div style={{ marginBottom: 4, fontSize: 13 }}>最低置信度</div>
        <Slider
          min={0} max={1} step={0.05}
          value={tagConfig.min_confidence}
          onChange={(v) => setTagConfig((c) => ({ ...c, min_confidence: v }))}
          tooltip={{ formatter: (v) => v?.toFixed(2) }}
        />
      </div>
    </div>
  );

  const isFusionExhibit = avatarDetail?.exhibit_display_mode === 'simple_fusion';

  return (
    <div className={styles.root}>
      {/* ═══════════ Left: Config Area (50%) ═══════════ */}
      <div className={styles.left}>
        {isFusionExhibit && (
          <Alert
            type="warning"
            showIcon
            className={styles.fusionAlert}
            message="融合模式展项暂不支持 AI 互动"
            description="AI 互动依赖白板 + 数字人双区域布局，与融合模式矩阵拼接冲突。访客输入/激活均已禁用。"
          />
        )}
        <Form
          form={form}
          layout="vertical"
          disabled={isFusionExhibit}
          initialValues={{
            speech_rate: 1.0,
            visitor_input_enabled: false,
            tools_enabled: DEFAULT_TOOL_KEYS,
            temperature: 0.7,
            max_tokens: 500,
            tts_preview_text: '欢迎来到展厅，我是您的 AI 讲解员。',
            image_display_ms: 10000,
            image_per_slide_ms: 5000,
            hotword_enabled: true,
          }}
        >
          {/* ─── 形象选择 ─── */}
          <Card
            size="small"
            className={styles.glassCard}
            title={
              <Space>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>smart_toy</span>
                <span>形象选择</span>
              </Space>
            }
          >
            <Form.Item name="template_id" style={{ marginBottom: 8 }}>
              <Select
                placeholder="选择形象模板"
                allowClear
                showSearch
                optionFilterProp="label"
                options={templates
                  ?.filter((t) => t.status === 'ready')
                  .map((t) => ({
                    value: t.id,
                    label: t.name,
                  })) ?? []
                }
              />
            </Form.Item>
            {selectedTemplate && (
              <div className={styles.templatePick}>
                <div className={styles.templateThumb}>
                  {selectedTemplate.thumbnail_url ? (
                    <img src={selectedTemplate.thumbnail_url} alt={selectedTemplate.name} />
                  ) : (
                    <span className="material-symbols-outlined">smart_toy</span>
                  )}
                </div>
                <div className={styles.templateInfo}>
                  <div className={styles.templateName}>{selectedTemplate.name}</div>
                  <div className={styles.templateMeta}>
                    {selectedTemplate.status === 'ready' ? '雪碧图就绪' : selectedTemplate.status}
                    {' · '}已关联 {selectedTemplate.reference_count} 个展项
                  </div>
                </div>
              </div>
            )}
            <a
              onClick={() => window.open('#/ai-avatar-library', '_blank')}
              className={styles.templateLink}
            >
              前往形象库管理 →
            </a>
          </Card>

          {/* ─── 语音配置 ─── */}
          <Card
            size="small"
            className={styles.glassCard}
            title={
              <Space>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>record_voice_over</span>
                <span>语音配置</span>
              </Space>
            }
          >
            <Form.Item name="voice_id" label="声音" style={{ marginBottom: 12 }}>
              <Select
                placeholder="选择声音"
                allowClear
                showSearch
                optionFilterProp="label"
                options={voices?.map((v: VoiceItem) => ({
                  value: v.voice_id,
                  label: `${v.name} · ${v.gender === 'female' ? '女声' : '男声'} · ${v.style}`,
                })) ?? []}
              />
            </Form.Item>

            <Form.Item name="speech_rate" label="语速" style={{ marginBottom: 12 }}>
              <Slider
                min={0.5} max={2.0} step={0.1}
                marks={{ 0.5: '0.5', 1.0: '1.0', 1.5: '1.5', 2.0: '2.0' }}
                tooltip={{ formatter: (v) => `${v}x` }}
              />
            </Form.Item>

            <Form.Item name="tts_preview_text" label="试听文本" style={{ marginBottom: 8 }}>
              <Input.TextArea rows={2} maxLength={200} showCount placeholder="输入试听文本" />
            </Form.Item>

            <Button
              icon={isPlaying ? <PauseCircleOutlined /> : <SoundOutlined />}
              loading={ttsMutation.isPending}
              onClick={isPlaying ? stopAudio : () => ttsMutation.mutate()}
            >
              {isPlaying ? '停止' : '试听'}
            </Button>
          </Card>

          {/* ─── 知识配置 ─── */}
          <Card
            size="small"
            className={styles.glassCard}
            title={
              <Space>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>school</span>
                <span>知识配置</span>
              </Space>
            }
          >
            <Tabs
              size="small"
              items={[
                {
                  key: 'persona',
                  label: '人设',
                  children: (
                    <Form.Item name="persona_text" style={{ marginBottom: 0 }}>
                      <Input.TextArea
                        rows={6}
                        maxLength={3000}
                        showCount
                        placeholder="定义 AI 的角色身份、说话风格、行为边界..."
                      />
                    </Form.Item>
                  ),
                },
                {
                  key: 'knowledge_text',
                  label: '知识文本',
                  children: (
                    <Form.Item name="knowledge_text" style={{ marginBottom: 0 }}>
                      <Input.TextArea
                        rows={6}
                        maxLength={5000}
                        showCount
                        placeholder="数字人的背景知识..."
                      />
                    </Form.Item>
                  ),
                },
                {
                  key: 'knowledge_base',
                  label: '知识库',
                  children: (
                    <div>
                      <Table<KnowledgeFile>
                        size="small"
                        dataSource={knowledgeFiles ?? []}
                        rowKey="id"
                        pagination={false}
                        locale={{ emptyText: '暂无文件' }}
                        columns={[
                          {
                            title: '文件名',
                            dataIndex: 'filename',
                            ellipsis: true,
                            render: (name: string, record) => (
                              <Space size={4}>
                                <span style={{ fontSize: 14 }}>
                                  {record.file_type === 'pdf' ? '📄' :
                                    record.file_type === 'xlsx' || record.file_type === 'csv' ? '📊' :
                                      record.file_type === 'docx' ? '📝' : '📃'}
                                </span>
                                <span>{name}</span>
                              </Space>
                            ),
                          },
                          {
                            title: '类型',
                            dataIndex: 'file_type',
                            width: 60,
                            render: (v: string) => v?.toUpperCase(),
                          },
                          {
                            title: '大小',
                            dataIndex: 'file_size',
                            width: 80,
                            render: (v: number) => formatFileSize(v),
                          },
                          {
                            title: '状态',
                            dataIndex: 'status',
                            width: 80,
                            render: (v: string) => {
                              const s = FILE_STATUS_MAP[v] ?? { color: 'default', label: v };
                              return <Tag color={s.color}>{s.label}</Tag>;
                            },
                          },
                          {
                            title: '',
                            width: 40,
                            render: (_, record) => (
                              <Button
                                type="text"
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={() => deleteFileMutation.mutate(record.id)}
                              />
                            ),
                          },
                        ]}
                      />

                      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Upload
                          accept=".xlsx,.pdf,.docx,.txt,.csv,.md"
                          showUploadList={false}
                          beforeUpload={(file) => {
                            if (file.size > 10 * 1024 * 1024) {
                              message.warning('文件大小不能超过 10 MB');
                              return Upload.LIST_IGNORE;
                            }
                            handleKnowledgeUpload(file);
                            return Upload.LIST_IGNORE;
                          }}
                        >
                          <Button
                            icon={uploading ? <LoadingOutlined /> : <UploadOutlined />}
                            disabled={uploading}
                          >
                            上传文档
                          </Button>
                        </Upload>
                        <span style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>
                          已用 {knowledgeFiles?.length ?? 0} / 20 个文件
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ant-color-text-quaternary)', marginTop: 4 }}>
                        支持格式：.xlsx .pdf .docx .txt .csv .md，单文件 ≤ 10 MB
                      </div>
                    </div>
                  ),
                },
              ]}
            />
          </Card>

          {/* ─── 智能体能力 ─── */}
          <Card
            size="small"
            className={styles.glassCard}
            title={
              <Space>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>psychology</span>
                <span>智能体能力</span>
              </Space>
            }
          >
            <Form.Item name="tools_enabled" label="工具能力" style={{ marginBottom: 12 }}>
              <Checkbox.Group style={{ width: '100%' }}>
                <div className={styles.toolsList}>
                  {ALL_TOOLS.map((tool) => (
                    <label key={tool.key} className={styles.toolRow}>
                      <Checkbox value={tool.key}>{tool.label} ({tool.key})</Checkbox>
                      {tool.hint && (
                        <span className={styles.toolHint}>{tool.hint}</span>
                      )}
                      {tool.key === 'search_by_tag' && (
                        <Popover
                          content={tagConfigContent}
                          title="标签搜索参数"
                          trigger="click"
                          placement="right"
                        >
                          <Button type="text" size="small" icon={<SettingOutlined />} />
                        </Popover>
                      )}
                    </label>
                  ))}
                </div>
              </Checkbox.Group>
            </Form.Item>

            <Form.Item name="greeting_message" label="开场白" style={{ marginBottom: 12 }}>
              <Input.TextArea
                rows={2}
                maxLength={200}
                showCount
                placeholder="AI 激活后的第一条自动回复（留空则等待用户输入）"
              />
            </Form.Item>

            <Collapse
              size="small"
              ghost
              items={[{
                key: 'advanced',
                label: '高级设置',
                children: (
                  <div>
                    <Form.Item name="temperature" label="温度" style={{ marginBottom: 12 }}>
                      <Slider
                        min={0} max={1} step={0.05}
                        marks={{ 0: '精确', 0.5: '0.5', 1: '创造' }}
                        tooltip={{ formatter: (v) => v?.toFixed(2) }}
                      />
                    </Form.Item>
                    <Form.Item name="max_tokens" label="最大回复 (tokens)" style={{ marginBottom: 0 }}>
                      <InputNumber min={100} max={2000} step={50} style={{ width: '100%' }} />
                    </Form.Item>
                  </div>
                ),
              }]}
            />

            <Form.Item name="visitor_input_enabled" label="允许访客输入" valuePropName="checked" style={{ marginBottom: 0, marginTop: 12 }}>
              <Switch disabled={isFusionExhibit} />
            </Form.Item>
          </Card>

          {/* ─── 布局设置 (白板 v1.3) ─── */}
          <Card
            size="small"
            className={styles.glassCard}
            title={
              <Space>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>dashboard</span>
                <span>布局设置</span>
              </Space>
            }
          >
            <div className={styles.layoutSwitch}>
              <Segmented
                value={layoutMode}
                onChange={(v) => {
                  const mode = v as 'template' | 'override';
                  setLayoutMode(mode);
                  if (mode === 'override') {
                    // seed override from template default when switching on
                    setLayoutOverride(
                      avatarDetail?.layout_config_override
                      ?? avatarDetail?.template_default_layout_config
                      ?? DEFAULT_LAYOUT_CONFIG,
                    );
                  }
                }}
                options={[
                  { label: '使用模板默认', value: 'template' },
                  { label: '展项级覆盖', value: 'override' },
                ]}
              />
              {layoutMode === 'override' && (
                <Button
                  size="small"
                  onClick={() => setLayoutOverride(
                    avatarDetail?.template_default_layout_config ?? DEFAULT_LAYOUT_CONFIG,
                  )}
                >
                  恢复模板默认
                </Button>
              )}
            </div>

            {layoutMode === 'template' ? (
              <div className={styles.layoutTemplateHint}>
                <div className={styles.hintText}>
                  当前生效布局来自模板 <strong>{avatarDetail?.template_name ?? '-'}</strong> 的默认值。
                  如需针对本展项（屏幕比例 / 物理布局 / 内容性质）定制白板位置，切到"展项级覆盖"。
                </div>
                <LayoutPreview
                  rect={
                    avatarDetail?.layout_config_effective?.whiteboard_rect
                    ?? avatarDetail?.template_default_layout_config?.whiteboard_rect
                    ?? null
                  }
                />
              </div>
            ) : (
              <WhiteboardLayoutEditor
                value={layoutOverride}
                onChange={setLayoutOverride}
              />
            )}
          </Card>

          {/* ─── 媒体参数 ─── */}
          <Card
            size="small"
            className={styles.glassCard}
            title={
              <Space>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>slideshow</span>
                <span>媒体参数</span>
              </Space>
            }
          >
            <div style={{ display: 'flex', gap: 16 }}>
              <Form.Item
                name="image_display_ms"
                label="单张图片展示时长 (ms)"
                tooltip="search_by_tag 仅命中单张图片时的展示时长；TTS 播放期间计时暂停"
                style={{ flex: 1, marginBottom: 0 }}
              >
                <InputNumber min={2000} max={60000} step={500} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                name="image_per_slide_ms"
                label="多张图片每张时长 (ms)"
                tooltip="命中多张图片时的轮播间隔"
                style={{ flex: 1, marginBottom: 0 }}
              >
                <InputNumber min={1500} max={30000} step={500} style={{ width: '100%' }} />
              </Form.Item>
            </div>
          </Card>

          {/* ─── 本地热词拦截 ─── */}
          <Card
            size="small"
            className={styles.glassCard}
            title={
              <Space>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>hearing</span>
                <span>本地热词拦截</span>
              </Space>
            }
          >
            <Form.Item
              name="hotword_enabled"
              label="启用本地热词拦截"
              tooltip="暂停 / 继续 / 全屏 / 退出全屏 / 关闭 等媒体控制指令直接在展厅 App 识别（<100ms），不经过云端"
              valuePropName="checked"
              style={{ marginBottom: 12 }}
            >
              <Switch />
            </Form.Item>
            <div style={{ fontSize: 13, marginBottom: 8, color: 'var(--ant-color-text-secondary)' }}>
              扩展词表（内置词表之外的同义词）
            </div>
            <HotwordExtensionsEditor
              value={hotwordExt}
              onChange={setHotwordExt}
              disabled={!(form.getFieldValue('hotword_enabled') ?? true)}
            />
          </Card>

          {/* ─── Save button ─── */}
          <Button
            type="primary"
            size="large"
            block
            className={styles.saveBtn}
            disabled={isFusionExhibit}
            onClick={handleSave}
            loading={updateMutation.isPending}
            icon={<span className="material-symbols-outlined" style={{ fontSize: 18, marginRight: 4 }}>save</span>}
          >
            保存配置
          </Button>
        </Form>
      </div>

      {/* ═══════════ Right: Preview Area (50%) — sticky sidebar ═══════════ */}
      <div className={styles.right}>
        {/* ─── Sprite Preview ─── */}
        <Card
          size="small"
          className={styles.glassCard}
          title={
            <Space>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>smart_toy</span>
              <span>形象预览</span>
            </Space>
          }
        >
          {selectedTemplateId > 0 && templateDetail ? (
            <AvatarSpritePreview
              templateId={selectedTemplateId}
              idleSpriteSheets={templateDetail.idle_sprite_sheets}
              thinkingSpriteSheets={templateDetail.thinking_sprite_sheets}
              talkingSpriteSheets={templateDetail.talking_sprite_sheets}
              activeState={avatarState}
            />
          ) : (
            <div className={styles.previewEmpty}>
              <span className="material-symbols-outlined">smart_toy</span>
              <span className={styles.hint}>请先选择形象模板</span>
            </div>
          )}

          {/* Manual state buttons (always visible when template selected) */}
          {selectedTemplateId > 0 && templateDetail && (
            <div className={styles.stateBtns}>
              {(['idle', 'thinking', 'talking'] as const).map((state) => (
                <Button
                  key={state}
                  size="small"
                  type={avatarState === state ? 'primary' : 'default'}
                  onClick={() => setAvatarState(state)}
                >
                  {{ idle: '待机', thinking: '思考', talking: '说话' }[state]}
                </Button>
              ))}
            </div>
          )}
        </Card>

        {/* ─── Chat Simulator ─── */}
        <Card
          size="small"
          className={styles.glassCard}
          title={
            <Space>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chat</span>
              <span>对话模拟器</span>
            </Space>
          }
          style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
          styles={{ body: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } }}
        >
          <ChatSimulator
            exhibitId={exhibitId}
            hallId={hallId}
            voiceId={form.getFieldValue('voice_id')}
            speechRate={form.getFieldValue('speech_rate') ?? 1.0}
            onAvatarStateChange={setAvatarState}
          />
        </Card>
      </div>
    </div>
  );
}
