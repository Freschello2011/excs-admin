import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Select, Space, Card, Empty, List, Radio, Popconfirm, Tag, Typography } from 'antd';
import { useMessage } from '@/hooks/useMessage';
import { DeleteOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { contentApi } from '@/api/content';
import { queryKeys } from '@/api/queryKeys';
import type { ExhibitContentItem, SlideshowTransition } from '@/types/content';

const { Text } = Typography;

interface Props {
  hallId: number;
  exhibitId: number;
  canManage: boolean;
}

export default function ExhibitSlideshowTab({ exhibitId, canManage }: Props) {
  const { message } = useMessage();
  const queryClient = useQueryClient();

  const [bgContentId, setBgContentId] = useState<number | undefined>();
  const [imageIds, setImageIds] = useState<number[]>([]);
  const [transition, setTransition] = useState<SlideshowTransition>('fade');
  const [initialized, setInitialized] = useState(false);

  // 获取展项内容列表
  const { data: contents = [], isLoading: contentsLoading } = useQuery({
    queryKey: queryKeys.exhibitContent(exhibitId),
    queryFn: () => contentApi.getExhibitContent(exhibitId),
    select: (res) => res.data.data ?? [],
  });

  // 获取已保存的配置
  const { data: savedConfig, isLoading: configLoading } = useQuery({
    queryKey: queryKeys.slideshowConfig(exhibitId),
    queryFn: () => contentApi.getSlideshowConfig(exhibitId),
    select: (res) => res.data.data,
  });

  // 配置加载后同步到本地状态
  useEffect(() => {
    if (!initialized && !configLoading) {
      if (savedConfig) {
        setBgContentId(savedConfig.background_content_id);
        setImageIds(savedConfig.image_content_ids);
        setTransition(savedConfig.transition);
      }
      setInitialized(true);
    }
  }, [savedConfig, configLoading, initialized]);

  // 保存配置
  const saveMutation = useMutation({
    mutationFn: () =>
      contentApi.configureSlideshow(exhibitId, {
        background_content_id: bgContentId!,
        image_content_ids: imageIds,
        transition,
      }),
    onSuccess: () => {
      message.success('图文汇报配置已保存');
      queryClient.invalidateQueries({ queryKey: queryKeys.slideshowConfig(exhibitId) });
    },
    onError: () => message.error('保存失败'),
  });

  // 删除配置
  const deleteMutation = useMutation({
    mutationFn: () => contentApi.deleteSlideshow(exhibitId),
    onSuccess: () => {
      message.success('图文汇报配置已删除');
      setBgContentId(undefined);
      setImageIds([]);
      setTransition('fade');
      queryClient.invalidateQueries({ queryKey: queryKeys.slideshowConfig(exhibitId) });
    },
    onError: () => message.error('删除失败'),
  });

  // 过滤出视频和图片内容
  const videoContents = contents.filter((c: ExhibitContentItem) => c.type === 'video' && c.status === 'ready');
  const imageContents = contents.filter((c: ExhibitContentItem) => c.type === 'image' && c.status === 'ready');

  // 添加图片到序列
  const addImage = useCallback((contentId: number) => {
    if (!imageIds.includes(contentId)) {
      setImageIds([...imageIds, contentId]);
    }
  }, [imageIds]);

  // 移除图片
  const removeImage = useCallback((index: number) => {
    setImageIds(imageIds.filter((_, i) => i !== index));
  }, [imageIds]);

  // 移动图片
  const moveImage = useCallback((index: number, direction: -1 | 1) => {
    const newIds = [...imageIds];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newIds.length) return;
    [newIds[index], newIds[targetIndex]] = [newIds[targetIndex], newIds[index]];
    setImageIds(newIds);
  }, [imageIds]);

  const canSave = bgContentId != null && imageIds.length > 0;
  const isLoading = contentsLoading || configLoading;

  if (isLoading) {
    return <Card loading style={{ marginTop: 16 }} />;
  }

  if (contents.length === 0) {
    return (
      <Empty description="请先上传内容文件" style={{ marginTop: 40 }} />
    );
  }

  const getContentName = (contentId: number) => {
    const c = contents.find((item: ExhibitContentItem) => item.content_id === contentId);
    return c?.filename ?? `#${contentId}`;
  };

  return (
    <div style={{ maxWidth: 800 }}>
      {/* 背景视频选择 */}
      <Card title="背景视频" size="small" style={{ marginBottom: 16 }}>
        <Select
          style={{ width: '100%' }}
          placeholder="选择背景视频"
          value={bgContentId}
          onChange={setBgContentId}
          disabled={!canManage}
          options={videoContents.map((c: ExhibitContentItem) => ({
            label: c.filename,
            value: c.content_id,
          }))}
          allowClear
        />
        {videoContents.length === 0 && (
          <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            暂无可用视频，请先上传视频文件
          </Text>
        )}
      </Card>

      {/* 前景图片序列 */}
      <Card
        title="前景图片序列"
        size="small"
        style={{ marginBottom: 16 }}
        extra={
          canManage && (
            <Select
              style={{ width: 200 }}
              placeholder="添加图片"
              onChange={(v: number) => { addImage(v); }}
              value={null as unknown as number}
              options={imageContents
                .filter((c: ExhibitContentItem) => !imageIds.includes(c.content_id))
                .map((c: ExhibitContentItem) => ({
                  label: c.filename,
                  value: c.content_id,
                }))}
            />
          )
        }
      >
        {imageIds.length === 0 ? (
          <Empty description="请添加前景图片" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <List
            size="small"
            dataSource={imageIds}
            renderItem={(contentId, index) => (
              <List.Item
                actions={
                  canManage
                    ? [
                        <Button
                          key="up"
                          type="text"
                          size="small"
                          icon={<ArrowUpOutlined />}
                          disabled={index === 0}
                          onClick={() => moveImage(index, -1)}
                        />,
                        <Button
                          key="down"
                          type="text"
                          size="small"
                          icon={<ArrowDownOutlined />}
                          disabled={index === imageIds.length - 1}
                          onClick={() => moveImage(index, 1)}
                        />,
                        <Button
                          key="del"
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => removeImage(index)}
                        />,
                      ]
                    : undefined
                }
              >
                <Space>
                  <Tag>{index + 1}</Tag>
                  <Text>{getContentName(contentId)}</Text>
                </Space>
              </List.Item>
            )}
          />
        )}
        {imageContents.length === 0 && imageIds.length === 0 && (
          <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            暂无可用图片，请先上传图片文件
          </Text>
        )}
      </Card>

      {/* 过渡方式 */}
      <Card title="过渡方式" size="small" style={{ marginBottom: 16 }}>
        <Radio.Group value={transition} onChange={(e) => setTransition(e.target.value)} disabled={!canManage}>
          <Radio.Button value="fade">淡入淡出</Radio.Button>
          <Radio.Button value="slide">左右滑动</Radio.Button>
        </Radio.Group>
      </Card>

      {/* 操作按钮 */}
      {canManage && (
        <Space>
          <Button
            type="primary"
            onClick={() => saveMutation.mutate()}
            loading={saveMutation.isPending}
            disabled={!canSave}
          >
            保存配置
          </Button>
          <Popconfirm
            title="确定删除图文汇报配置？"
            onConfirm={() => deleteMutation.mutate()}
          >
            <Button danger loading={deleteMutation.isPending}>
              删除配置
            </Button>
          </Popconfirm>
        </Space>
      )}
    </div>
  );
}
