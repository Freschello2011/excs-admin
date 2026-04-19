import { PT } from '../previewTokens';

/**
 * v2.0 AI 互动卡：玻璃 + 顶部"启动 AI"青霓虹按钮 + 内陷气泡区 + 底部输入栏。
 * 对齐 mockup `.ai` / `.btn.primary` / `.ai .stage` / `.ai input`。
 */
export default function AiCard() {
  return (
    <div
      style={{
        padding: PT.cardPadding,
        background: PT.glassFill,
        border: `1px solid ${PT.glassStroke}`,
        borderRadius: PT.radiusCard,
        backdropFilter: PT.blur,
        WebkitBackdropFilter: PT.blur,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* 标题 + 操作 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: PT.neonCyan, fontSize: 15 }}>💬</span>
          <span style={{ fontSize: 15, fontWeight: 600, color: PT.textPrimary }}>AI 互动</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <PrimaryBtn>启动 AI</PrimaryBtn>
          <GhostBtn>关闭</GhostBtn>
        </div>
      </div>

      {/* 气泡区（空态） */}
      <div
        style={{
          flex: 1,
          minHeight: 110,
          borderRadius: 12,
          background: PT.glassInset,
          border: `1px solid ${PT.glassStrokeWeak}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: PT.textDisabled,
          fontSize: 13,
        }}
      >
        启动 AI 后可开始对话
      </div>

      {/* 输入栏 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
        <div
          style={{
            flex: 1,
            height: 38,
            padding: '0 12px',
            borderRadius: 10,
            background: PT.glassInset,
            border: `1px solid ${PT.glassStroke}`,
            color: PT.textDisabled,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          输入文字...
        </div>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${PT.glassStroke}`,
            color: PT.textSecondary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
          }}
        >
          🎤
        </div>
        <PrimaryBtn>发送</PrimaryBtn>
      </div>
    </div>
  );
}

function PrimaryBtn({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '7px 14px',
        borderRadius: 10,
        background: 'linear-gradient(135deg, #6ad2ff, #26BFF7)',
        color: '#06131e',
        fontSize: 13,
        fontWeight: 600,
        boxShadow: '0 0 14px rgba(38,191,247,0.5), 0 0 28px rgba(38,191,247,0.2)',
      }}
    >
      {children}
    </div>
  );
}

function GhostBtn({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '7px 14px',
        borderRadius: 10,
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${PT.glassStroke}`,
        color: PT.textSecondary,
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}
