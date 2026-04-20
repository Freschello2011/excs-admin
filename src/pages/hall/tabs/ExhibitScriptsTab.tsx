import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Input, Space } from 'antd';
import { useMessage } from '@/hooks/useMessage';
import { PlusOutlined, SaveOutlined, DeleteOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import type { ExhibitScript } from '@/types/hall';

interface Props {
  hallId: number;
  exhibitId: number;
  canManage: boolean;
}

export default function ExhibitScriptsTab({ hallId, exhibitId, canManage }: Props) {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const [scripts, setScripts] = useState<ExhibitScript[]>([]);
  const [dirty, setDirty] = useState(false);

  const { data: serverScripts } = useQuery({
    queryKey: queryKeys.exhibitScripts(hallId, exhibitId),
    queryFn: () => hallApi.getExhibitScripts(hallId, exhibitId),
    select: (res) => res.data.data,
    enabled: Boolean(exhibitId),
  });

  useEffect(() => {
    if (!serverScripts) return;
    if (serverScripts.length > 0) {
      setScripts(
        serverScripts.map((s, i) => ({
          content: s.content,
          sort_order: s.sort_order ?? i + 1,
        })),
      );
    } else {
      setScripts([{ content: '', sort_order: 1 }]);
    }
    setDirty(false);
  }, [serverScripts]);

  const saveMutation = useMutation({
    mutationFn: (data: ExhibitScript[]) =>
      hallApi.updateExhibitScripts(hallId, exhibitId, data),
    onSuccess: () => {
      message.success('讲解词已保存');
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.exhibits(hallId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.exhibitScripts(hallId, exhibitId) });
    },
  });

  const handleSave = () => {
    const validScripts = scripts.filter((s) => s.content.trim());
    saveMutation.mutate(validScripts);
  };

  const updateScript = (index: number, content: string) => {
    const next = [...scripts];
    next[index] = { ...next[index], content };
    setScripts(next);
    setDirty(true);
  };

  const addScript = () => {
    setScripts([...scripts, { content: '', sort_order: scripts.length + 1 }]);
    setDirty(true);
  };

  const removeScript = (index: number) => {
    const next = scripts.filter((_, i) => i !== index).map((s, i) => ({ ...s, sort_order: i + 1 }));
    setScripts(next);
    setDirty(true);
  };

  const moveScript = (index: number, direction: 'up' | 'down') => {
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= scripts.length) return;
    const next = [...scripts];
    [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
    next.forEach((s, i) => { s.sort_order = i + 1; });
    setScripts(next);
    setDirty(true);
  };

  return (
    <Card
      title={`讲解词（${scripts.filter((s) => s.content.trim()).length} 段）`}
      extra={
        canManage && (
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={saveMutation.isPending}
            disabled={!dirty}
          >
            保存
          </Button>
        )
      }
    >
      {scripts.map((script, idx) => (
        <div
          key={idx}
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
            padding: '14px 0',
            borderBottom: idx < scripts.length - 1 ? '1px dashed var(--color-outline-variant)' : 'none',
          }}
        >
          {/* 紫色圆角编号徽章 */}
          <div
            style={{
              flexShrink: 0,
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'rgba(var(--color-primary-rgb), 0.12)',
              color: 'var(--color-primary)',
              fontSize: 12,
              fontWeight: 600,
              display: 'grid',
              placeItems: 'center',
              marginTop: 4,
            }}
          >
            {idx + 1}
          </div>
          <Input.TextArea
            rows={3}
            value={script.content}
            onChange={(e) => updateScript(idx, e.target.value)}
            placeholder="输入讲解内容..."
            disabled={!canManage}
            style={{ flex: 1 }}
          />
          {canManage && (
            <Space direction="vertical" size={2}>
              <Button
                type="text"
                size="small"
                icon={<ArrowUpOutlined />}
                onClick={() => moveScript(idx, 'up')}
                disabled={idx === 0}
              />
              <Button
                type="text"
                size="small"
                icon={<ArrowDownOutlined />}
                onClick={() => moveScript(idx, 'down')}
                disabled={idx === scripts.length - 1}
              />
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                onClick={() => removeScript(idx)}
                disabled={scripts.length <= 1}
              />
            </Space>
          )}
        </div>
      ))}

      {canManage && (
        <Button type="dashed" block icon={<PlusOutlined />} onClick={addScript}>
          添加段落
        </Button>
      )}
    </Card>
  );
}
