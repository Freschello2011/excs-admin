import { useState, useCallback, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button, Modal, Form, Input, Select, Space, Popconfirm,
  Empty, Spin, InputNumber, Tag, Tooltip,
} from 'antd';
import { useMessage } from '@/hooks/useMessage';
import {
  PlusOutlined, DeleteOutlined, EditOutlined, HolderOutlined,
  AppstoreAddOutlined, EyeOutlined, EyeInvisibleOutlined,
} from '@ant-design/icons';
import PreviewPanel from './preview/PreviewPanel';
// PanelEditorPage：中控 App「面板编辑」tab 的内部页面。不渲染外层 PageHeader（由 ControlAppPage 统一承载）。
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
import { useAuthStore } from '@/stores/authStore';
import type {
  PanelSection,
  PanelCard,
  CardType,
  CardBinding,
  AddSectionBody,
  AddCardBody,
  UpdateCardBody,
} from '@/types/panel';
import {
  CARD_TYPE_LABELS,
  CARD_TYPE_ICONS,
  SECTION_TYPE_LABELS,
  ALL_CARD_TYPES,
} from '@/types/panel';
import type { ExhibitListItem, DeviceListItem } from '@/types/hall';
import type { SceneListItem } from '@/types/command';

/* ==================== Sortable Section ==================== */

function SortableSection({
  section,
  children,
  canConfig,
  onEdit,
  onDelete,
  onAddCard,
}: {
  section: PanelSection;
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
      {/* Section header */}
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
            <Popconfirm title="确认删除此分区？删除后所有卡片一并删除。" onConfirm={onDelete}>
              <Tooltip title="删除分区">
                <Button type="text" size="small" danger icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          </Space>
        )}
      </div>
      {/* Section body — card grid */}
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
  card: PanelCard;
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
    if (!card.binding) return '';
    if (card.binding.id) return `#${card.binding.id}`;
    if (card.binding.ids?.length) return `${card.binding.ids.length} 项`;
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
        {CARD_TYPE_ICONS[card.card_type]}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 13 }}>{CARD_TYPE_LABELS[card.card_type]}</div>
        {bindingLabel && (
          <div style={{ fontSize: 11, color: 'var(--ant-color-text-secondary)' }}>
            绑定: {bindingLabel}
          </div>
        )}
      </div>
      {canConfig && (
        <Space size={2}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={onEdit} />
          <Popconfirm title="确认删除此卡片？" onConfirm={onDelete}>
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
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const hasPermission = useAuthStore((s) => s.hasHallPermission);
  const canConfig = hasPermission(hallId, 'system_config') || isAdmin();

  /* ─── DnD sensors ─── */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /* ─── Query: panel data ─── */
  const {
    data: panel,
    isLoading,
  } = useQuery({
    queryKey: queryKeys.panel(hallId),
    queryFn: () => panelApi.getPanel(hallId, { skipErrorMessage: true }),
    select: (res) => res.data.data,
    enabled: !!hallId,
  });

  /* ─── Query: exhibits (for binding selector) ─── */
  const { data: exhibits } = useQuery({
    queryKey: queryKeys.exhibits(hallId),
    queryFn: () => hallApi.getExhibits(hallId),
    select: (res) => res.data.data,
    enabled: !!hallId,
  });

  /* ─── Query: devices (for binding selector) ─── */
  const { data: devices } = useQuery({
    queryKey: queryKeys.devices({ hall_id: hallId }),
    queryFn: () => hallApi.getDevices({ hall_id: hallId }),
    select: (res) => res.data.data,
    enabled: !!hallId,
  });

  /* ─── Query: scenes (for binding selector) ─── */
  const { data: scenes } = useQuery({
    queryKey: queryKeys.scenes(hallId),
    queryFn: () => commandApi.getScenes(hallId),
    select: (res) => res.data.data,
    enabled: !!hallId,
  });

  const sections = panel?.sections ?? [];

  /* ─── Preview state ─── */
  const [previewOpen, setPreviewOpen] = useState(false);
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
    // 短暂高亮后清除
    setTimeout(() => setHoveredCardId((prev) => prev === cardId ? null : prev), 2000);
  }, []);

  /* ─── Mutations ─── */
  const invalidatePanel = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.panel(hallId) }),
    [queryClient, hallId],
  );

  const generateMutation = useMutation({
    mutationFn: () => panelApi.generateDefault(hallId),
    onSuccess: () => {
      message.success('默认面板已生成');
      invalidatePanel();
    },
  });

  const createSectionMutation = useMutation({
    mutationFn: (data: AddSectionBody) => panelApi.createSection(hallId, data),
    onSuccess: () => {
      message.success('分区已创建');
      invalidatePanel();
    },
  });

  const updateSectionMutation = useMutation({
    mutationFn: ({ sectionId, data }: { sectionId: number; data: { name?: string } }) =>
      panelApi.updateSection(hallId, sectionId, data),
    onSuccess: () => {
      message.success('分区已更新');
      invalidatePanel();
    },
  });

  const deleteSectionMutation = useMutation({
    mutationFn: (sectionId: number) => panelApi.deleteSection(hallId, sectionId),
    onSuccess: () => {
      message.success('分区已删除');
      invalidatePanel();
    },
  });

  const reorderSectionsMutation = useMutation({
    mutationFn: (sectionIds: number[]) => panelApi.reorderSections(hallId, { section_ids: sectionIds }),
    onSuccess: () => invalidatePanel(),
  });

  const createCardMutation = useMutation({
    mutationFn: ({ sectionId, data }: { sectionId: number; data: AddCardBody }) =>
      panelApi.createCard(hallId, sectionId, data),
    onSuccess: () => {
      message.success('卡片已创建');
      invalidatePanel();
    },
  });

  const updateCardMutation = useMutation({
    mutationFn: ({ cardId, data }: { cardId: number; data: UpdateCardBody }) =>
      panelApi.updateCard(hallId, cardId, data),
    onSuccess: () => {
      message.success('卡片已更新');
      invalidatePanel();
    },
  });

  const deleteCardMutation = useMutation({
    mutationFn: (cardId: number) => panelApi.deleteCard(hallId, cardId),
    onSuccess: () => {
      message.success('卡片已删除');
      invalidatePanel();
    },
  });

  const reorderCardsMutation = useMutation({
    mutationFn: ({ sectionId, cardIds }: { sectionId: number; cardIds: number[] }) =>
      panelApi.reorderCards(hallId, sectionId, { card_ids: cardIds }),
    onSuccess: () => invalidatePanel(),
  });

  /* ─── Section Modal ─── */
  const [sectionModalOpen, setSectionModalOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<PanelSection | null>(null);
  const [sectionForm] = Form.useForm();

  const openCreateSection = () => {
    setEditingSection(null);
    sectionForm.resetFields();
    sectionForm.setFieldsValue({ section_type: 'global', sort_order: sections.length + 1 });
    setSectionModalOpen(true);
  };

  const openEditSection = (section: PanelSection) => {
    setEditingSection(section);
    sectionForm.setFieldsValue({ name: section.name, section_type: section.section_type, exhibit_id: section.exhibit_id });
    setSectionModalOpen(true);
  };

  const handleSectionSubmit = () => {
    sectionForm.validateFields().then((values) => {
      if (editingSection) {
        updateSectionMutation.mutate(
          { sectionId: editingSection.id, data: { name: values.name } },
          { onSuccess: () => setSectionModalOpen(false) },
        );
      } else {
        const body: AddSectionBody = {
          section_type: values.section_type,
          name: values.name,
          sort_order: values.sort_order ?? sections.length + 1,
        };
        if (values.section_type === 'exhibit' && values.exhibit_id) {
          body.exhibit_id = values.exhibit_id;
        }
        createSectionMutation.mutate(body, { onSuccess: () => setSectionModalOpen(false) });
      }
    });
  };

  /* ─── Card Modal ─── */
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<PanelCard | null>(null);
  const [cardSectionId, setCardSectionId] = useState<number>(0);
  const [cardForm] = Form.useForm();
  const cardTypeValue: CardType | undefined = Form.useWatch('card_type', cardForm);

  const openCreateCard = (sectionId: number) => {
    setEditingCard(null);
    setCardSectionId(sectionId);
    cardForm.resetFields();
    cardForm.setFieldsValue({ card_type: 'scene_group' });
    setCardModalOpen(true);
  };

  const openEditCard = (card: PanelCard, sectionId: number) => {
    setEditingCard(card);
    setCardSectionId(sectionId);
    cardForm.resetFields();
    cardForm.setFieldsValue({
      card_type: card.card_type,
      binding_id: card.binding?.id,
      binding_ids: card.binding?.ids,
      config_json: card.config ? JSON.stringify(card.config, null, 2) : '',
    });
    setCardModalOpen(true);
  };

  const handleCardSubmit = () => {
    cardForm.validateFields().then((values) => {
      const binding = buildBinding(values.card_type, values.binding_id, values.binding_ids);
      let config: Record<string, unknown> | undefined;
      if (values.config_json) {
        try {
          config = JSON.parse(values.config_json);
        } catch {
          message.error('Config JSON 格式不正确');
          return;
        }
      }

      if (editingCard) {
        const data: UpdateCardBody = {
          card_type: values.card_type,
          binding: binding ?? undefined,
          config,
        };
        updateCardMutation.mutate(
          { cardId: editingCard.id, data },
          { onSuccess: () => setCardModalOpen(false) },
        );
      } else {
        const data: AddCardBody = {
          card_type: values.card_type,
          binding: binding ?? undefined,
          config,
        };
        createCardMutation.mutate(
          { sectionId: cardSectionId, data },
          { onSuccess: () => setCardModalOpen(false) },
        );
      }
    });
  };

  /* ─── Binding helpers ─── */
  function buildBinding(
    cardType: CardType,
    bindingId?: number,
    bindingIds?: number[],
  ): CardBinding | null {
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

    reorderSectionsMutation.mutate(reordered.map((s) => s.id));
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

    reorderCardsMutation.mutate({ sectionId, cardIds: cards.map((c) => c.id) });
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

  const hasPanel = panel && panel.id > 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Space>
          <Button
            icon={previewOpen ? <EyeInvisibleOutlined /> : <EyeOutlined />}
            onClick={() => setPreviewOpen((v) => !v)}
            disabled={!hasPanel || sections.length === 0}
          >
            {previewOpen ? '收起预览' : '预览'}
          </Button>
          {canConfig && (
            <>
              <Button
                onClick={() => generateMutation.mutate()}
                loading={generateMutation.isPending}
                disabled={hasPanel && sections.length > 0}
              >
                生成默认面板
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateSection} disabled={!hasPanel}>
                新增分区
              </Button>
            </>
          )}
        </Space>
      </div>

      {/* Empty state */}
      {!hasPanel && (
        <Empty
          description="该展厅尚未配置面板"
          style={{ padding: 60 }}
        >
          {canConfig && (
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

      {/* Section list with drag-and-drop */}
      {hasPanel && sections.length === 0 && (
        <Empty
          description="面板暂无分区，点击上方按钮添加"
          style={{ padding: 60 }}
        />
      )}

      {hasPanel && sections.length > 0 && (
        <div style={{ display: 'flex', gap: 16 }}>
          {/* 编辑区 */}
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
                    canConfig={canConfig}
                    onEdit={() => openEditSection(section)}
                    onDelete={() => deleteSectionMutation.mutate(section.id)}
                    onAddCard={() => openCreateCard(section.id)}
                  >
                    {section.cards.length === 0 ? (
                      <div style={{ textAlign: 'center', color: 'var(--ant-color-text-quaternary)', padding: 16 }}>
                        暂无卡片
                        {canConfig && (
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
                                canConfig={canConfig}
                                onEdit={() => openEditCard(card, section.id)}
                                onDelete={() => deleteCardMutation.mutate(card.id)}
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

          {/* 预览区 */}
          {previewOpen && (
            <PreviewPanel
              sections={sections}
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
        confirmLoading={createSectionMutation.isPending || updateSectionMutation.isPending}
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
        confirmLoading={createCardMutation.isPending || updateCardMutation.isPending}
        destroyOnClose
        width={560}
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
                  label: `${d.name}（${d.subcategory_name ?? d.subcategory_code ?? '设备'}）`,
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
                  label: `${d.name}（${d.subcategory_name ?? d.subcategory_code ?? '设备'}）`,
                }))}
              />
            </Form.Item>
          )}

          {/* Config JSON */}
          <Form.Item name="config_json" label="卡片配置（JSON，可选）">
            <Input.TextArea rows={3} placeholder='{"key": "value"}' />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
