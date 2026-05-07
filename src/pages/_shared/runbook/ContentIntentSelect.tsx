/**
 * <ContentIntentSelect> — 数字内容动作的"动作"下拉
 *
 * SSOT：admin-UI §4.20.1 行 846 + §4.20.2 表（8 高频意图）；mockup M1 line 935-981
 *
 * 行为：
 *   - 8 高频意图（默认展开 · 部署人员视角不出 play_cmd 名）
 *   - 切换意图时回调 onChange(value, defaultParams)，由父组件清空旧 content_params
 *   - 分组 label「高频动作（部署人员视角）」+ 底部"高级"折叠组（暂用 antd disabled
 *     option 占位提示，本 phase 不实装高级模式 —— admin-UI §4.20.2 末段允许；
 *     避免本 session 越界进入 WidgetRenderer 通用 schema 驱动渲染）
 *   - 422 detail 命中 `/steps/N/content_intent` 时 status="error"
 */

import { useMemo } from 'react';
import { Select } from 'antd';
import {
  PlayCircleOutlined,
  PictureOutlined,
  StopOutlined,
  PauseCircleOutlined,
  FastForwardOutlined,
  SoundOutlined,
  CloseCircleOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { CONTENT_INTENT_META, type ContentIntent, type ContentIntentMeta } from './types';

interface Props {
  value: ContentIntent | null | undefined;
  /** 第二参数 defaultParams 提示父组件应清空旧 params 并按新意图初始化 */
  onChange: (next: ContentIntent, defaultParams: Record<string, unknown>) => void;
  error?: string | null;
  disabled?: boolean;
  /** 自定义宽度；缺省 100% */
  width?: number | string;
}

const ICON_MAP: Record<ContentIntent, React.ReactNode> = {
  play_video: <PlayCircleOutlined />,
  slideshow_goto: <AppstoreOutlined />,
  show_screen_image: <PictureOutlined />,
  clear_screen_image: <CloseCircleOutlined />,
  pause_resume: <PauseCircleOutlined />,
  stop: <StopOutlined />,
  seek: <FastForwardOutlined />,
  set_volume: <SoundOutlined />,
};

function defaultParamsFor(intent: ContentIntent): Record<string, unknown> {
  switch (intent) {
    case 'play_video':
    case 'show_screen_image':
      return {}; // ContentPicker 后回填 {content_id}
    case 'slideshow_goto':
      return {}; // SlideshowImagePicker 后回填 {index}
    case 'seek':
      return { position_ms: 0 };
    case 'set_volume':
      return { volume: 80 };
    case 'clear_screen_image':
    case 'pause_resume':
    case 'stop':
      return {};
  }
}

export default function ContentIntentSelect({
  value,
  onChange,
  error,
  disabled,
  width,
}: Props) {
  const options = useMemo(
    () => [
      {
        label: (
          <span style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary)' }}>
            高频动作（部署人员视角）
          </span>
        ),
        title: '高频动作',
        options: CONTENT_INTENT_META.map((meta: ContentIntentMeta) => ({
          value: meta.value,
          label: (
            <span
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              data-testid={`content-intent-option-${meta.value}`}
            >
              <span style={{ color: 'var(--ant-color-info)', fontSize: 14 }}>
                {ICON_MAP[meta.value]}
              </span>
              <span style={{ fontWeight: 500 }}>{meta.label}</span>
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: 11,
                  color: 'var(--ant-color-text-tertiary)',
                }}
              >
                {meta.desc}
              </span>
            </span>
          ),
          // antd select 搜索匹配走 label 的纯文本；用 meta.label 做 filter
          filterText: meta.label,
        })),
      },
      // 高级折叠区占位（本 phase 不实装；admin-UI §4.20.2 末段允许待 host 接入再补）
      {
        label: (
          <span style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary)' }}>
            高级动作（待实施）
          </span>
        ),
        title: '高级动作',
        options: [
          {
            value: '__advanced_placeholder__',
            disabled: true,
            label: (
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--ant-color-text-tertiary)',
                  fontStyle: 'italic',
                }}
              >
                slideshow_start / nav_start / play_queue 等待 host 接入
              </span>
            ),
          },
        ],
      },
    ],
    [],
  );

  return (
    <span
      data-testid="content-intent-select"
      style={{ display: 'block', width: width ?? '100%' }}
    >
      <Select
        value={value ?? undefined}
        onChange={(v) => {
          const intent = v as ContentIntent;
          onChange(intent, defaultParamsFor(intent));
        }}
        options={options}
        placeholder="选择动作"
        disabled={disabled}
        status={error ? 'error' : undefined}
        style={{ width: '100%' }}
        showSearch
        optionFilterProp="filterText"
        popupMatchSelectWidth={360}
      />
    </span>
  );
}
