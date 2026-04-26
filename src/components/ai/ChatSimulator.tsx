import { useState, useRef, useEffect, useCallback } from 'react';
import { Button, Input, Switch, Tooltip } from 'antd';
import { useMessage } from '@/hooks/useMessage';
import { SoundOutlined, SendOutlined, LoadingOutlined, ClearOutlined } from '@ant-design/icons';
import { aiApi } from '@/api/ai';
import type { TestChatEvent, VideoType, PlayByTagResult, PlaylistItem } from '@/api/gen/client';

/* ─── Types ─── */
interface ToolCallInfo {
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
  dry_run: boolean;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCallInfo[];
  streaming?: boolean;
}

interface ChatSimulatorProps {
  exhibitId: number;
  hallId: number;
  voiceId?: string;
  speechRate?: number;
  onAvatarStateChange?: (state: VideoType) => void;
}

/* ─── SSE parser ─── */
function parseSSELine(line: string): { event?: string; data?: string } | null {
  if (line.startsWith('event: ')) return { event: line.slice(7).trim() };
  if (line.startsWith('data: ')) return { data: line.slice(6) };
  return null;
}

/* ─── Format time from ms ─── */
function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

/* ─── ToolCallCard ─── */
function ToolCallCard({ call }: { call: ToolCallInfo }) {
  if (call.name === 'play_by_tag' && !call.dry_run) {
    const result = call.result as PlayByTagResult;
    const tags = result?.matched_tags ?? [];
    const playlist = result?.playlist ?? [];
    return (
      <div style={{
        margin: '8px 0', padding: 10, borderRadius: 8,
        background: 'var(--ant-color-bg-layout)', fontSize: 13,
      }}>
        <div style={{ fontWeight: 500, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>search</span>
          play_by_tag("{String(call.arguments?.keyword ?? '')}")
        </div>

        {tags.length > 0 && (
          <div style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', marginBottom: 4 }}>命中标签:</div>
            {tags.map((t, i) => (
              <div key={i} style={{ fontSize: 12, paddingLeft: 8 }}>
                [{t.dimension}] "{t.tag}" 置信度 {t.confidence.toFixed(2)} × {t.count}段
              </div>
            ))}
          </div>
        )}

        {playlist.length > 0 && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', marginBottom: 4 }}>播放列表:</div>
            {playlist.map((item: PlaylistItem, i: number) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 12, paddingLeft: 8, marginBottom: 2,
              }}>
                <span>{i + 1}.</span>
                <span style={{ fontWeight: 500 }}>{item.content_name}</span>
                <span style={{ color: 'var(--ant-color-text-secondary)' }}>
                  {formatTime(item.start_ms)}-{formatTime(item.end_ms)}
                </span>
                <span style={{ color: 'var(--ant-color-text-tertiary)' }}>"{item.tag}"</span>
                {item.sprite_frame && (
                  <div style={{
                    width: 48, height: 27, borderRadius: 4, overflow: 'hidden',
                    flexShrink: 0, background: '#000',
                  }}>
                    <div style={{
                      width: '100%', height: '100%',
                      backgroundImage: `url(${item.sprite_frame.sheet_url})`,
                      backgroundPosition: `-${(item.sprite_frame.frame_index % 10) * 48}px -${Math.floor(item.sprite_frame.frame_index / 10) * 27}px`,
                      backgroundSize: 'auto',
                      imageRendering: 'auto',
                    }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Dry-run or other tools
  return (
    <div style={{
      margin: '8px 0', padding: 10, borderRadius: 8,
      background: 'var(--ant-color-bg-layout)', fontSize: 13,
    }}>
      <div style={{ fontWeight: 500, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>build</span>
        {call.name}({JSON.stringify(call.arguments)})
        {call.dry_run && (
          <span style={{
            fontSize: 11, padding: '1px 6px', borderRadius: 4,
            background: 'var(--ant-color-warning-bg)',
            color: 'var(--ant-color-warning-text)',
          }}>
            模拟执行
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>
        {typeof call.result === 'string' ? call.result : JSON.stringify(call.result)}
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
export default function ChatSimulator({
  exhibitId,
  hallId,
  voiceId,
  speechRate = 1.0,
  onAvatarStateChange,
}: ChatSimulatorProps) {
  const { message } = useMessage();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [autoVoice, setAutoVoice] = useState(false);
  const [playingMsgIdx, setPlayingMsgIdx] = useState<number | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sessionKeyRef = useRef(`debug_${Date.now()}`);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Reset session when exhibit changes
  useEffect(() => {
    setMessages([]);
    sessionKeyRef.current = `debug_${Date.now()}`;
    abortRef.current?.abort();
  }, [exhibitId]);

  const playTTS = useCallback(async (text: string, msgIdx: number) => {
    if (!voiceId || !text.trim()) return;

    // Stop any current playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    try {
      setPlayingMsgIdx(msgIdx);
      onAvatarStateChange?.('talking');
      const res = await aiApi.synthesizeSpeech({ text, voice_id: voiceId, speech_rate: speechRate });
      const { audio_url } = res.data.data;
      const audio = new Audio(audio_url);
      audioRef.current = audio;
      audio.onended = () => {
        setPlayingMsgIdx(null);
        onAvatarStateChange?.('idle');
        audioRef.current = null;
      };
      audio.onerror = () => {
        setPlayingMsgIdx(null);
        onAvatarStateChange?.('idle');
        audioRef.current = null;
        message.error('语音播放失败');
      };
      audio.play();
    } catch {
      setPlayingMsgIdx(null);
      onAvatarStateChange?.('idle');
      message.error('TTS 合成失败');
    }
  }, [voiceId, speechRate, onAvatarStateChange]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || streaming) return;

    setInputText('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);

    // Switch to thinking state
    onAvatarStateChange?.('thinking');
    setStreaming(true);

    const abortController = new AbortController();
    abortRef.current = abortController;

    // Add placeholder assistant message
    const assistantIdx = messages.length + 1; // +1 for the user message we just added
    setMessages((prev) => [...prev, { role: 'assistant', content: '', toolCalls: [], streaming: true }]);

    let currentEvent = '';
    let fullText = '';

    try {
      const response = await aiApi.testChat(
        exhibitId,
        hallId,
        { text, session_key: sessionKeyRef.current },
        abortController.signal,
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No stream body');

      const decoder = new TextDecoder();
      let buffer = '';
      let firstTextReceived = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            currentEvent = '';
            continue;
          }

          const parsed = parseSSELine(trimmed);
          if (!parsed) continue;

          if (parsed.event !== undefined) {
            currentEvent = parsed.event;
            continue;
          }

          if (parsed.data === undefined) continue;

          let eventData: TestChatEvent;
          try {
            const jsonData = JSON.parse(parsed.data);
            eventData = { type: currentEvent || jsonData.type, ...jsonData } as TestChatEvent;
          } catch {
            continue;
          }

          switch (eventData.type) {
            case 'thinking':
              // Keep thinking state
              break;

            case 'text_delta': {
              if (!firstTextReceived) {
                firstTextReceived = true;
                onAvatarStateChange?.('talking');
              }
              fullText += eventData.content;
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, content: fullText };
                }
                return updated;
              });
              break;
            }

            case 'tool_call': {
              const toolCall: ToolCallInfo = {
                name: eventData.name,
                arguments: eventData.arguments,
                result: eventData.result,
                dry_run: eventData.dry_run,
              };
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === 'assistant') {
                  updated[updated.length - 1] = {
                    ...last,
                    toolCalls: [...(last.toolCalls ?? []), toolCall],
                  };
                }
                return updated;
              });
              break;
            }

            case 'done': {
              fullText = eventData.full_text;
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, content: fullText, streaming: false };
                }
                return updated;
              });

              // Auto voice
              if (autoVoice && voiceId && fullText.trim()) {
                playTTS(fullText, assistantIdx);
              } else {
                onAvatarStateChange?.('idle');
              }
              break;
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        message.error('对话请求失败');
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === 'assistant' && last.streaming) {
            updated[updated.length - 1] = { ...last, content: last.content || '（请求失败）', streaming: false };
          }
          return updated;
        });
      }
      onAvatarStateChange?.('idle');
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [inputText, streaming, exhibitId, hallId, messages.length, onAvatarStateChange, autoVoice, voiceId, playTTS]);

  const handleClear = () => {
    abortRef.current?.abort();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setMessages([]);
    setStreaming(false);
    setPlayingMsgIdx(null);
    sessionKeyRef.current = `debug_${Date.now()}`;
    onAvatarStateChange?.('idle');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 300 }}>
      {/* Header with auto-voice toggle */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 0 8px', borderBottom: '1px solid var(--ant-color-border-secondary)',
        marginBottom: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <Switch
            size="small"
            checked={autoVoice}
            onChange={setAutoVoice}
            disabled={!voiceId}
          />
          <span style={{ color: autoVoice ? 'var(--ant-color-text)' : 'var(--ant-color-text-tertiary)' }}>
            {autoVoice ? '🔊 自动语音' : '🔇 静音'}
          </span>
        </div>
        <Button
          type="text"
          size="small"
          icon={<ClearOutlined />}
          onClick={handleClear}
          disabled={messages.length === 0 && !streaming}
        >
          清空
        </Button>
      </div>

      {/* Messages area */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '4px 0',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {messages.length === 0 && (
          <div style={{
            textAlign: 'center', color: 'var(--ant-color-text-quaternary)',
            padding: 40, fontSize: 13,
          }}>
            输入消息开始对话
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              alignItems: 'flex-start',
              gap: 8,
            }}
          >
            {msg.role === 'assistant' && (
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: 'var(--ant-color-primary-bg)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--ant-color-primary)' }}>
                  smart_toy
                </span>
              </div>
            )}

            <div style={{ maxWidth: '80%', minWidth: 0 }}>
              <div style={{
                padding: '8px 12px',
                borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                background: msg.role === 'user'
                  ? 'var(--ant-color-primary)'
                  : 'var(--ant-color-bg-layout)',
                color: msg.role === 'user' ? '#fff' : 'var(--ant-color-text)',
                fontSize: 14, lineHeight: 1.6, wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
                position: 'relative',
              }}>
                {msg.content}
                {msg.streaming && !msg.content && (
                  <span style={{ color: 'var(--ant-color-text-quaternary)' }}>
                    <LoadingOutlined style={{ marginRight: 4 }} />
                    思考中...
                  </span>
                )}

                {/* Tool call cards */}
                {msg.toolCalls?.map((call, ci) => (
                  <ToolCallCard key={ci} call={call} />
                ))}

                {/* TTS button for assistant messages */}
                {msg.role === 'assistant' && !msg.streaming && msg.content && voiceId && (
                  <Tooltip title={playingMsgIdx === idx ? '播放中...' : '播放语音'}>
                    <Button
                      type="text"
                      size="small"
                      icon={playingMsgIdx === idx ? <LoadingOutlined /> : <SoundOutlined />}
                      disabled={playingMsgIdx !== null && playingMsgIdx !== idx}
                      onClick={() => {
                        if (playingMsgIdx === idx) {
                          // Stop current
                          if (audioRef.current) {
                            audioRef.current.pause();
                            audioRef.current = null;
                          }
                          setPlayingMsgIdx(null);
                          onAvatarStateChange?.('idle');
                        } else {
                          playTTS(msg.content, idx);
                        }
                      }}
                      style={{
                        position: 'absolute', top: 2, right: 2,
                        color: 'var(--ant-color-text-tertiary)',
                      }}
                    />
                  </Tooltip>
                )}
              </div>
            </div>

            {msg.role === 'user' && (
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: 'var(--ant-color-success-bg)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--ant-color-success)' }}>
                  person
                </span>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div style={{
        display: 'flex', gap: 8, paddingTop: 8,
        borderTop: '1px solid var(--ant-color-border-secondary)',
      }}>
        <Input
          placeholder="输入消息..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onPressEnter={handleSend}
          disabled={streaming}
          style={{ flex: 1 }}
        />
        <Button
          type="primary"
          icon={streaming ? <LoadingOutlined /> : <SendOutlined />}
          onClick={handleSend}
          disabled={!inputText.trim() || streaming}
        >
          发送
        </Button>
      </div>
    </div>
  );
}
