import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from 'antd';
import styles from './AiAvatarPreview.module.scss';

interface AiAvatarPreviewProps {
  idleName?: string;
  thinkingName?: string;
  talkingName?: string;
}

type StateKey = 'idle' | 'thinking' | 'talking';

const STATES: { key: StateKey; label: string; icon: string }[] = [
  { key: 'idle', label: '待机', icon: 'self_improvement' },
  { key: 'thinking', label: '思考', icon: 'psychology' },
  { key: 'talking', label: '说话', icon: 'record_voice_over' },
];

/** 每个状态高亮持续时间（ms） */
const DURATIONS: Record<StateKey, number> = {
  idle: 3000,
  thinking: 2000,
  talking: 3000,
};

export default function AiAvatarPreview({ idleName, thinkingName, talkingName }: AiAvatarPreviewProps) {
  const [simulating, setSimulating] = useState(false);
  const [activeState, setActiveState] = useState<StateKey | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const nameMap: Record<StateKey, string | undefined> = {
    idle: idleName,
    thinking: thinkingName,
    talking: talkingName,
  };

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
    };
  }, [clearTimer]);

  const runCycle = useCallback((index: number) => {
    if (!mountedRef.current) return;
    const state = STATES[index % STATES.length];
    setActiveState(state.key);
    timerRef.current = setTimeout(() => {
      runCycle(index + 1);
    }, DURATIONS[state.key]);
  }, []);

  const handleToggle = useCallback(() => {
    if (simulating) {
      clearTimer();
      setSimulating(false);
      setActiveState(null);
    } else {
      setSimulating(true);
      runCycle(0);
    }
  }, [simulating, clearTimer, runCycle]);

  return (
    <div className={styles.preview}>
      <div className={styles.previewTitle}>状态流转预览</div>

      {/* Three state cards with arrows */}
      <div className={styles.stateFlow}>
        {STATES.map((s, i) => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center' }}>
            <div className={`${styles.stateCard}${activeState === s.key ? ` ${styles.active}` : ''}`}>
              <span className={`material-symbols-outlined ${styles.stateIcon}`}>{s.icon}</span>
              <div className={styles.stateName}>{s.label}</div>
              <div className={styles.videoName}>{nameMap[s.key] || '未配置'}</div>
            </div>
            {i < STATES.length - 1 && (
              <div className={styles.arrow}>
                <span className="material-symbols-outlined">arrow_forward</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Return arrow (talking -> idle) */}
      <div className={styles.returnArrow}>
        <div className={styles.returnPath}>
          <span className={styles.returnLabel}>对话结束后回到待机</span>
        </div>
      </div>

      {/* Simulate button */}
      <div className={styles.simulateBtn}>
        <Button
          type={simulating ? 'default' : 'primary'}
          ghost={!simulating}
          onClick={handleToggle}
          icon={<span className="material-symbols-outlined" style={{ fontSize: 18, marginRight: 4 }}>{simulating ? 'stop' : 'play_arrow'}</span>}
        >
          {simulating ? '停止演示' : '模拟演示'}
        </Button>
      </div>
    </div>
  );
}
