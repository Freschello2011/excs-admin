import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button, Spin, Space, Breadcrumb, Card, List, Input, InputNumber,
  Select, Popconfirm, Empty, Divider, Tooltip, Tag,
} from 'antd';
import { useMessage } from '@/hooks/useMessage';
import {
  PlusOutlined, DeleteOutlined, SaveOutlined, AimOutlined,
  NodeIndexOutlined, PlayCircleOutlined,
} from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import { hallApi } from '@/api/hall';
import { contentApi } from '@/api/content';
import { commandApi } from '@/api/command';
import { queryKeys } from '@/api/queryKeys';
import type { NavNode, HotZone, HotZoneRegion, NavTransition } from '@/api/gen/client';

/* ─── Helper: generate unique node key ─── */
let keyCounter = 0;
function generateNodeKey(): string {
  keyCounter += 1;
  return `node_${Date.now()}_${keyCounter}`;
}

/* ─── Hot Zone Overlay Component ─── */
interface HotZoneOverlayProps {
  hotZones: HotZone[];
  nodes: NavNode[];
  onAdd: (region: HotZoneRegion) => void;
  onUpdate: (index: number, region: HotZoneRegion) => void;
  onSelect: (index: number) => void;
  selectedIndex: number | null;
}

function HotZoneOverlay({
  hotZones, nodes,
  onAdd, onUpdate, onSelect, selectedIndex,
}: HotZoneOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState<{ idx: number; offsetX: number; offsetY: number } | null>(null);
  const [resizing, setResizing] = useState<{ idx: number; edge: string } | null>(null);

  const getRelativePos = useCallback((e: React.MouseEvent) => {
    const rect = overlayRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const pos = getRelativePos(e);
    // Check if clicking on existing zone
    for (let i = hotZones.length - 1; i >= 0; i--) {
      const z = hotZones[i].region;
      const xPct = z.x_pct / 100;
      const yPct = z.y_pct / 100;
      const wPct = z.w_pct / 100;
      const hPct = z.h_pct / 100;
      // Check resize handle (bottom-right corner)
      if (
        Math.abs(pos.x - (xPct + wPct)) < 0.02 &&
        Math.abs(pos.y - (yPct + hPct)) < 0.02
      ) {
        setResizing({ idx: i, edge: 'br' });
        onSelect(i);
        e.preventDefault();
        return;
      }
      // Check if inside zone
      if (pos.x >= xPct && pos.x <= xPct + wPct && pos.y >= yPct && pos.y <= yPct + hPct) {
        setDragging({ idx: i, offsetX: pos.x - xPct, offsetY: pos.y - yPct });
        onSelect(i);
        e.preventDefault();
        return;
      }
    }
    // Start drawing new zone
    setDrawing(true);
    setDrawStart(pos);
    setDrawCurrent(pos);
    onSelect(-1);
    e.preventDefault();
  }, [hotZones, getRelativePos, onSelect]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (drawing && drawStart) {
      setDrawCurrent(getRelativePos(e));
    } else if (dragging) {
      const pos = getRelativePos(e);
      const zone = hotZones[dragging.idx].region;
      const wPct = zone.w_pct / 100;
      const hPct = zone.h_pct / 100;
      let newX = pos.x - dragging.offsetX;
      let newY = pos.y - dragging.offsetY;
      newX = Math.max(0, Math.min(1 - wPct, newX));
      newY = Math.max(0, Math.min(1 - hPct, newY));
      onUpdate(dragging.idx, {
        x_pct: Math.round(newX * 10000) / 100,
        y_pct: Math.round(newY * 10000) / 100,
        w_pct: zone.w_pct,
        h_pct: zone.h_pct,
      });
    } else if (resizing) {
      const pos = getRelativePos(e);
      const zone = hotZones[resizing.idx].region;
      const xPct = zone.x_pct / 100;
      const yPct = zone.y_pct / 100;
      const newW = Math.max(0.02, pos.x - xPct);
      const newH = Math.max(0.02, pos.y - yPct);
      onUpdate(resizing.idx, {
        x_pct: zone.x_pct,
        y_pct: zone.y_pct,
        w_pct: Math.round(Math.min(1 - xPct, newW) * 10000) / 100,
        h_pct: Math.round(Math.min(1 - yPct, newH) * 10000) / 100,
      });
    }
  }, [drawing, drawStart, dragging, resizing, hotZones, getRelativePos, onUpdate]);

  const handleMouseUp = useCallback(() => {
    if (drawing && drawStart && drawCurrent) {
      const x1 = Math.min(drawStart.x, drawCurrent.x);
      const y1 = Math.min(drawStart.y, drawCurrent.y);
      const x2 = Math.max(drawStart.x, drawCurrent.x);
      const y2 = Math.max(drawStart.y, drawCurrent.y);
      const w = x2 - x1;
      const h = y2 - y1;
      if (w > 0.01 && h > 0.01) {
        onAdd({
          x_pct: Math.round(x1 * 10000) / 100,
          y_pct: Math.round(y1 * 10000) / 100,
          w_pct: Math.round(w * 10000) / 100,
          h_pct: Math.round(h * 10000) / 100,
        });
      }
    }
    setDrawing(false);
    setDrawStart(null);
    setDrawCurrent(null);
    setDragging(null);
    setResizing(null);
  }, [drawing, drawStart, drawCurrent, onAdd]);

  const getNodeName = (nodeKey: string) => {
    const node = nodes.find((n) => n.node_key === nodeKey);
    return node ? (node as NavNode & { _name?: string })._name || nodeKey : nodeKey;
  };

  return (
    <div
      ref={overlayRef}
      style={{
        position: 'absolute', inset: 0, cursor: drawing ? 'crosshair' : 'default',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Existing hot zones */}
      {hotZones.map((hz, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${hz.region.x_pct}%`,
            top: `${hz.region.y_pct}%`,
            width: `${hz.region.w_pct}%`,
            height: `${hz.region.h_pct}%`,
            border: `2px solid ${selectedIndex === i ? '#1677ff' : '#52c41a'}`,
            backgroundColor: selectedIndex === i ? 'rgba(22,119,255,0.2)' : 'rgba(82,196,26,0.15)',
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            color: '#fff',
            textShadow: '0 1px 2px rgba(0,0,0,0.8)',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          <span style={{ pointerEvents: 'none' }}>
            {hz.target_node_key ? getNodeName(hz.target_node_key) : '未设置'}
          </span>
          {/* Resize handle */}
          <div
            style={{
              position: 'absolute', right: -4, bottom: -4,
              width: 8, height: 8, background: '#1677ff',
              borderRadius: 1, cursor: 'nwse-resize', pointerEvents: 'auto',
            }}
          />
        </div>
      ))}
      {/* Drawing preview */}
      {drawing && drawStart && drawCurrent && (() => {
        const x1 = Math.min(drawStart.x, drawCurrent.x);
        const y1 = Math.min(drawStart.y, drawCurrent.y);
        const w = Math.abs(drawCurrent.x - drawStart.x);
        const h = Math.abs(drawCurrent.y - drawStart.y);
        return (
          <div
            style={{
              position: 'absolute',
              left: `${x1 * 100}%`, top: `${y1 * 100}%`,
              width: `${w * 100}%`, height: `${h * 100}%`,
              border: '2px dashed #1677ff',
              backgroundColor: 'rgba(22,119,255,0.1)',
              pointerEvents: 'none',
            }}
          />
        );
      })()}
    </div>
  );
}

/* ─── Navigation Graph Visualization ─── */
interface NavGraphVisProps {
  nodes: NavNode[];
  selectedNodeKey: string | null;
  onSelectNode: (key: string) => void;
}

function NavGraphVisualization({ nodes, selectedNodeKey, onSelectNode }: NavGraphVisProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Layout nodes in a circle
    const cx = W / 2;
    const cy = H / 2;
    const radius = Math.min(W, H) * 0.35;
    const nodePositions: Record<string, { x: number; y: number }> = {};

    nodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
      nodePositions[node.node_key] = {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      };
    });

    // Draw edges (arrows)
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1.5;
    nodes.forEach((node) => {
      const from = nodePositions[node.node_key];
      if (!from) return;
      const targets = new Set<string>();
      (node.hot_zones || []).forEach((hz) => {
        if (hz.target_node_key) targets.add(hz.target_node_key);
      });
      if (node.timeout_target_node_key) targets.add(node.timeout_target_node_key);

      targets.forEach((targetKey) => {
        const to = nodePositions[targetKey];
        if (!to) return;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) return;
        const nx = dx / dist;
        const ny = dy / dist;
        const startX = from.x + nx * 22;
        const startY = from.y + ny * 22;
        const endX = to.x - nx * 22;
        const endY = to.y - ny * 22;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Arrow head
        const arrowSize = 8;
        const arrowAngle = Math.atan2(endY - startY, endX - startX);
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          endX - arrowSize * Math.cos(arrowAngle - 0.4),
          endY - arrowSize * Math.sin(arrowAngle - 0.4),
        );
        ctx.lineTo(
          endX - arrowSize * Math.cos(arrowAngle + 0.4),
          endY - arrowSize * Math.sin(arrowAngle + 0.4),
        );
        ctx.closePath();
        ctx.fillStyle = '#999';
        ctx.fill();
      });
    });

    // Draw nodes
    nodes.forEach((node) => {
      const pos = nodePositions[node.node_key];
      if (!pos) return;
      const isSelected = node.node_key === selectedNodeKey;
      const isRoot = node.is_root;

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 20, 0, 2 * Math.PI);
      ctx.fillStyle = isSelected ? '#1677ff' : isRoot ? '#52c41a' : '#f0f0f0';
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#1677ff' : isRoot ? '#52c41a' : '#d9d9d9';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Node label
      ctx.fillStyle = isSelected || isRoot ? '#fff' : '#333';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const name = node.node_name || node.node_key;
      const displayName = name.length > 6 ? name.slice(0, 6) + '…' : name;
      ctx.fillText(displayName, pos.x, pos.y);
    });
  }, [nodes, selectedNodeKey]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const radius = Math.min(W, H) * 0.35;

    for (let i = 0; i < nodes.length; i++) {
      const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
      const nx = cx + radius * Math.cos(angle);
      const ny = cy + radius * Math.sin(angle);
      if (Math.sqrt((x - nx) ** 2 + (y - ny) ** 2) < 20) {
        onSelectNode(nodes[i].node_key);
        return;
      }
    }
  }, [nodes, onSelectNode]);

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={300}
      style={{ width: '100%', height: 300, border: '1px solid #f0f0f0', borderRadius: 6, cursor: 'pointer' }}
      onClick={handleCanvasClick}
    />
  );
}

/* ─── Main Page ─── */
export default function TouchNavEditorPage() {
  const { message } = useMessage();
  const { hallId: hallIdStr, exhibitId: exhibitIdStr } = useParams<{ hallId: string; exhibitId: string }>();
  const hallId = Number(hallIdStr);
  const exhibitId = Number(exhibitIdStr);
  const queryClient = useQueryClient();

  const [nodes, setNodes] = useState<NavNode[]>([]);
  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null);
  const [selectedHotZoneIdx, setSelectedHotZoneIdx] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);

  // Fetch hall info
  const { data: hall } = useQuery({
    queryKey: queryKeys.hallDetail(hallId),
    queryFn: () => hallApi.getHall(hallId),
    select: (res) => res.data.data,
    enabled: hallId > 0,
  });

  // Fetch exhibits
  const { data: exhibits = [] } = useQuery({
    queryKey: queryKeys.exhibits(hallId),
    queryFn: () => hallApi.getExhibits(hallId),
    select: (res) => res.data.data,
    enabled: hallId > 0,
  });

  const exhibit = exhibits.find((e) => e.id === exhibitId);

  // Fetch exhibit content (for video selection dropdown)
  const { data: contentItems = [] } = useQuery({
    queryKey: queryKeys.exhibitContent(exhibitId),
    queryFn: () => contentApi.getExhibitContent(exhibitId),
    select: (res) => res.data.data,
    enabled: exhibitId > 0,
  });

  const videoItems = useMemo(
    () => contentItems.filter((c) => c.type === 'video'),
    [contentItems],
  );

  // Fetch existing touch nav graph
  const { data: touchNavData, isLoading } = useQuery({
    queryKey: queryKeys.touchNav(exhibitId),
    queryFn: () => commandApi.getTouchNav(hallId, exhibitId),
    select: (res) => res.data.data,
    enabled: exhibitId > 0,
  });

  // Sync fetched data into local state
  const [dataLoaded, setDataLoaded] = useState(false);
  useEffect(() => {
    if (touchNavData && !dataLoaded) {
      if (touchNavData.nodes) {
        setNodes(touchNavData.nodes.map((n, i) => ({
          ...n,
          hot_zones: n.hot_zones || [],
          node_name: n.node_name || `节点 ${i + 1}`,
        })));
      }
      setDirty(false);
      setDataLoaded(true);
    }
  }, [touchNavData, dataLoaded]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: () => commandApi.saveTouchNav(hallId, exhibitId, { exhibit_id: exhibitId, nodes }),
    onSuccess: () => {
      message.success('导航图已保存');
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.touchNav(exhibitId) });
    },
    onError: () => message.error('保存失败'),
  });

  const selectedNode = nodes.find((n) => n.node_key === selectedNodeKey) || null;

  // ─── Node CRUD ───
  const addNode = () => {
    const key = generateNodeKey();
    const isFirst = nodes.length === 0;
    const newNode: NavNode = {
      node_key: key,
      node_name: `节点 ${nodes.length + 1}`,
      content_id: 0,
      start_ms: 0,
      end_ms: 0,
      is_root: isFirst,
      idle_timeout_sec: 30,
      timeout_target_node_key: '',
      hot_zones: [],
    };
    setNodes([...nodes, newNode]);
    setSelectedNodeKey(key);
    setSelectedHotZoneIdx(null);
    setDirty(true);
  };

  const deleteNode = (key: string) => {
    setNodes(nodes.filter((n) => n.node_key !== key));
    if (selectedNodeKey === key) {
      setSelectedNodeKey(null);
      setSelectedHotZoneIdx(null);
    }
    setDirty(true);
  };

  const updateNode = (key: string, patch: Partial<NavNode>) => {
    setNodes(nodes.map((n) => (n.node_key === key ? { ...n, ...patch } : n)));
    setDirty(true);
  };

  const setRootNode = (key: string) => {
    setNodes(nodes.map((n) => ({ ...n, is_root: n.node_key === key })));
    setDirty(true);
  };

  // ─── Hot Zone CRUD ───
  const addHotZone = (region: HotZoneRegion) => {
    if (!selectedNodeKey) return;
    const node = nodes.find((n) => n.node_key === selectedNodeKey);
    if (!node) return;
    const newZone: HotZone = { region, target_node_key: '', transition: 'cut' };
    updateNode(selectedNodeKey, { hot_zones: [...node.hot_zones, newZone] });
    setSelectedHotZoneIdx(node.hot_zones.length);
  };

  const updateHotZoneRegion = (index: number, region: HotZoneRegion) => {
    if (!selectedNode) return;
    const updated = [...selectedNode.hot_zones];
    updated[index] = { ...updated[index], region };
    updateNode(selectedNodeKey!, { hot_zones: updated });
  };

  const updateHotZoneProp = (index: number, patch: Partial<HotZone>) => {
    if (!selectedNode) return;
    const updated = [...selectedNode.hot_zones];
    updated[index] = { ...updated[index], ...patch };
    updateNode(selectedNodeKey!, { hot_zones: updated });
    setDirty(true);
  };

  const deleteHotZone = (index: number) => {
    if (!selectedNode) return;
    const updated = selectedNode.hot_zones.filter((_, i) => i !== index);
    updateNode(selectedNodeKey!, { hot_zones: updated });
    setSelectedHotZoneIdx(null);
  };

  // Get thumbnail for selected node
  const selectedContent = selectedNode
    ? contentItems.find((c) => c.content_id === selectedNode.content_id)
    : null;
  const thumbnailUrl = selectedContent?.thumbnail_url || '';

  if (isLoading) {
    return <Spin style={{ display: 'flex', justifyContent: 'center', marginTop: 120 }} />;
  }

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/halls">展厅列表</Link> },
          { title: <Link to={`/halls/${hallId}/exhibit-management`}>{hall?.name || `展厅 ${hallId}`}</Link> },
          { title: <Link to={`/halls/${hallId}/exhibit-management/${exhibitId}`}>{exhibit?.name || `展项 ${exhibitId}`}</Link> },
          { title: '触摸导航编辑' },
        ]}
      />

      <PageHeader
        title="触摸导航编辑器"
        description={exhibit?.name}
        extra={
          <Space>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saveMutation.isPending}
              disabled={!dirty}
              onClick={() => saveMutation.mutate()}
            >
              保存
            </Button>
          </Space>
        }
      />

      <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
        {/* ─── Left: Video Frame + Hot Zone Overlay ─── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Card title={selectedNode ? `热区编辑 — ${selectedNode.node_name || selectedNode.node_key}` : '热区编辑'} size="small">
            <div
              style={{
                position: 'relative',
                width: '100%',
                paddingBottom: '56.25%', // 16:9 aspect ratio
                backgroundColor: '#1a1a2e',
                borderRadius: 4,
                overflow: 'hidden',
              }}
            >
              {thumbnailUrl ? (
                <img
                  src={thumbnailUrl}
                  alt="视频帧"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
                  draggable={false}
                />
              ) : (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', color: '#666',
                }}>
                  {selectedNode ? (selectedNode.content_id ? '加载缩略图...' : '请选择关联视频') : '请选择一个节点'}
                </div>
              )}
              {selectedNode && (
                <HotZoneOverlay
                  hotZones={selectedNode.hot_zones}
                  nodes={nodes}
                  onAdd={addHotZone}
                  onUpdate={updateHotZoneRegion}
                  onSelect={setSelectedHotZoneIdx}
                  selectedIndex={selectedHotZoneIdx}
                />
              )}
            </div>
            {selectedNode && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
                提示：在视频帧上拖拽绘制新热区，拖拽移动已有热区，右下角拖拽调整大小
              </div>
            )}
          </Card>

          {/* ─── Graph Visualization ─── */}
          <Card title="导航图可视化" size="small" style={{ marginTop: 16 }}>
            {nodes.length > 0 ? (
              <NavGraphVisualization
                nodes={nodes}
                selectedNodeKey={selectedNodeKey}
                onSelectNode={setSelectedNodeKey}
              />
            ) : (
              <Empty description="暂无节点" />
            )}
            <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
              <Tag color="green">绿色</Tag> 根节点
              <Tag color="blue" style={{ marginLeft: 8 }}>蓝色</Tag> 选中节点
              <span style={{ marginLeft: 8 }}>箭头表示跳转方向</span>
            </div>
          </Card>
        </div>

        {/* ─── Right: Node List + Properties ─── */}
        <div style={{ width: 380, flexShrink: 0 }}>
          {/* Node List */}
          <Card
            title="导航节点"
            size="small"
            extra={
              <Button type="link" icon={<PlusOutlined />} onClick={addNode}>
                新增节点
              </Button>
            }
          >
            {nodes.length === 0 ? (
              <Empty description="点击新增节点开始" />
            ) : (
              <List
                size="small"
                dataSource={nodes}
                renderItem={(node) => (
                  <List.Item
                    style={{
                      cursor: 'pointer',
                      backgroundColor: node.node_key === selectedNodeKey ? '#e6f4ff' : undefined,
                      borderRadius: 4,
                      padding: '6px 8px',
                    }}
                    onClick={() => { setSelectedNodeKey(node.node_key); setSelectedHotZoneIdx(null); }}
                    actions={[
                      <Tooltip key="root" title="设为根节点">
                        <Button
                          type="text"
                          size="small"
                          icon={<AimOutlined />}
                          style={{ color: node.is_root ? '#52c41a' : undefined }}
                          onClick={(e) => { e.stopPropagation(); setRootNode(node.node_key); }}
                        />
                      </Tooltip>,
                      <Popconfirm
                        key="del"
                        title="确定删除此节点？"
                        onConfirm={(e) => { e?.stopPropagation(); deleteNode(node.node_key); }}
                        onCancel={(e) => e?.stopPropagation()}
                      >
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </Popconfirm>,
                    ]}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                      {node.is_root && <Tag color="green" style={{ margin: 0 }}>根</Tag>}
                      <NodeIndexOutlined style={{ color: '#999' }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {node.node_name || node.node_key}
                      </span>
                      {node.content_id > 0 && (
                        <PlayCircleOutlined style={{ color: '#1677ff', marginLeft: 'auto' }} />
                      )}
                    </div>
                  </List.Item>
                )}
              />
            )}
          </Card>

          {/* Node Properties Panel */}
          {selectedNode && (
            <Card title="节点属性" size="small" style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>节点名称</div>
                  <Input
                    value={selectedNode.node_name || ''}
                    onChange={(e) => updateNode(selectedNodeKey!, { node_name: e.target.value })}
                    placeholder="节点名称"
                    size="small"
                  />
                </div>

                <div>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>关联视频</div>
                  <Select
                    value={selectedNode.content_id || undefined}
                    onChange={(val) => updateNode(selectedNodeKey!, { content_id: val })}
                    placeholder="选择视频"
                    size="small"
                    style={{ width: '100%' }}
                    allowClear
                    options={videoItems.map((v) => ({
                      value: v.content_id,
                      label: v.filename,
                    }))}
                  />
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>开始 (ms)</div>
                    <InputNumber
                      value={selectedNode.start_ms}
                      onChange={(val) => updateNode(selectedNodeKey!, { start_ms: val || 0 })}
                      min={0}
                      size="small"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>结束 (ms)</div>
                    <InputNumber
                      value={selectedNode.end_ms}
                      onChange={(val) => updateNode(selectedNodeKey!, { end_ms: val || 0 })}
                      min={0}
                      size="small"
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>空闲超时 (秒)</div>
                    <InputNumber
                      value={selectedNode.idle_timeout_sec}
                      onChange={(val) => updateNode(selectedNodeKey!, { idle_timeout_sec: val || 30 })}
                      min={0}
                      size="small"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>超时跳转节点</div>
                    <Select
                      value={selectedNode.timeout_target_node_key || undefined}
                      onChange={(val) => updateNode(selectedNodeKey!, { timeout_target_node_key: val || '' })}
                      placeholder="选择节点"
                      size="small"
                      style={{ width: '100%' }}
                      allowClear
                      options={nodes
                        .filter((n) => n.node_key !== selectedNodeKey)
                        .map((n) => ({
                          value: n.node_key,
                          label: n.node_name || n.node_key,
                        }))}
                    />
                  </div>
                </div>

                <Divider style={{ margin: '8px 0' }} />

                {/* Hot Zones List */}
                <div>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                    <span>热区列表 ({selectedNode.hot_zones.length})</span>
                  </div>
                  {selectedNode.hot_zones.length === 0 ? (
                    <div style={{ color: '#999', fontSize: 12 }}>在左侧视频帧上拖拽创建热区</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {selectedNode.hot_zones.map((hz, i) => (
                        <div
                          key={i}
                          style={{
                            padding: '6px 8px',
                            border: `1px solid ${selectedHotZoneIdx === i ? '#1677ff' : '#f0f0f0'}`,
                            borderRadius: 4,
                            backgroundColor: selectedHotZoneIdx === i ? '#f0f7ff' : '#fafafa',
                            cursor: 'pointer',
                          }}
                          onClick={() => setSelectedHotZoneIdx(i)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 11, color: '#999' }}>
                              ({hz.region.x_pct.toFixed(1)}%, {hz.region.y_pct.toFixed(1)}%) {hz.region.w_pct.toFixed(1)}%×{hz.region.h_pct.toFixed(1)}%
                            </span>
                            <Popconfirm title="删除此热区？" onConfirm={() => deleteHotZone(i)}>
                              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <Select
                              value={hz.target_node_key || undefined}
                              onChange={(val) => updateHotZoneProp(i, { target_node_key: val || '' })}
                              placeholder="目标节点"
                              size="small"
                              style={{ flex: 1 }}
                              allowClear
                              options={nodes
                                .filter((n) => n.node_key !== selectedNodeKey)
                                .map((n) => ({
                                  value: n.node_key,
                                  label: n.node_name || n.node_key,
                                }))}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <Select
                              value={hz.transition}
                              onChange={(val) => updateHotZoneProp(i, { transition: val as NavTransition })}
                              size="small"
                              style={{ width: 80 }}
                              options={[
                                { value: 'cut', label: '切换' },
                                { value: 'fade', label: '淡入' },
                              ]}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
