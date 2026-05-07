/**
 * <SceneBasicInfoCard> — 场景编辑页 v2 基本信息卡
 *
 * SSOT：admin-UI §4.20.4 + mockup M1 line 583-614
 *
 * 字段：name / icon / scene_type / sort_order
 *   - icon 沿用既有 SceneListPage 的 ICON_OPTIONS（命名风格保持）
 *   - scene_type 当前 yaml/server 仅支持 `preset`（command.yaml schema 限定）；
 *     mockup 的 open|close|normal 是后续 ADR 项，本期保留 preset 单选
 *   - 422 detail：errors[<field>] 命中时给 status="error"
 */
import { Card, Form, Input, InputNumber, Select } from 'antd';
import { ControlOutlined } from '@ant-design/icons';
import { SCENE_ICON_OPTIONS } from './_constants';

const SCENE_TYPE_OPTIONS = [{ value: 'preset', label: '预设（preset）' }];

export interface SceneBasicValues {
  name: string;
  icon: string;
  scene_type: 'preset';
  sort_order: number;
}

interface Props {
  value: SceneBasicValues;
  onChange: (next: SceneBasicValues) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
}

export default function SceneBasicInfoCard({
  value,
  onChange,
  errors = {},
  disabled,
}: Props) {
  function patch<K extends keyof SceneBasicValues>(
    key: K,
    v: SceneBasicValues[K],
  ) {
    onChange({ ...value, [key]: v });
  }

  return (
    <Card
      size="small"
      variant="outlined"
      data-testid="scene-basic-info-card"
      style={{ marginBottom: 16, borderRadius: 12 }}
      title={
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 14,
          }}
        >
          <ControlOutlined />
          基本信息
        </span>
      }
    >
      <Form layout="vertical" component="div">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr 90px',
            gap: 12,
          }}
        >
          <Form.Item
            label="场景名称"
            required
            validateStatus={errors.name ? 'error' : ''}
            help={errors.name}
            style={{ marginBottom: 0 }}
          >
            <Input
              value={value.name}
              onChange={(e) => patch('name', e.target.value)}
              placeholder="例：开馆模式"
              maxLength={50}
              disabled={disabled}
              data-testid="scene-basic-name"
            />
          </Form.Item>
          <Form.Item
            label="图标"
            validateStatus={errors.icon ? 'error' : ''}
            help={errors.icon}
            style={{ marginBottom: 0 }}
          >
            <Select
              value={value.icon}
              onChange={(v) => patch('icon', v)}
              options={SCENE_ICON_OPTIONS}
              disabled={disabled}
              data-testid="scene-basic-icon"
            />
          </Form.Item>
          <Form.Item
            label="类型"
            style={{ marginBottom: 0 }}
            tooltip="当前仅支持 preset；ADR-0020-v2 后续阶段扩展 open/close/normal"
          >
            <Select
              value={value.scene_type}
              onChange={(v) => patch('scene_type', v as 'preset')}
              options={SCENE_TYPE_OPTIONS}
              disabled
              data-testid="scene-basic-type"
            />
          </Form.Item>
          <Form.Item
            label="排序"
            validateStatus={errors.sort_order ? 'error' : ''}
            help={errors.sort_order}
            style={{ marginBottom: 0 }}
          >
            <InputNumber
              value={value.sort_order}
              onChange={(v) => patch('sort_order', typeof v === 'number' ? v : 1)}
              min={1}
              max={999}
              disabled={disabled}
              style={{ width: '100%' }}
              data-testid="scene-basic-sort"
            />
          </Form.Item>
        </div>
      </Form>
    </Card>
  );
}
