/**
 * device-mgmt-v2 P9-E.2 — 直连模式配置弹窗（点 ConnectStatusPill 触发）。
 *
 * 功能：
 *   - 输入展厅 App 局域网地址（http://192.168.x.x:9900）+ token
 *   - [测试连接] → /diag/version 4s 超时
 *   - [保存] 不切模式
 *   - [立即切到本地] 保存并切 mode='lan'
 *   - [回到云端] 切 mode='cloud' 并触发 flushPendingWrites（异步、有冲突弹冲突 modal）
 *   - 列出 pendingWrites 数量；提供 [立即同步] 重试入口
 *
 * 红线：lanToken 用 sessionStorage（关浏览器即清；本期最简实现）—— 不入 localStorage 明文。
 */
import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, Space, Tag, Alert, List, Typography } from 'antd';
import { useMessage } from '@/hooks/useMessage';
import { useDirectConnect } from '@/stores/directConnectStore';
import { flushPendingWrites, testLanConnection } from '@/api/request';
import { listPending, type PendingOp } from '@/utils/pendingWriteDB';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function LanConfigDialog({ open, onClose }: Props) {
  const { message, modal } = useMessage();
  const mode = useDirectConnect((s) => s.mode);
  const lanAddress = useDirectConnect((s) => s.lanAddress);
  const lanToken = useDirectConnect((s) => s.lanToken);
  const pendingCount = useDirectConnect((s) => s.pendingCount);
  const setLanConfig = useDirectConnect((s) => s.setLanConfig);
  const switchToLan = useDirectConnect((s) => s.switchToLan);
  const switchToCloud = useDirectConnect((s) => s.switchToCloud);
  const refreshPending = useDirectConnect((s) => s.refreshPendingCount);

  const [addr, setAddr] = useState(lanAddress ?? '');
  const [token, setToken] = useState(lanToken ?? '');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    | { ok: true; version: string }
    | { ok: false; error: string }
    | null
  >(null);
  const [flushing, setFlushing] = useState(false);
  const [pendingList, setPendingList] = useState<PendingOp[]>([]);

  useEffect(() => {
    if (!open) return;
    setAddr(lanAddress ?? '');
    setToken(lanToken ?? '');
    setTestResult(null);
    void listPending().then(setPendingList);
    void refreshPending();
  }, [open, lanAddress, lanToken, refreshPending]);

  const validAddr = useMemo(() => /^https?:\/\/[\w.\-:]+$/.test(addr.trim()), [addr]);
  const canSave = validAddr && token.trim().length > 0;

  const handleTest = async () => {
    if (!canSave) {
      message.warning('请先填地址和 token');
      return;
    }
    setTesting(true);
    setTestResult(null);
    const r = await testLanConnection(addr.trim(), token.trim());
    setTestResult(r);
    setTesting(false);
  };

  const handleSave = () => {
    if (!canSave) return;
    setLanConfig(addr.trim(), token.trim());
    message.success('已保存（token 仅本会话有效，关浏览器即清）');
  };

  const handleSwitchLan = () => {
    if (!canSave) {
      message.warning('请先填并测试连接');
      return;
    }
    setLanConfig(addr.trim(), token.trim());
    switchToLan();
    onClose();
  };

  const handleSwitchCloud = async () => {
    await switchToCloud();
    if (pendingCount > 0) {
      void runFlush();
    }
    onClose();
  };

  const runFlush = async () => {
    setFlushing(true);
    try {
      const report = await flushPendingWrites();
      const succ = report.succeeded.length;
      const conflicts = report.conflicts.length;
      const failed = report.failed.length;
      if (succ > 0) message.success(`已同步 ${succ} 条暂存写入`);
      if (failed > 0) message.warning(`${failed} 条同步失败，可稍后重试`);
      void refreshPending();
      void listPending().then(setPendingList);
      for (const c of report.conflicts) {
        await new Promise<void>((resolve) => {
          modal.confirm({
            title: `冲突：${c.op.description}`,
            content: (
              <div>
                <p>
                  云端版本与你本地暂存的修改冲突。
                </p>
                <p style={{ fontSize: 12, color: '#888' }}>
                  {c.serverError.message ?? `HTTP ${c.serverError.status ?? '?'}`}
                </p>
              </div>
            ),
            okText: '保留本地（再次提交，可能覆盖云端）',
            cancelText: '保留云端（丢弃本地暂存）',
            onOk: async () => {
              // retry once with `If-Match: *` style — 简单实现：不带版本号直接再 PUT
              try {
                const { default: req } = await import('@/api/request');
                await req.request({
                  method: c.op.method,
                  url: c.op.url,
                  data: c.op.data,
                  params: c.op.params,
                  skipErrorMessage: true,
                  _isFlushingPending: true,
                });
                const { removePending } = await import('@/utils/pendingWriteDB');
                await removePending(c.op.id);
                message.success(`已用本地版本覆盖：${c.op.description}`);
              } catch {
                message.error(`覆盖失败：${c.op.description}`);
              }
              await refreshPending();
              resolve();
            },
            onCancel: async () => {
              const { removePending } = await import('@/utils/pendingWriteDB');
              await removePending(c.op.id);
              message.info(`已丢弃本地暂存：${c.op.description}`);
              await refreshPending();
              resolve();
            },
          });
        });
      }
      if (conflicts === 0 && succ > 0 && failed === 0) {
        // all clean
      }
    } finally {
      setFlushing(false);
      void listPending().then(setPendingList);
    }
  };

  return (
    <Modal
      open={open}
      title="直连配置 / 模式切换"
      onCancel={onClose}
      width={520}
      footer={null}
      destroyOnClose
    >
      <div>
        <div style={{ marginBottom: 16 }}>
          <Tag color={mode === 'cloud' ? 'success' : mode === 'lan' ? 'gold' : 'error'}>
            当前模式：{mode === 'cloud' ? '云端' : mode === 'lan' ? '本地直连' : '断开'}
          </Tag>
          {pendingCount > 0 && (
            <Tag color="error" style={{ marginLeft: 8 }}>
              {pendingCount} 笔待同步
            </Tag>
          )}
        </div>

        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="直连模式说明"
          description="云端不可达时直连展厅 App 9900 端口。能继续：设备调试 / 看 retained 状态 / 试跑场景。受限：改设备配置 / 改触发器（暂存到本地，恢复后自动同步）。"
        />

        <Typography.Text strong>展厅 App 局域网地址</Typography.Text>
        <Input
          style={{ marginTop: 6, marginBottom: 12 }}
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          placeholder="http://192.168.50.10:9900"
        />

        <Typography.Text strong>Diag Token</Typography.Text>
        <Input.Password
          style={{ marginTop: 6, marginBottom: 12 }}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="展厅 App 9900 token（仅本会话保留）"
        />

        <Space style={{ marginBottom: 16 }}>
          <Button onClick={handleTest} loading={testing} disabled={!canSave}>
            测试连接
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            保存
          </Button>
        </Space>
        {testResult && (
          <div style={{ marginBottom: 16 }}>
            {testResult.ok ? (
              <Alert
                type="success"
                showIcon
                message={`连接 OK — 展厅 App 版本 ${testResult.version}`}
              />
            ) : (
              <Alert type="error" showIcon message={`连接失败：${testResult.error}`} />
            )}
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--ant-color-border-secondary)', paddingTop: 12 }}>
          <Space wrap>
            <Button type="primary" onClick={handleSwitchLan} disabled={!canSave || mode === 'lan'}>
              立即切到本地直连
            </Button>
            <Button onClick={handleSwitchCloud} disabled={mode === 'cloud'}>
              切回云端{pendingCount > 0 ? `（同步 ${pendingCount} 条暂存）` : ''}
            </Button>
            {pendingCount > 0 && (
              <Button onClick={runFlush} loading={flushing}>
                立即同步暂存
              </Button>
            )}
          </Space>
        </div>

        {pendingList.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <Typography.Text strong>暂存的写操作（{pendingList.length}）</Typography.Text>
            <List
              size="small"
              style={{ marginTop: 8, maxHeight: 200, overflow: 'auto' }}
              dataSource={pendingList}
              renderItem={(op) => (
                <List.Item>
                  <span style={{ fontSize: 12 }}>{op.description}</span>
                  <span style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary)' }}>
                    {new Date(op.ts).toLocaleTimeString('zh-CN', { hour12: false })}
                  </span>
                </List.Item>
              )}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
