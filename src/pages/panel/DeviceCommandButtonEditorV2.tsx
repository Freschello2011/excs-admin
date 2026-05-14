/**
 * DeviceCommandButtonEditorV2 — ADR-0020-v2 Stage 5 admin Phase C host
 *
 * 入口：从 PanelEditorPage 触发（点 device_command 卡的「编辑」按钮）→ 全屏 Drawer 打开本组件。
 *
 * SSOT：admin-UI §4.20.5 + mockup M2（07-ui/mockup/08-runbook-v2/02-admin-device-command-editor.html）
 *
 * 布局（mockup M2 line 440-877）：
 *   [PageHeader] 面包屑 + 标题 + actions[关闭 / 应用到草稿]
 *   [三栏]
 *     ├─ 左 280px sticky：PanelSectionNav（卡片层级 · 当前 device_command 卡高亮）
 *     ├─ 中 240px sticky：DeviceCommandButtonList（按钮列表 + 上下移 + 删 + 新增）
 *     └─ 右编辑区
 *          ├─ DeviceCommandButtonPreview（深色卡 + 玻璃风按钮单元）
 *          ├─ DeviceCommandButtonBasicInfo（label / icon / tooltip + Alert warning）
 *          └─ ActionStepListEditor（核心 · 与 SceneEditPage 共用 S5-7 组件）
 *
 * Save schema 决策（S5-9 调研）：
 *   server `panel/binding_parse.go::ParseDeviceCommandBindingButtons` 已实装 dual-mode：
 *     - schema_version 缺省 / 1 → v1 三元组 → 自动包成 ActionStep[]（device-only, delay=0）
 *     - schema_version = 2      → 直接读 ActionStep[]（含 type=device|content + delay + preconds）
 *   binding 通过 PanelEditor 的 buffer.card.binding（Record<string, unknown>）落 panel.snapshot_json
 *   保存草稿时 server 反序列化按 schema_version 分流——admin v2 编辑器写出的 binding
 *   始终带 schema_version=2 + ActionStep[]，无 v1 兼容路径回写。
 *
 *   read 时：buffer.binding 可能是 v1（旧 published 版本）或 v2；本组件入口处先检测
 *     schema_version：
 *       - schema_version === 2 → 直接拿 ActionStep[]
 *       - 否则                  → 把 v1 三元组每条转成 device-only ActionStep
 *
 *   write 时：始终序列化为 v2（{ schema_version: 2, buttons: [{ label, icon, tooltip, actions: ActionStep[] }] }）
 *
 * dirty 守卫：本编辑器在 Drawer 内编辑「按钮列表」局部态；点「应用到草稿」回调到 host
 * （PanelEditorPage）patch 整张 buffer 后关闭 Drawer。Drawer 关闭时若有未应用改动 →
 * Modal.confirm 二次确认。Drawer 不挂全局 useBlocker（router 守卫由 PanelEditorPage 统筹）。
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Breadcrumb,
  Button,
  Card,
  Drawer,
  Empty,
  Space,
  Tag,
  Tooltip,
} from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  OrderedListOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { hallApi } from '@/api/hall';
import { commandApi } from '@/api/command';
import { queryKeys } from '@/api/queryKeys';
import { useMessage } from '@/hooks/useMessage';
import type {
  DeviceListItem,
  ExhibitListItem,
  SceneListItem,
} from '@/api/gen/client';
import ActionStepListEditor from '@/pages/_shared/runbook/ActionStepListEditor';
import {
  emptyDeviceStep,
  type ActionStep,
} from '@/pages/_shared/runbook/types';
import type { BufferSection, BufferCard } from './panelBuffer';
import PanelSectionNav from './components/PanelSectionNav';
import DeviceCommandButtonList from './components/DeviceCommandButtonList';
import DeviceCommandButtonPreview from './components/DeviceCommandButtonPreview';
import DeviceCommandButtonBasicInfo from './components/DeviceCommandButtonBasicInfo';
import WolFallbackSummary from './components/WolFallbackSummary';
import ContentPicker, {
  type ContentPickerMode,
} from './components/ContentPicker';
import type { ButtonViewModel } from './components/buttonV2Types';
import {
  bindingToButtons,
  buttonsToBinding,
  validateButtons,
} from './components/buttonV2Codec';

// ============================================================
// Props
// ============================================================

export interface DeviceCommandButtonEditorV2Props {
  open: boolean;
  hallId: number;
  /** 当前编辑的卡（host 注入；切换左栏卡走 onActivateCard） */
  card: BufferCard | null;
  /** 当前卡所属分区 id */
  sectionId: number | null;
  /** 整张 panel buffer（左栏导航数据源） */
  sections: BufferSection[];
  disabled?: boolean;
  /** 切换激活卡（左栏点击）→ host 把新卡注入 */
  onActivateCard: (sectionId: number, card: BufferCard) => void;
  /** 应用到草稿 → 只回填 binding；buffer.update 由 host 做 */
  onApply: (cardId: number, binding: Record<string, unknown>) => void;
  /** 关闭 Drawer */
  onClose: () => void;
}

// ============================================================
// Component
// ============================================================

export default function DeviceCommandButtonEditorV2({
  open,
  hallId,
  card,
  sectionId,
  sections,
  disabled,
  onActivateCard,
  onApply,
  onClose,
}: DeviceCommandButtonEditorV2Props) {
  const { message, modal } = useMessage();

  // ----- 局部编辑态 -----
  const [buttons, setButtons] = useState<ButtonViewModel[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pickerState, setPickerState] = useState<{
    open: boolean;
    mode: ContentPickerMode;
    exhibitId: number;
    currentContentId: number | null;
    resolve: ((id: number | null) => void) | null;
  } | null>(null);

  // 装载 / 切换 card 时初始化
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open || !card) return;
    const initial = bindingToButtons(card.binding ?? null);
    setButtons(initial);
    setActiveIndex(0);
    setEditingStepIndex(null);
    setDirty(false);
  }, [open, card?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  /* eslint-enable react-hooks/set-state-in-effect */

  // ----- 数据源（与 SceneEditPage 同款）-----
  const { data: devicesData } = useQuery({
    queryKey: queryKeys.devices({ hall_id: hallId } as Record<string, unknown>),
    queryFn: () => hallApi.getDevices({ hall_id: hallId }),
    select: (res) => res.data.data ?? [],
    enabled: open && hallId > 0,
  });
  const { data: exhibitsData } = useQuery({
    queryKey: queryKeys.exhibits(hallId),
    queryFn: () => hallApi.getExhibits(hallId),
    select: (res) => res.data.data ?? [],
    enabled: open && hallId > 0,
  });
  const { data: scenesData } = useQuery({
    queryKey: queryKeys.scenes(hallId),
    queryFn: () => commandApi.getScenes(hallId),
    select: (res) => res.data.data ?? [],
    enabled: open && hallId > 0,
  });

  const devices = useMemo(
    () => (devicesData ?? []).map((d: DeviceListItem) => ({ id: d.id, name: d.name })),
    [devicesData],
  );
  const exhibits = useMemo(
    () => (exhibitsData ?? []).map((e: ExhibitListItem) => ({ id: e.id, name: e.name })),
    [exhibitsData],
  );
  const scenes = useMemo(
    () => (scenesData ?? []).map((s: SceneListItem) => ({ id: s.id, name: s.name })),
    [scenesData],
  );

  // ----- 派生 -----
  const activeButton = buttons[activeIndex] ?? null;
  const validation = useMemo(() => validateButtons(buttons), [buttons]);
  const activeErrors = useMemo(
    () => validation.errors[activeIndex] ?? {},
    [validation, activeIndex],
  );
  const stepErrorsForList = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(activeErrors)) {
      if (k.startsWith('actions.')) out[k.slice('actions.'.length)] = v;
    }
    return out;
  }, [activeErrors]);

  // ----- 操作 -----
  function patchActiveButton(patch: Partial<ButtonViewModel>) {
    if (!activeButton) return;
    setButtons((bs) => bs.map((b, i) => (i === activeIndex ? { ...b, ...patch } : b)));
    setDirty(true);
  }
  function patchActiveActions(next: ActionStep[]) {
    patchActiveButton({ actions: next });
  }
  function handleAddButton() {
    const next: ButtonViewModel = {
      label: `按钮 ${buttons.length + 1}`,
      icon: '',
      tooltip: '',
      actions: [emptyDeviceStep(0)],
    };
    setButtons((bs) => [...bs, next]);
    setActiveIndex(buttons.length);
    setDirty(true);
  }
  function handleMoveButton(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= buttons.length) return;
    const next = [...buttons];
    [next[idx], next[target]] = [next[target], next[idx]];
    setButtons(next);
    setActiveIndex(target);
    setDirty(true);
  }
  function handleRemoveButton(idx: number) {
    if (buttons.length <= 1) {
      message.warning('至少保留 1 个按钮（如要删除整张卡片请回到面板编辑器）');
      return;
    }
    modal.confirm({
      title: `删除按钮「${buttons[idx]?.label || `按钮 ${idx + 1}`}」？`,
      content: '本操作仅在编辑器内删除；点「应用到草稿」后才落 buffer。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        const next = buttons.filter((_, i) => i !== idx);
        setButtons(next);
        setActiveIndex((cur) => Math.min(cur, next.length - 1));
        setDirty(true);
      },
    });
  }

  // ----- ContentPicker 流程 -----
  async function openContentPicker(
    mode: 'play_video' | 'show_screen_image',
    exhibitId: number,
    currentContentId: number | null,
  ): Promise<number | null> {
    return new Promise<number | null>((resolve) => {
      setPickerState({
        open: true,
        mode,
        exhibitId,
        currentContentId,
        resolve,
      });
    });
  }

  function handlePickerSelect(contentId: number) {
    pickerState?.resolve?.(contentId);
    setPickerState(null);
  }
  function handlePickerCancel() {
    pickerState?.resolve?.(null);
    setPickerState(null);
  }

  // ----- Apply / Close -----
  function handleApply() {
    if (!card) return;
    if (validation.hasError) {
      const reason =
        validation.globalBlock ?? '请检查按钮配置（label / device / command / 内容步缺字段）';
      message.error(reason);
      // 跳到第一个错误按钮
      const firstErr = Object.keys(validation.errors).map(Number).sort((a, b) => a - b)[0];
      if (firstErr != null) setActiveIndex(firstErr);
      return;
    }
    onApply(card.id, buttonsToBinding(buttons));
    setDirty(false);
    message.success('已应用到草稿');
    onClose();
  }

  function handleClose() {
    if (dirty) {
      modal.confirm({
        title: '放弃未应用改动？',
        content: '编辑器内的改动尚未应用到 buffer，关闭将丢失。',
        okText: '放弃改动',
        cancelText: '继续编辑',
        onOk: () => {
          setDirty(false);
          onClose();
        },
      });
      return;
    }
    onClose();
  }

  // 切换活动卡（左栏导航）
  function handleActivateCard(secId: number, c: BufferCard) {
    if (c.card_type !== 'device_command') return; // PanelSectionNav 已 disable，但 host 再保险
    if (c.id === card?.id) return;
    if (dirty) {
      modal.confirm({
        title: '放弃未应用改动并切换按钮卡？',
        content: '当前按钮列表的改动未应用到 buffer，切换后将丢失。',
        okText: '放弃并切换',
        cancelText: '继续编辑',
        onOk: () => {
          setDirty(false);
          onActivateCard(secId, c);
        },
      });
      return;
    }
    onActivateCard(secId, c);
  }

  // 当前 card 标题（面包屑用）
  const sectionForCrumb = sections.find((s) => s.id === sectionId);
  const sectionName = sectionForCrumb?.name ?? '分区';

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      width="100%"
      destroyOnHidden
      data-testid="device-command-button-editor-v2"
      styles={{
        body: { padding: 24, background: 'var(--ant-color-bg-layout)' },
        header: { display: 'none' },
      }}
    >
      {/* ────────── PageHeader ────────── */}
      <div
        style={{
          background: 'var(--ant-color-bg-container)',
          border: '1px solid var(--ant-color-border-secondary)',
          borderRadius: 12,
          padding: '14px 20px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <Breadcrumb
            style={{ marginBottom: 6, fontSize: 12 }}
            items={[
              { title: '中控面板' },
              { title: `展厅 #${hallId}` },
              { title: '面板编辑器' },
              { title: sectionName },
              { title: 'device_command 卡' },
            ]}
          />
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 600,
              color: 'var(--ant-color-text)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <ToolOutlined style={{ color: 'var(--ant-color-primary)' }} />
            编辑设备命令卡片：按钮列表
            <Tag color="processing" style={{ margin: 0 }}>
              device_command 卡型
            </Tag>
            {dirty && (
              <Tag color="warning" data-testid="device-command-button-editor-dirty">
                未应用
              </Tag>
            )}
          </h2>
        </div>
        <Space>
          <Tooltip title="不应用任何改动，关闭编辑器">
            <Button
              icon={<CloseOutlined />}
              onClick={handleClose}
              data-testid="device-command-button-editor-cancel"
            >
              关闭
            </Button>
          </Tooltip>
          <Button
            type="primary"
            icon={<CheckOutlined />}
            onClick={handleApply}
            disabled={disabled || !dirty}
            data-testid="device-command-button-editor-apply"
          >
            应用到草稿
          </Button>
        </Space>
      </div>

      {!card ? (
        <Empty
          description="未选中 device_command 卡（请关闭后从面板编辑器入口进入）"
          style={{ padding: 80 }}
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '280px 240px 1fr',
            gap: 16,
            alignItems: 'start',
          }}
        >
          <PanelSectionNav
            sections={sections}
            activeCardId={card.id}
            onActivateCard={handleActivateCard}
          />

          <DeviceCommandButtonList
            buttons={buttons}
            activeIndex={activeIndex}
            onActivate={(i) => {
              setActiveIndex(i);
              setEditingStepIndex(null);
            }}
            onMove={handleMoveButton}
            onRemove={handleRemoveButton}
            onAdd={handleAddButton}
            disabled={disabled}
          />

          <div style={{ minWidth: 0 }}>
            {activeButton ? (
              <>
                <DeviceCommandButtonPreview button={activeButton} />
                <DeviceCommandButtonBasicInfo
                  label={activeButton.label}
                  icon={activeButton.icon ?? ''}
                  tooltip={activeButton.tooltip ?? ''}
                  errors={pickButtonErrors(activeErrors)}
                  disabled={disabled}
                  onChange={(patch) => patchActiveButton(patch)}
                />

                {/* ADR-0029：本按钮涉及 WOL 设备时显示兜底唤醒摘要 + 跳转设备编辑入口 */}
                <WolFallbackSummary
                  actions={activeButton.actions}
                  devices={devicesData ?? []}
                />

                <Card
                  size="small"
                  variant="outlined"
                  style={{ borderRadius: 12 }}
                  data-testid="device-command-button-action-list-card"
                  title={
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 14,
                      }}
                    >
                      <OrderedListOutlined />
                      动作列表（runbook actions）
                      <Tag style={{ margin: 0 }}>{activeButton.actions.length} 步</Tag>
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 12,
                          color: 'var(--ant-color-text-tertiary)',
                          fontWeight: 400,
                        }}
                      >
                        按时序串行执行 · 设备 + 数字内容混合
                      </span>
                    </span>
                  }
                >
                  <ActionStepListEditor
                    value={activeButton.actions}
                    onChange={patchActiveActions}
                    hallId={hallId}
                    devices={devices}
                    exhibits={exhibits}
                    scenes={scenes}
                    errors={stepErrorsForList}
                    onSelectContent={openContentPicker}
                    disabled={disabled}
                    editingIndex={editingStepIndex}
                    onEditingIndexChange={setEditingStepIndex}
                  />
                </Card>
              </>
            ) : (
              <Empty description="该卡尚无按钮，点击「新增按钮」开始" style={{ padding: 60 }} />
            )}
          </div>
        </div>
      )}

      {pickerState && (
        <ContentPicker
          open={pickerState.open}
          mode={pickerState.mode}
          hallId={hallId}
          exhibitId={pickerState.exhibitId}
          currentContentId={pickerState.currentContentId}
          onSelect={handlePickerSelect}
          onCancel={handlePickerCancel}
        />
      )}
    </Drawer>
  );
}

function pickButtonErrors(
  errs: Record<string, string>,
): Record<string, string> {
  // 仅取顶层 button 字段（label / icon / tooltip / actions），不带 actions.* 子键
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(errs)) {
    if (!k.includes('.')) out[k] = v;
  }
  return out;
}
