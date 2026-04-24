import { useState } from 'react';
import { Checkbox, Form, Input, Modal, Typography } from 'antd';
import { REJECT_REASON_LABEL, type ContentRejectReason } from '@/types/content';

interface Props {
  open: boolean;
  contentName?: string;
  confirmLoading?: boolean;
  onSubmit: (body: { reasons: ContentRejectReason[]; note: string }) => void;
  onCancel: () => void;
}

const ALL_REASONS = Object.keys(REJECT_REASON_LABEL) as ContentRejectReason[];

// Phase 10 驳回弹窗：PRD §7.5 要求至少 1 个原因码或 note ≥5 字；前端做客户端前置校验。
export default function RejectContentModal({ open, contentName, confirmLoading, onSubmit, onCancel }: Props) {
  const [reasons, setReasons] = useState<ContentRejectReason[]>([]);
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);

  const canSubmit = reasons.length > 0 || note.trim().length >= 5;

  const handleOk = () => {
    setTouched(true);
    if (!canSubmit) return;
    onSubmit({ reasons, note: note.trim() });
  };

  const handleClose = () => {
    setReasons([]);
    setNote('');
    setTouched(false);
    onCancel();
  };

  return (
    <Modal
      title={`驳回内容${contentName ? `：${contentName}` : ''}`}
      open={open}
      onOk={handleOk}
      onCancel={handleClose}
      okButtonProps={{ danger: true, disabled: !canSubmit, loading: confirmLoading }}
      okText="驳回"
      cancelText="取消"
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
        至少勾选一个原因码或填写 5 字以上说明，供应商将看到原因并可重新提交新版本。
      </Typography.Paragraph>
      <Form layout="vertical">
        <Form.Item label="原因（可多选）">
          <Checkbox.Group
            value={reasons}
            onChange={(vals) => setReasons(vals as ContentRejectReason[])}
            options={ALL_REASONS.map((r) => ({ label: REJECT_REASON_LABEL[r], value: r }))}
          />
        </Form.Item>
        <Form.Item label="补充说明（选填，≥5 字）" validateStatus={touched && !canSubmit ? 'error' : ''} help={touched && !canSubmit ? '请至少勾选 1 条原因码或填写 5 字以上说明' : undefined}>
          <Input.TextArea
            rows={3}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="如：视频分辨率不足 4K / 文件名含项目代号需改名"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
