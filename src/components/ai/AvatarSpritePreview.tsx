import { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Space, Spin } from 'antd';
import type { SpriteSheet, VideoType } from '@/types/ai';

interface SpriteGroupProps {
  spriteSheets: SpriteSheet[];
  /** Base URL for sprite images, e.g. /api/v1/ai/avatar-templates/1/sprites/idle/ */
  baseUrl: string;
  active: boolean;
}

/** Single sprite layer — CSS step animation via background-position */
function SpriteLayer({ spriteSheets, baseUrl, active }: SpriteGroupProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef(0);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef(0);
  const [loaded, setLoaded] = useState(false);

  const sheet = spriteSheets[0]; // Typical AI avatar = 1 sheet per state

  // Preload sprite image
  useEffect(() => {
    if (!sheet) return;
    setLoaded(false);
    const img = new Image();
    img.onload = () => setLoaded(true);
    img.onerror = () => setLoaded(false);
    img.src = `${baseUrl}${sheet.file}`;
  }, [sheet, baseUrl]);

  // Animate with requestAnimationFrame
  useEffect(() => {
    if (!sheet || !loaded || !canvasRef.current) return;

    const { cols, frame_count, frame_width, frame_height, frame_interval_ms } = sheet;
    frameRef.current = 0;
    lastTimeRef.current = 0;

    const animate = (time: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = time;
      const elapsed = time - lastTimeRef.current;

      if (elapsed >= frame_interval_ms) {
        frameRef.current = (frameRef.current + 1) % frame_count;
        lastTimeRef.current = time;

        const col = frameRef.current % cols;
        const row = Math.floor(frameRef.current / cols);
        if (canvasRef.current) {
          canvasRef.current.style.backgroundPosition =
            `-${col * frame_width}px -${row * frame_height}px`;
        }
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [sheet, loaded]);

  if (!sheet) return null;

  return (
    <div
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: sheet.frame_width,
        height: sheet.frame_height,
        backgroundImage: loaded ? `url(${baseUrl}${sheet.file})` : undefined,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: '0 0',
        zIndex: active ? 3 : 1,
        opacity: active ? 1 : 0,
        transition: 'opacity 0.3s ease',
      }}
    />
  );
}

interface AvatarSpritePreviewProps {
  idleSpriteSheets?: SpriteSheet[];
  thinkingSpriteSheets?: SpriteSheet[];
  talkingSpriteSheets?: SpriteSheet[];
  /** Template ID, used to build sprite proxy URLs */
  templateId: number;
  /** Controlled state from outside (e.g. chat simulator) */
  activeState?: VideoType;
  /** Auto-cycle mode */
  autoPlay?: boolean;
}

const STATE_LABELS: Record<VideoType, string> = {
  idle: '待机',
  thinking: '思考',
  talking: '说话',
};

export default function AvatarSpritePreview({
  idleSpriteSheets,
  thinkingSpriteSheets,
  talkingSpriteSheets,
  templateId,
  activeState: controlledState,
  autoPlay = false,
}: AvatarSpritePreviewProps) {
  const [internalState, setInternalState] = useState<VideoType>('idle');
  const activeState = controlledState ?? internalState;
  const autoCycleRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const hasSheets = idleSpriteSheets?.length || thinkingSpriteSheets?.length || talkingSpriteSheets?.length;
  const frameWidth = idleSpriteSheets?.[0]?.frame_width ?? 640;
  const frameHeight = idleSpriteSheets?.[0]?.frame_height ?? 360;

  const buildBaseUrl = useCallback(
    (_type: VideoType) => `https://excs-thumbnail.oss-cn-beijing.aliyuncs.com/avatar-templates/${templateId}/`,
    [templateId],
  );

  // Auto-cycle: idle 3s -> thinking 2s -> talking 3s -> loop
  useEffect(() => {
    if (!autoPlay || controlledState) return;

    const cycle = () => {
      setInternalState((prev) => {
        switch (prev) {
          case 'idle': return 'thinking';
          case 'thinking': return 'talking';
          case 'talking': return 'idle';
        }
      });
    };

    const getDelay = (state: VideoType) => {
      switch (state) {
        case 'idle': return 3000;
        case 'thinking': return 2000;
        case 'talking': return 3000;
      }
    };

    const scheduleNext = () => {
      autoCycleRef.current = setTimeout(() => {
        cycle();
        scheduleNext();
      }, getDelay(internalState));
    };

    scheduleNext();
    return () => clearTimeout(autoCycleRef.current);
  }, [autoPlay, controlledState, internalState]);

  if (!hasSheets) {
    return (
      <div
        style={{
          width: '100%',
          maxWidth: frameWidth,
          aspectRatio: `${frameWidth}/${frameHeight}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--ant-color-bg-layout)',
          borderRadius: 8,
          color: 'var(--ant-color-text-quaternary)',
        }}
      >
        <Spin tip="等待雪碧图加载..." />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
      {/* Sprite container */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: frameWidth,
          aspectRatio: `${frameWidth}/${frameHeight}`,
          overflow: 'hidden',
          borderRadius: 8,
          background: 'var(--ant-color-bg-layout)',
        }}
      >
        {idleSpriteSheets?.length ? (
          <SpriteLayer
            spriteSheets={idleSpriteSheets}
            baseUrl={buildBaseUrl('idle')}
            active={activeState === 'idle'}
          />
        ) : null}
        {thinkingSpriteSheets?.length ? (
          <SpriteLayer
            spriteSheets={thinkingSpriteSheets}
            baseUrl={buildBaseUrl('thinking')}
            active={activeState === 'thinking'}
          />
        ) : null}
        {talkingSpriteSheets?.length ? (
          <SpriteLayer
            spriteSheets={talkingSpriteSheets}
            baseUrl={buildBaseUrl('talking')}
            active={activeState === 'talking'}
          />
        ) : null}
      </div>

      {/* Controls */}
      {!controlledState && (
        <Space size="small">
          {(['idle', 'thinking', 'talking'] as const).map((state) => (
            <Button
              key={state}
              size="small"
              type={activeState === state ? 'primary' : 'default'}
              onClick={() => setInternalState(state)}
            >
              {STATE_LABELS[state]}
            </Button>
          ))}
        </Space>
      )}

      {/* Status indicator */}
      <div style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>
        <span
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            marginRight: 4,
            background:
              activeState === 'idle'
                ? 'var(--ant-color-success)'
                : activeState === 'thinking'
                  ? 'var(--ant-color-warning)'
                  : 'var(--ant-color-primary)',
          }}
        />
        {STATE_LABELS[activeState]}
      </div>
    </div>
  );
}
