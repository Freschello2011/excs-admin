import { useState, useCallback } from 'react';
import { useMessage } from '@/hooks/useMessage';
import { showApi } from '@/api/show';

export type RehearsalStatus = 'idle' | 'starting' | 'running' | 'paused';

/**
 * 排练（预演）控制 hook
 * 管理排练状态并调用后端排练 API
 */
export function useRehearsal(showId: number) {
  const { message } = useMessage();
  const [status, setStatus] = useState<RehearsalStatus>('idle');
  const [loading, setLoading] = useState(false);

  const start = useCallback(async () => {
    setLoading(true);
    try {
      await showApi.rehearse(showId, 'start');
      setStatus('running');
      message.success('排练已开始');
    } catch (err: any) {
      message.error('排练启动失败: ' + (err?.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  }, [showId]);

  const pause = useCallback(async () => {
    setLoading(true);
    try {
      await showApi.rehearse(showId, 'pause');
      setStatus('paused');
      message.info('排练已暂停');
    } catch (err: any) {
      message.error('排练暂停失败: ' + (err?.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  }, [showId]);

  const stop = useCallback(async () => {
    setLoading(true);
    try {
      await showApi.rehearse(showId, 'stop');
      setStatus('idle');
      message.info('排练已停止');
    } catch (err: any) {
      message.error('排练停止失败: ' + (err?.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  }, [showId]);

  return { status, loading, start, pause, stop };
}
