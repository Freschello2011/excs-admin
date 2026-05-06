import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  Button, Modal, Form, Input, Select, Space, Popconfirm,
  Empty, Spin, InputNumber, Tag, Tooltip, Badge,
} from 'antd';
import { useMessage } from '@/hooks/useMessage';
import {
  PlusOutlined, DeleteOutlined, EditOutlined, HolderOutlined,
  AppstoreAddOutlined, EyeOutlined, EyeInvisibleOutlined,
  SaveOutlined, RocketOutlined, HistoryOutlined, ReloadOutlined,
} from '@ant-design/icons';
import PreviewPanel from './preview/PreviewPanel';
import PanelVersionDrawer from './PanelVersionDrawer';
import DeviceCommandCardEditor from './DeviceCommandCardEditor';
import {
  bufferFromPanel,
  bufferFromSnapshot,
  bufferToSnapshot,
  bufferToPreviewSections,
  snapshotKey,
  addSection,
  updateSection,
  deleteSection,
  reorderSections,
  addCard,
  updateCard,
  deleteCard,
  reorderCards,
  type PanelBuffer,
  type BufferSection,
  type BufferCard,
} from './panelBuffer';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useHallStore } from '@/stores/hallStore';
import { panelApi } from '@/api/panel';
import { hallApi } from '@/api/hall';
import { commandApi } from '@/api/command';
import { queryKeys } from '@/api/queryKeys';
import { useCan } from '@/lib/authz/can';
import type {
  CardType,
  DeviceCommandBinding,
  PanelVersionDetailDTO,
} from '@/api/gen/client';
import {
  CARD_TYPE_LABELS,
  CARD_TYPE_ICONS,
  SECTION_TYPE_LABELS,
  ALL_CARD_TYPES,
} from '@/api/gen/client';
import type { ExhibitListItem, DeviceListItem } from '@/api/gen/client';
import type { SceneListItem } from '@/api/gen/client';

/* ==================== Sortable Section ==================== */

function SortableSection({
  section,
  children,
  canConfig,
  onEdit,
  onDelete,
  onAddCard,
}: {
  section: BufferSection;
  children: React.ReactNode;
  canConfig: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onAddCard: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `section-${section.id}` });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    border: '1px solid var(--ant-color-border)',
    borderRadius: 8,
    marginBottom: 16,
    background: 'var(--ant-color-bg-container)',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 16px',
          borderBottom: '1px solid var(--ant-color-border)',
          background: 'var(--ant-color-bg-layout)',
          borderRadius: '8px 8px 0 0',
        }}
      >
        {canConfig && (
          <span {...listeners} style={{ cursor: 'grab', display: 'flex' }}>
            <HolderOutlined style={{ fontSize: 16, color: 'var(--ant-color-text-quaternary)' }} />
          </span>
        )}
        <span style={{ fontWeight: 600, fontSize: 15 }}>{section.name}</span>
        <Tag color={section.section_type === 'global' ? 'blue' : 'green'}>
          {SECTION_TYPE_LABELS[section.section_type]}
        </Tag>
        <div style={{ flex: 1 }} />
        {canConfig && (
          <Space size="small">
            <Tooltip title="添加卡片">
              <Button type="text" size="small" icon={<AppstoreAddOutlined />} onClick={onAddCard} />
            </Tooltip>
            <Tooltip title="编辑分区">
              <Button type="text" size="small" icon={<EditOutlined />} onClick={onEdit} />
            </Tooltip>
            <Popconfirm title="确认删除此分区？删除后所有卡片一并删除（仅在 buffer 中删除，保存草稿后才落库）。" onConfirm={onDelete}>
              <Tooltip title="删除分区">
                <Button type="text" size="small" danger icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          </Space>
        )}
      </div>
      <div style={{ padding: 16, minHeight: 60 }}>
        {children}
      </div>
    </div>
  );
}

/* ==================== Sortable Card ==================== */

function SortableCard({
  card,
  canConfig,
  onEdit,
  onDelete,
  isHighlighted,
  onMouseEnter,
  onMouseLeave,
  cardRef,
}: {
  card: BufferCard;
  canConfig: boolean;
  onEdit: () => void;
  onDelete: () => void;
  isHighlighted?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  cardRef?: (el: HTMLDivElement | null) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `card-${card.id}` });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    border: '1px solid var(--ant-color-border)',
    borderRadius: 6,
    padding: '10px 12px',
    background: 'var(--ant-color-bg-container)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    cursor: canConfig ? 'default' : undefined,
  };

  const bindingLabel = (() => {
    const b = card.binding as Record<string, unknown> | null | undefined;
    if (!b) return '';
    if (typeof b.id === 'number') return `#${b.id}`;
    if (Array.isArray(b.ids)) return `${b.ids.length} 项`;
    if (Array.isArray(b.buttons)) return `${b.buttons.length} 按钮`;
    return '';
  })();

  const mergedRef = (el: HTMLDivElement | null) => {
    setNodeRef(el);
    cardRef?.(el);
  };

  return (
    <div
      ref={mergedRef}
      style={{
        ...style,
        ...(isHighlighted ? { boxShadow: '0 0 0 2px #26BFF7', borderColor: '#26BFF7' } : {}),
      }}
      {...attributes}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {canConfig && (
        <span {...listeners} style={{ cursor: 'grab', display: 'flex' }}>
          <HolderOutlined style={{ color: 'var(--ant-color-text-quaternary)' }} />
        </span>
      )}
      <span
        className="material-symbols-outlined"
        style={{ fontSize: 20, color: 'var(--ant-color-primary)' }}
      >
        {CARD_TYPE_ICONS[card.card_type as CardType]}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 13 }}>{CARD_TYPE_LABELS[card.card_type as CardType]}</div>
        {bindingLabel && (
          <div style={{ fontSize: 11, color: 'var(--ant-color-text-secondary)' }}>
            绑定: {bindingLabel}
          </div>
        )}
      </div>
      {canConfig && (
        <Space size={2}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={onEdit} />
          <Popconfirm title="从 buffer 中移除此卡片？保存草稿后才落库。" onConfirm={onDelete}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )}
    </div>
  );
}

/* ==================== Main Page ==================== */

export default function PanelEditorPage() {
  const { message } = useMessage();
  const hallId = useHallStore((s) => s.selectedHallId) ?? 0;
  const queryClient = useQueryClient();
  const canEdit = useCan('panel.edit', { type: 'hall', id: String(hallId) });
  const canPublish = useCan('panel.publish', { type: 'hall', id: String(hallId) });

  /* ─── DnD sensors ─── */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /* ─── Query: panel data (作为 baseline) ─── */
  const {
    data: panel,
    isLoading,
  } = useQuery({
    queryKey: queryKeys.panel(hallId),
    queryFn: () => panelApi.getPanel(hallId, { skipErrorMessage: true }),
    select: (res) => res.data.data,
    enabled: !!hallId,
  });

  /* ─── Query: exhibits / devices / scenes（用于绑定 selector）─── */
  const { data: exhibits } = useQuery({
    queryKey: queryKeys.exhibits(hallId),
    queryFn: () => hallApi.getExhibits(hallId),
    select: (res) => res.data.data,
    enabled: !!hallId,
  });

  const { data: devices } = useQuery({
    queryKey: queryKeys.devices({ hall_id: hallId }),
    queryFn: () => hallApi.getDevices({ hall_id: hallId }),
    select: (res) => res.data.data,
    enabled: !!hallId,
  });

  const { data: scenes } = useQuery({
    queryKey: queryKeys.scenes(hallId),
    queryFn: () => commandApi.getScenes(hallId),
    select: (res) => res.data.data,
    enabled: !!hallId,
  });

  /* ─── Buffer & baseline ─── */
  const [buffer, setBuffer] = useState<PanelBuffer>(() => bufferFromPanel(panel ?? null));
  const baselineKeyRef = useRef<string>('');
  // 防 viewing version 模式下 panel 重新加载 reset buffer
  const [viewVersionId, setViewVersionId] = useState<number | null>(null);

  // panel 拉到后初始化 buffer + baseline
  useEffect(() => {
    if (panel && viewVersionId == null) {
      const fresh = bufferFromPanel(panel);
      setBuffer(fresh);
      baselineKeyRef.current = snapshotKey(fresh);
    }
  }, [panel, viewVersionId]);

  const dirty = useMemo(
    () => baselineKeyRef.current && snapshotKey(buffer) !== baselineKeyRef.current,
    [buffer],
  );

  const sections = buffer.sections;
  const previewSections = useMemo(() => bufferToPreviewSections(buffer), [buffer]);

  const hasPanel = !!panel && panel.id > 0;
  const currentVersionId = (panel as { current_version_id?: number | null } | undefined)
    ?.current_version_id ?? null;

  /* ─── Preview state ─── */
  const [previewOpen, setPreviewOpen] = useState(true);
  const [hoveredCardId, setHoveredCardId] = useState<number | null>(null);
  const editorCardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const nameMaps = useMemo(() => ({
    exhibit: new Map((exhibits ?? []).map((e: ExhibitListItem) => [e.id, e.name])),
    device: new Map((devices ?? []).map((d: DeviceListItem) => [d.id, d.name])),
    scene: new Map((scenes ?? []).map((s: SceneListItem) => [s.id, s.name])),
  }), [exhibits, devices, scenes]);

  const handlePreviewCardClick = useCallback((cardId: number) => {
    editorCardRefs.current[cardId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHoveredCardId(cardId);
    setTimeout(() => setHoveredCardId((prev) => prev === cardId ? null : prev), 2000);
  }, []);

  /* ─── 生成默认面板（仍是真实 mutation——如果 panel 不存在，先 generate 才有 baseline）─── */
  const generateMutation = useMutation({
    mutationFn: () => panelApi.generateDefault(hallId),
    onSuccess: () => {
      message.success('默认面板已生成（已作为新 baseline）');
      queryClient.invalidateQueries({ queryKey: queryKeys.panel(hallId) });
    },
  });

  /* ─── 保存草稿 mutation ─── */
  const saveDraftMutation = useMutation({
    mutationFn: (args: { name: string }) =>
      panelApi.saveDraft(hallId, {
        name: args.name,
        snapshot_json: bufferToSnapshot(buffer) as unknown as Record<string, unknown>,
      }),
    onSuccess: (res, _args) => {
      const v = res.data.data;
      message.success(`已保存为草稿《${v.name}》。在「版本」抽屉里选择版本点【发布】下发到中控 App。`);
      queryClient.invalidateQueries({ queryKey: ['panel', hallId] });
      // 保存后把 baseline 推到当前 buffer——避免马上又触发 dirty
      baselineKeyRef.current = snapshotKey(buffer);
      setSaveOpen(false);
      // 自动打开版本抽屉，方便用户直接看到刚保存的草稿（仍需手动点【发布】）
      setDrawerOpen(true);
    },
  });

  // 发布走 PanelVersionDrawer 组件内部的 publishMutation —— 此页面不再持有 publish 链路。

  /* ─── 保存对话框 ─── */
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveForm] = Form.useForm();

  const openSave = () => {
    const defaultName = formatDefaultVersionName(new Date());
    saveForm.setFieldsValue({ name: defaultName });
    setSaveOpen(true);
  };

  const handleSaveSubmit = () => {
    saveForm.validateFields().then((values) => {
      saveDraftMutation.mutate({ name: values.name });
    });
  };

  /* ─── 重置 ─── */
  const resetBuffer = () => {
    if (!panel) return;
    const fresh = bufferFromPanel(panel);
    setBuffer(fresh);
    baselineKeyRef.current = snapshotKey(fresh);
    setViewVersionId(null);
    message.info('已重置为当前生效版本');
  };

  /* ─── 版本抽屉 ─── */
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleViewVersion = (detail: PanelVersionDetailDTO) => {
    const snap = (detail as unknown as { snapshot_json?: unknown }).snapshot_json;
    setBuffer(bufferFromSnapshot(snap));
    setViewVersionId(detail.id);
    setDrawerOpen(false);
    message.info(`正在只读预览：《${detail.name}》。点击「重置」回到当前生效版本。`);
  };

  /* ─── Section Modal ─── */
  const [sectionModalOpen, setSectionModalOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<BufferSection | null>(null);
  const [sectionForm] = Form.useForm();

  const openCreateSection = () => {
    setEditingSection(null);
    sectionForm.resetFields();
    sectionForm.setFieldsValue({ section_type: 'global', sort_order: sections.length + 1 });
    setSectionModalOpen(true);
  };

  const openEditSection = (section: BufferSection) => {
    setEditingSection(section);
    sectionForm.setFieldsValue({
      name: section.name,
      section_type: section.section_type,
      exhibit_id: section.exhibit_id,
    });
    setSectionModalOpen(true);
  };

  const handleSectionSubmit = () => {
    sectionForm.validateFields().then((values) => {
      if (editingSection) {
        setBuffer((b) => updateSection(b, editingSection.id, { name: values.name }));
      } else {
        setBuffer((b) =>
          addSection(b, {
            section_type: values.section_type,
            name: values.name,
            exhibit_id: values.section_type === 'exhibit' ? values.exhibit_id : undefined,
            sort_order: values.sort_order ?? sections.length + 1,
          }),
        );
      }
      setSectionModalOpen(false);
    });
  };

  /* ─── Card Modal ─── */
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<BufferCard | null>(null);
  const [cardSectionId, setCardSectionId] = useState<number>(0);
  const [cardForm] = Form.useForm();
  const cardTypeValue: CardType | undefined = Form.useWatch('card_type', cardForm);
  const [deviceCommandBinding, setDeviceCommandBinding] = useState<DeviceCommandBinding | null>(null);

  const openCreateCard = (sectionId: number) => {
    setEditingCard(null);
    setCardSectionId(sectionId);
    cardForm.resetFields();
    cardForm.setFieldsValue({ card_type: 'scene_group' });
    setDeviceCommandBinding(null);
    setCardModalOpen(true);
  };

  const openEditCard = (card: BufferCard, sectionId: number) => {
    setEditingCard(card);
    setCardSectionId(sectionId);
    cardForm.resetFields();
    const b = (card.binding ?? {}) as Record<string, unknown>;
    cardForm.setFieldsValue({
      card_type: card.card_type,
      binding_id: b.id,
      binding_ids: b.ids,
      config_json: card.config ? JSON.stringify(card.config, null, 2) : '',
    });
    if (card.card_type === 'device_command') {
      setDeviceCommandBinding((card.binding as DeviceCommandBinding | null) ?? { buttons: [] });
    } else {
      setDeviceCommandBinding(null);
    }
    setCardModalOpen(true);
  };

  const handleCardSubmit = () => {
    cardForm.validateFields().then((values) => {
      let binding: Record<string, unknown> | null;
      if (values.card_type === 'device_command') {
        if (!deviceCommandBinding || (deviceCommandBinding.buttons ?? []).length === 0) {
          message.error('device_command 卡至少需要 1 个按钮');
          return;
        }
        const invalid = deviceCommandBinding.buttons.some(
          (b: import('@/api/gen/client').DeviceCommandButton) =>
            !b.label || !b.actions || b.actions.length === 0 ||
            b.actions.some((a) => !a.device_id || !a.command),
        );
        if (invalid) {
          message.error('请检查按钮：label / device / command 不能为空');
          return;
        }
        binding = deviceCommandBinding as unknown as Record<string, unknown>;
      } else {
        binding = buildBinding(values.card_type, values.binding_id, values.binding_ids);
      }
      let config: Record<string, unknown> | null = null;
      if (values.config_json) {
        try {
          config = JSON.parse(values.config_json);
        } catch {
          message.error('Config JSON 格式不正确');
          return;
        }
      }

      if (editingCard) {
        setBuffer((b) =>
          updateCard(b, editingCard.id, {
            card_type: values.card_type,
            binding,
            config,
          }),
        );
      } else {
        setBuffer((b) =>
          addCard(b, cardSectionId, {
            card_type: values.card_type,
            binding,
            config,
          }),
        );
      }
      setCardModalOpen(false);
    });
  };

  /* ─── Binding helpers (其他卡型沿用) ─── */
  function buildBinding(
    cardType: CardType,
    bindingId?: number,
    bindingIds?: number[],
  ): Record<string, unknown> | null {
    switch (cardType) {
      case 'scene_group':
        return bindingIds?.length ? { type: 'scene', ids: bindingIds } : null;
      case 'media':
      case 'script':
      case 'ai':
        return bindingId ? { type: 'exhibit', id: bindingId } : null;
      case 'show':
        return bindingId ? { type: 'show', id: bindingId } : null;
      case 'device_toggle':
      case 'slider':
        return bindingId ? { type: 'device', id: bindingId } : null;
      case 'device_status':
        return bindingIds?.length ? { type: 'device', ids: bindingIds } : null;
      default:
        return null;
    }
  }

  const needsSingleId = (ct?: CardType) =>
    ct === 'media' || ct === 'script' || ct === 'ai' || ct === 'show' || ct === 'device_toggle' || ct === 'slider';

  /* ─── DnD handlers ─── */
  const handleSectionDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = Number(String(active.id).replace('section-', ''));
    const overId = Number(String(over.id).replace('section-', ''));

    const oldIndex = sections.findIndex((s) => s.id === activeId);
    const newIndex = sections.findIndex((s) => s.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...sections];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    setBuffer((b) => reorderSections(b, reordered.map((s) => s.id)));
  };

  const handleCardDragEnd = (sectionId: number) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;

    const activeId = Number(String(active.id).replace('card-', ''));
    const overId = Number(String(over.id).replace('card-', ''));

    const cards = [...section.cards];
    const oldIndex = cards.findIndex((c) => c.id === activeId);
    const newIndex = cards.findIndex((c) => c.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;

    const [moved] = cards.splice(oldIndex, 1);
    cards.splice(newIndex, 0, moved);

    setBuffer((b) => reorderCards(b, sectionId, cards.map((c) => c.id)));
  };

  /* ─── Render ─── */
  if (!hallId) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--color-outline)', padding: 60 }}>
        请先在顶栏选择展厅
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <Space size="small" wrap>
          {viewVersionId != null ? (
            <Tag color="blue">只读预览版本 #{viewVersionId}</Tag>
          ) : dirty ? (
            <Badge dot>
              <Tag color="orange">未保存</Tag>
            </Badge>
          ) : (
            <Tag color="default">已同步当前生效版本</Tag>
          )}
          {currentVersionId != null && (
            <Tag color="blue">当前生效版本 #{currentVersionId}</Tag>
          )}
        </Space>
        <Space wrap>
          <Button
            icon={previewOpen ? <EyeInvisibleOutlined /> : <EyeOutlined />}
            onClick={() => setPreviewOpen((v) => !v)}
            disabled={!hasPanel || sections.length === 0}
          >
            {previewOpen ? '收起预览' : '预览'}
          </Button>
          <Button
            icon={<HistoryOutlined />}
            onClick={() => setDrawerOpen(true)}
          >
            版本
          </Button>
          {canEdit && (
            <>
              <Tooltip title="重置 buffer 为当前生效版本（丢弃未保存改动）">
                <Button
                  icon={<ReloadOutlined />}
                  onClick={resetBuffer}
                  disabled={!dirty && viewVersionId == null}
                >
                  重置
                </Button>
              </Tooltip>
              <Button
                onClick={() => generateMutation.mutate()}
                loading={generateMutation.isPending}
                disabled={hasPanel && sections.length > 0}
              >
                生成默认面板
              </Button>
              <Button
                icon={<PlusOutlined />}
                onClick={openCreateSection}
                disabled={!hasPanel}
              >
                新增分区
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={openSave}
                disabled={!hasPanel || sections.length === 0 || !dirty}
              >
                保存草稿
              </Button>
            </>
          )}
          {canPublish && (
            <Tooltip title="从「版本」抽屉里选择要发布的草稿；保存后会自动询问是否立即发布。">
              <Button
                icon={<RocketOutlined />}
                onClick={() => setDrawerOpen(true)}
              >
                发布
              </Button>
            </Tooltip>
          )}
        </Space>
      </div>

      {!hasPanel && (
        <Empty
          description="该展厅尚未配置面板"
          style={{ padding: 60 }}
        >
          {canEdit && (
            <Button
              type="primary"
              onClick={() => generateMutation.mutate()}
              loading={generateMutation.isPending}
            >
              生成默认面板
            </Button>
          )}
        </Empty>
      )}

      {hasPanel && sections.length === 0 && (
        <Empty
          description="面板暂无分区，点击上方按钮添加（仅在 buffer 中，保存草稿后落库）"
          style={{ padding: 60 }}
        />
      )}

      {hasPanel && sections.length > 0 && (
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSectionDragEnd}>
              <SortableContext
                items={sections.map((s) => `section-${s.id}`)}
                strategy={verticalListSortingStrategy}
              >
                {sections.map((section) => (
                  <SortableSection
                    key={section.id}
                    section={section}
                    canConfig={canEdit && viewVersionId == null}
                    onEdit={() => openEditSection(section)}
                    onDelete={() => setBuffer((b) => deleteSection(b, section.id))}
                    onAddCard={() => openCreateCard(section.id)}
                  >
                    {section.cards.length === 0 ? (
                      <div style={{ textAlign: 'center', color: 'var(--ant-color-text-quaternary)', padding: 16 }}>
                        暂无卡片
                        {canEdit && viewVersionId == null && (
                          <Button type="link" size="small" onClick={() => openCreateCard(section.id)}>
                            添加
                          </Button>
                        )}
                      </div>
                    ) : (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleCardDragEnd(section.id)}
                      >
                        <SortableContext
                          items={section.cards.map((c) => `card-${c.id}`)}
                          strategy={rectSortingStrategy}
                        >
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                              gap: 8,
                            }}
                          >
                            {section.cards.map((card) => (
                              <SortableCard
                                key={card.id}
                                card={card}
                                canConfig={canEdit && viewVersionId == null}
                                onEdit={() => openEditCard(card, section.id)}
                                onDelete={() => setBuffer((b) => deleteCard(b, card.id))}
                                isHighlighted={hoveredCardId === card.id}
                                onMouseEnter={() => setHoveredCardId(card.id)}
                                onMouseLeave={() => setHoveredCardId(null)}
                                cardRef={(el) => { editorCardRefs.current[card.id] = el; }}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    )}
                  </SortableSection>
                ))}
              </SortableContext>
            </DndContext>
          </div>

          {previewOpen && (
            <PreviewPanel
              sections={previewSections}
              nameMaps={nameMaps}
              highlightedCardId={hoveredCardId}
              onCardMouseEnter={setHoveredCardId}
              onCardMouseLeave={() => setHoveredCardId(null)}
              onCardClick={handlePreviewCardClick}
            />
          )}
        </div>
      )}

      {/* ─── Section Modal ─── */}
      <Modal
        title={editingSection ? '编辑分区' : '新增分区'}
        open={sectionModalOpen}
        onOk={handleSectionSubmit}
        onCancel={() => setSectionModalOpen(false)}
        destroyOnClose
      >
        <Form form={sectionForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="分区名称" rules={[{ required: true, message: '请输入分区名称' }]}>
            <Input maxLength={50} placeholder="例：全局控制" />
          </Form.Item>
          {!editingSection && (
            <>
              <Form.Item name="section_type" label="分区类型" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'global', label: '全局' },
                    { value: 'exhibit', label: '展项' },
                  ]}
                />
              </Form.Item>
              <Form.Item noStyle shouldUpdate={(prev, cur) => prev.section_type !== cur.section_type}>
                {({ getFieldValue }) =>
                  getFieldValue('section_type') === 'exhibit' ? (
                    <Form.Item name="exhibit_id" label="关联展项" rules={[{ required: true, message: '请选择展项' }]}>
                      <Select
                        placeholder="选择展项"
                        options={(exhibits ?? []).map((e: ExhibitListItem) => ({
                          value: e.id,
                          label: e.name,
                        }))}
                      />
                    </Form.Item>
                  ) : null
                }
              </Form.Item>
              <Form.Item name="sort_order" label="排序">
                <InputNumber min={1} max={999} style={{ width: '100%' }} />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>

      {/* ─── Card Modal ─── */}
      <Modal
        title={editingCard ? '编辑卡片' : '新增卡片'}
        open={cardModalOpen}
        onOk={handleCardSubmit}
        onCancel={() => setCardModalOpen(false)}
        destroyOnClose
        width={cardTypeValue === 'device_command' ? 760 : 560}
      >
        <Form form={cardForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="card_type" label="卡片类型" rules={[{ required: true }]}>
            <Select
              options={ALL_CARD_TYPES.map((ct) => ({
                value: ct,
                label: CARD_TYPE_LABELS[ct],
              }))}
            />
          </Form.Item>

          {/* Single binding — exhibit */}
          {needsSingleId(cardTypeValue) && (cardTypeValue === 'media' || cardTypeValue === 'script' || cardTypeValue === 'ai') && (
            <Form.Item name="binding_id" label="绑定展项">
              <Select
                allowClear
                placeholder="选择展项"
                options={(exhibits ?? []).map((e: ExhibitListItem) => ({
                  value: e.id,
                  label: e.name,
                }))}
              />
            </Form.Item>
          )}

          {/* Single binding — show */}
          {cardTypeValue === 'show' && (
            <Form.Item name="binding_id" label="绑定演出">
              <InputNumber min={1} style={{ width: '100%' }} placeholder="演出 ID" />
            </Form.Item>
          )}

          {/* Single binding — device */}
          {(cardTypeValue === 'device_toggle' || cardTypeValue === 'slider') && (
            <Form.Item name="binding_id" label="绑定设备">
              <Select
                allowClear
                placeholder="选择设备"
                options={(devices ?? []).map((d: DeviceListItem) => ({
                  value: d.id,
                  label: d.name,
                }))}
              />
            </Form.Item>
          )}

          {/* Multi binding — scenes */}
          {cardTypeValue === 'scene_group' && (
            <Form.Item name="binding_ids" label="绑定场景">
              <Select
                mode="multiple"
                allowClear
                placeholder="选择场景"
                options={(scenes ?? []).map((s: SceneListItem) => ({
                  value: s.id,
                  label: s.name,
                }))}
              />
            </Form.Item>
          )}

          {/* Multi binding — devices */}
          {cardTypeValue === 'device_status' && (
            <Form.Item name="binding_ids" label="绑定设备">
              <Select
                mode="multiple"
                allowClear
                placeholder="选择设备"
                options={(devices ?? []).map((d: DeviceListItem) => ({
                  value: d.id,
                  label: d.name,
                }))}
              />
            </Form.Item>
          )}

          {/* device_command 编辑器（按钮 → 动作 → device + command + params 三选） */}
          {cardTypeValue === 'device_command' && (
            <Form.Item label="按钮列表" required>
              <DeviceCommandCardEditor
                value={deviceCommandBinding}
                onChange={setDeviceCommandBinding}
                devices={devices ?? []}
                exhibits={exhibits ?? []}
              />
            </Form.Item>
          )}

          {/* Config JSON */}
          <Form.Item name="config_json" label="卡片配置（JSON，可选）">
            <Input.TextArea rows={3} placeholder='{"title": "沙盘灯光"}' />
          </Form.Item>
        </Form>
      </Modal>

      {/* ─── 保存草稿对话框 ─── */}
      <Modal
        title="保存为新草稿"
        open={saveOpen}
        onOk={handleSaveSubmit}
        onCancel={() => setSaveOpen(false)}
        confirmLoading={saveDraftMutation.isPending}
        destroyOnClose
        okText="保存"
      >
        <Form form={saveForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item
            name="name"
            label="版本名"
            rules={[{ required: true, message: '请输入版本名' }, { max: 128 }]}
          >
            <Input placeholder="如：山区灯改造-v2" maxLength={128} />
          </Form.Item>
          <div style={{ color: 'var(--ant-color-text-secondary)', fontSize: 12 }}>
            保存生成新一条草稿；不会立即下发。在「版本」抽屉点【发布】才会推送到中控 App。
          </div>
        </Form>
      </Modal>

      {/* ─── 版本抽屉 ─── */}
      <PanelVersionDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        hallId={hallId}
        currentVersionId={currentVersionId}
        onView={handleViewVersion}
      />
    </div>
  );
}

function formatDefaultVersionName(d: Date): string {
  const yy = d.getFullYear() % 100;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(yy)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
