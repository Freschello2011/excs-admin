/**
 * SceneEditPage v2 — ADR-0020-v2 Stage 5 admin Phase B host（Phase D 解锁 · S5-10）
 *
 * 路由：/halls/:hallId/scenes/:sceneId/edit
 * SSOT：admin-UI §4.20.4 + mockup M1（07-ui/mockup/08-runbook-v2/01-admin-scene-editor.html）
 *
 * 布局：
 *   [PageHeader] 面包屑 + 标题(场景名 + 类型 chip) + actions[立即试运行 / 取消 / 保存]
 *   [KPI 行]    4 块：动作总数 / 总执行时长(估) / 前置条件 / 上次发布
 *   [两栏]
 *     ├─ 左 268px sticky：场景列表卡（icon + 名 + 步数 + 切换 + 新建）
 *     └─ 右 编辑区：基本信息卡 + 动作列表卡（host <ActionStepListEditor>）
 *
 * Save schema（S5-10 解锁后）：
 *   - command.yaml#SceneAction 已升级为 allOf [ActionStep, {id}]；server typed-handler
 *     sceneActionsToDTO 全字段映射（device + content 分支 + delay + preconditions + friendly）
 *   - admin save 直接送 ActionStep[]（无 v1 降级）；type=content 步亦能落库
 *   - read 时 GET /scenes/:id 直接返 ActionStep[]，本地 ActionStep === gen.SceneAction（去 id）
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Link,
  useNavigate,
  useParams,
  useBlocker,
} from 'react-router-dom';
import {
  Breadcrumb,
  Button,
  Card,
  Empty,
  Space,
  Spin,
  Tag,
  Tooltip,
} from 'antd';
import {
  CloudUploadOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  OrderedListOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { commandClient } from '@/api/gen/client';
import { commandApi } from '@/api/command';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import { useMessage } from '@/hooks/useMessage';
import { useCan } from '@/lib/authz/can';
import type {
  SceneListItem,
  SceneDetail,
  SceneAction,
  UpdateSceneRequest,
} from '@/api/gen/client';
import ActionStepListEditor from '@/pages/_shared/runbook/ActionStepListEditor';
import type { ActionStep } from '@/pages/_shared/runbook/types';
import ContentPicker, {
  type ContentPickerMode,
} from '@/pages/panel/components/ContentPicker';
import SceneBasicInfoCard, {
  type SceneBasicValues,
} from './components/SceneBasicInfoCard';
import SceneKpiStrip from './components/SceneKpiStrip';

// ============================================================
// SceneAction (gen) ↔ ActionStep (本地) 转换
//
// S5-10 yaml 解锁后 SceneAction === ActionStep + {id?}，本地 ActionStep 是同形子集
// （不含 id，所有字段名/类型一致）。两个方向只是 cast + 补/剥 id；不再有 device-only 限制。
// ============================================================

function sceneActionsToSteps(actions: SceneAction[]): ActionStep[] {
  return actions.map(
    ({ id, ...rest }) => rest as ActionStep, // eslint-disable-line @typescript-eslint/no-unused-vars
  );
}

function stepsToSceneActions(steps: ActionStep[]): SceneAction[] {
  return steps as SceneAction[];
}

// ============================================================
// Page
// ============================================================

export default function SceneEditPage() {
  const params = useParams<{ hallId: string; sceneId: string }>();
  const hallId = Number(params.hallId);
  const sceneId = Number(params.sceneId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message, modal } = useMessage();

  const canEdit = useCan(
    'scene.edit',
    Number.isFinite(hallId) ? { type: 'hall', id: String(hallId) } : undefined,
  );

  // ----- 数据加载 -----
  const sceneDetailQuery = useQuery({
    queryKey: queryKeys.sceneDetail(sceneId),
    queryFn: () => commandClient.getScene(sceneId),
    enabled: Number.isFinite(sceneId) && sceneId > 0,
  });

  // 注意：与 SceneListPage 共享同一 queryKey；后者用 commandApi.getScenes（AxiosResponse 包壳）+
  // select 解包。本页若直接走 commandClient.listScenes 拿到 unwrapped 数组，会和缓存里的
  // AxiosResponse 对象形态错位 —— 从 /scenes 列表点编辑跳本页时 sceneList 会是 AxiosResponse
  // 而非数组，导致 sceneList.map 抛 "scenes.map is not a function"。统一走 commandApi 包壳。
  const sceneListQuery = useQuery({
    queryKey: queryKeys.scenes(hallId),
    queryFn: () => commandApi.getScenes(hallId),
    select: (res) => res.data.data,
    enabled: Number.isFinite(hallId) && hallId > 0,
  });

  const devicesQuery = useQuery({
    queryKey: queryKeys.devices({ hall_id: hallId } as Record<string, unknown>),
    queryFn: () => hallApi.getDevices({ hall_id: hallId }),
    select: (res) => res.data.data ?? [],
    enabled: Number.isFinite(hallId) && hallId > 0,
  });

  // 同 sceneListQuery：与 AdminLayout 共享 queryKeys.exhibits(hallId) 缓存，AdminLayout 走
  // hallApi.getExhibits（AxiosResponse 包壳）+ select 解包。统一形态，否则缓存命中时
  // exhibitsQuery.data 会是 AxiosResponse 而非数组。
  const exhibitsQuery = useQuery({
    queryKey: queryKeys.exhibits(hallId),
    queryFn: () => hallApi.getExhibits(hallId),
    select: (res) => res.data.data,
    enabled: Number.isFinite(hallId) && hallId > 0,
  });

  // ----- 编辑态 -----
  const [basic, setBasic] = useState<SceneBasicValues>({
    name: '',
    icon: 'bulb',
    scene_type: 'preset',
    sort_order: 1,
  });
  const [steps, setSteps] = useState<ActionStep[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const initRef = useRef<SceneDetail | null>(null);
  const [pickerState, setPickerState] = useState<{
    open: boolean;
    mode: ContentPickerMode;
    exhibitId: number;
    currentContentId: number | null;
    resolve: ((id: number | null) => void) | null;
  } | null>(null);

  // 装载 detail → 初始化 form（载入新 detail 时 reset 编辑态）
  // 用 ref 守住"已初始化的 sceneId"，避免 setState 死循环；不能 derive 走 useMemo —
  // 编辑过程中 user 改 basic / steps，不应被服务器响应反复覆盖。
  const sceneDetail = sceneDetailQuery.data;
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!sceneDetail) return;
    if (initRef.current?.id === sceneDetail.id) return;
    initRef.current = sceneDetail;
    setBasic({
      name: sceneDetail.name,
      icon: sceneDetail.icon,
      scene_type: sceneDetail.scene_type,
      sort_order: sceneDetail.sort_order,
    });
    setSteps(sceneActionsToSteps(sceneDetail.actions ?? []));
    setDirty(false);
    setErrors({});
  }, [sceneDetail]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function patchBasic(next: SceneBasicValues) {
    setBasic(next);
    setDirty(true);
  }
  function patchSteps(next: ActionStep[]) {
    setSteps(next);
    setDirty(true);
  }

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

  // ----- mutations -----
  const updateMutation = useMutation({
    mutationFn: (body: UpdateSceneRequest) =>
      commandClient.updateScene(sceneId, body),
    onSuccess: () => {
      message.success('已保存');
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.scenes(hallId) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.sceneDetail(sceneId),
      });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`保存失败：${msg}`);
    },
  });

  const switchMutation = useMutation({
    mutationFn: () => commandClient.switchScene(sceneId),
    onSuccess: () => {
      message.success('已下发场景切换');
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`试运行失败：${msg}`);
    },
  });

  // ----- 校验 -----
  function validate(): {
    basicErrors: Record<string, string>;
    stepErrors: Record<string, string>;
  } {
    const be: Record<string, string> = {};
    if (!basic.name.trim()) be.name = '场景名称必填';
    if (!Number.isFinite(basic.sort_order) || basic.sort_order < 1) {
      be.sort_order = '排序必须 ≥ 1';
    }
    const se: Record<string, string> = {};
    steps.forEach((s, i) => {
      if (s.type === 'device') {
        if (!s.device_id) se[`${i}.device_id`] = '请选择设备';
        if (!s.command) se[`${i}.command`] = '请选择命令';
      } else if (s.type === 'content') {
        if (!s.exhibit_id) se[`${i}.exhibit_id`] = '请选择展项';
        if (!s.content_intent) se[`${i}.content_intent`] = '请选择动作';
      }
    });
    return { basicErrors: be, stepErrors: se };
  }

  function handleSave() {
    const { basicErrors, stepErrors } = validate();
    const merged: Record<string, string> = { ...basicErrors, ...stepErrors };
    setErrors(merged);
    if (Object.keys(merged).length > 0) {
      message.error('表单存在错误，请修正后再保存');
      return;
    }
    updateMutation.mutate({
      name: basic.name.trim(),
      icon: basic.icon,
      sort_order: basic.sort_order,
      scene_type: basic.scene_type,
      actions: stepsToSceneActions(steps),
    });
  }

  function handleSwitch() {
    if (dirty) {
      modal.confirm({
        title: '存在未保存改动',
        content: '试运行将下发"上次保存"的版本，是否继续？',
        okText: '继续试运行',
        cancelText: '取消',
        onOk: () => switchMutation.mutate(),
      });
      return;
    }
    switchMutation.mutate();
  }

  function handleCancel() {
    if (dirty) {
      modal.confirm({
        title: '放弃未保存改动？',
        content: '当前编辑尚未保存，离开将丢失改动。',
        okText: '放弃改动',
        cancelText: '继续编辑',
        onOk: () => navigate('/scenes'),
      });
      return;
    }
    navigate('/scenes');
  }

  // ----- 路由 dirty 守卫 -----
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (!dirty) return false;
    return currentLocation.pathname !== nextLocation.pathname;
  });
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    modal.confirm({
      title: '放弃未保存改动？',
      content: '当前编辑尚未保存，离开将丢失改动。',
      okText: '放弃改动',
      cancelText: '继续编辑',
      onOk: () => blocker.proceed(),
      onCancel: () => blocker.reset(),
    });
  }, [blocker, modal]);

  // ----- 场景列表 sticky 数据 -----
  const sceneList: SceneListItem[] = useMemo(
    () => sceneListQuery.data ?? [],
    [sceneListQuery.data],
  );

  const isLoading = sceneDetailQuery.isLoading || !sceneDetailQuery.data;
  const detail = sceneDetailQuery.data;

  if (!Number.isFinite(hallId) || !Number.isFinite(sceneId)) {
    return (
      <Empty description="路径参数缺失" style={{ padding: '120px 0' }} />
    );
  }

  const updatedAt =
    (detail as (SceneDetail & { updated_at?: string }) | undefined)?.updated_at ??
    null;

  return (
    <div style={{ paddingBottom: 32 }}>
      {/* ────────── PageHeader（面包屑 + 标题 + 操作） ────────── */}
      <div style={{ marginBottom: 16 }}>
        <Breadcrumb
          style={{ marginBottom: 8 }}
          items={[
            { title: <Link to="/halls">展厅</Link> },
            { title: <Link to={`/halls/${hallId}`}>展厅 #{hallId}</Link> },
            { title: <Link to="/scenes">场景管理</Link> },
            { title: detail?.name ?? `场景 #${sceneId}` },
          ]}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 600,
                margin: 0,
                color: 'var(--ant-color-text)',
              }}
              data-testid="scene-edit-title"
            >
              {detail?.name ?? '加载中…'}
            </h1>
            {detail && (
              <Tag color="processing" style={{ margin: 0 }}>
                {detail.scene_type}
              </Tag>
            )}
            {dirty && (
              <Tag color="warning" data-testid="scene-edit-dirty">
                未保存
              </Tag>
            )}
          </div>
          <Space>
            <Tooltip title="向当前展厅下发场景切换（使用上次保存版本）">
              <Button
                icon={<PlayCircleOutlined />}
                onClick={handleSwitch}
                loading={switchMutation.isPending}
                disabled={!canEdit}
                data-testid="scene-edit-switch"
              >
                立即试运行
              </Button>
            </Tooltip>
            <Button onClick={handleCancel} data-testid="scene-edit-cancel">
              取消
            </Button>
            <Button
              type="primary"
              icon={<CloudUploadOutlined />}
              onClick={handleSave}
              loading={updateMutation.isPending}
              disabled={!canEdit || !dirty}
              data-testid="scene-edit-save"
            >
              保存
            </Button>
          </Space>
        </div>
      </div>

      {/* ────────── KPI ────────── */}
      <SceneKpiStrip steps={steps} updatedAt={updatedAt} />

      {/* ────────── 主体：左 sticky 列表 + 右编辑 ────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '268px 1fr',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <SceneListSidebar
          scenes={sceneList}
          activeId={sceneId}
          hallId={hallId}
          onSelect={(id) => {
            if (id === sceneId) return;
            navigate(`/halls/${hallId}/scenes/${id}/edit`);
          }}
          loading={sceneListQuery.isLoading}
        />

        <div>
          <SceneBasicInfoCard
            value={basic}
            onChange={patchBasic}
            errors={errors}
            disabled={!canEdit}
          />

          <Card
            size="small"
            variant="outlined"
            data-testid="scene-edit-action-list-card"
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
                动作列表
                <Tag style={{ margin: 0 }}>{steps.length} 步</Tag>
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 12,
                    color: 'var(--ant-color-text-tertiary)',
                    fontWeight: 400,
                  }}
                >
                  按时间顺序串行执行 · 前置条件不满足时仅警告并继续
                </span>
              </span>
            }
            style={{ borderRadius: 12 }}
          >
            {isLoading ? (
              <div style={{ padding: '40px 0', textAlign: 'center' }}>
                <Spin />
              </div>
            ) : (
              <ActionStepListEditor
                value={steps}
                onChange={patchSteps}
                hallId={hallId}
                devices={(devicesQuery.data ?? []).map((d) => ({
                  id: d.id,
                  name: d.name,
                }))}
                exhibits={(exhibitsQuery.data ?? []).map((e) => ({
                  id: e.id,
                  name: e.name,
                }))}
                scenes={sceneList.map((s) => ({ id: s.id, name: s.name }))}
                errors={Object.fromEntries(
                  Object.entries(errors).filter(([k]) => /^\d+\./.test(k)),
                )}
                onSelectContent={openContentPicker}
                disabled={!canEdit}
                editingIndex={editingIndex}
                onEditingIndexChange={setEditingIndex}
              />
            )}
          </Card>
        </div>
      </div>

      {pickerState && (
        <ContentPicker
          open={pickerState.open}
          mode={pickerState.mode}
          hallId={hallId}
          exhibitId={pickerState.exhibitId}
          exhibitName={
            (exhibitsQuery.data ?? []).find(
              (e) => e.id === pickerState.exhibitId,
            )?.name
          }
          currentContentId={pickerState.currentContentId}
          onSelect={handlePickerSelect}
          onCancel={handlePickerCancel}
        />
      )}
    </div>
  );
}

// ============================================================
// 左 sticky：场景列表卡
// ============================================================

interface SidebarProps {
  scenes: SceneListItem[];
  activeId: number;
  hallId: number;
  onSelect: (id: number) => void;
  loading: boolean;
}

function SceneListSidebar({
  scenes,
  activeId,
  hallId,
  onSelect,
  loading,
}: SidebarProps) {
  return (
    <Card
      size="small"
      variant="outlined"
      data-testid="scene-edit-sidebar"
      style={{
        position: 'sticky',
        top: 16,
        borderRadius: 12,
        maxHeight: 'calc(100vh - 32px)',
        overflowY: 'auto',
      }}
      title={
        <span style={{ fontSize: 13, fontWeight: 600 }}>场景模式</span>
      }
    >
      {loading ? (
        <div style={{ padding: '20px 0', textAlign: 'center' }}>
          <Spin size="small" />
        </div>
      ) : scenes.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无场景"
          style={{ padding: '12px 0' }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {scenes.map((s) => {
            const active = s.id === activeId;
            return (
              <button
                key={s.id}
                type="button"
                data-testid={`scene-edit-sidebar-item-${s.id}`}
                onClick={() => onSelect(s.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  border: '1px solid',
                  borderColor: active
                    ? 'var(--ant-color-primary)'
                    : 'var(--ant-color-border-secondary)',
                  background: active
                    ? 'var(--ant-color-primary-bg)'
                    : 'transparent',
                  borderRadius: 8,
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  font: 'inherit',
                  color: active
                    ? 'var(--ant-color-primary)'
                    : 'var(--ant-color-text)',
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--ant-color-text-tertiary)',
                    width: 16,
                  }}
                >
                  {s.icon ? '·' : ''}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: 13,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.name}
                </span>
                <Tag style={{ margin: 0, fontSize: 11 }}>{s.action_count}</Tag>
              </button>
            );
          })}
        </div>
      )}

      <Link to={`/scenes`} style={{ display: 'block', marginTop: 12 }}>
        <Button
          type="dashed"
          block
          icon={<PlusOutlined />}
          size="small"
          data-testid="scene-edit-sidebar-new"
        >
          返回列表 / 新建场景
        </Button>
      </Link>
      <input type="hidden" data-testid="scene-edit-sidebar-hall" value={hallId} />
    </Card>
  );
}
