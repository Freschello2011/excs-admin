import { useEffect, useMemo, useRef, useState } from 'react';
import { Anchor, Card, Input, Typography, Empty } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import BrandingForm from './BrandingForm';
import NASConfigTab from './NASConfigTab';
import IntegrationCard from './IntegrationCard';
import { IA, type Section } from './ia';

const { Title, Text } = Typography;

/** 把 section 内的所有可搜索文本拼起来，做小写模糊匹配 */
function sectionMatchesQuery(section: Section, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase().trim();
  const haystack: string[] = [section.title, section.description ?? '', section.key];
  if (section.kind === 'fields' && section.fields) {
    section.fields.forEach((f) => {
      haystack.push(f.key, f.group, f.label ?? '');
    });
  }
  return haystack.some((s) => s.toLowerCase().includes(q));
}

export default function SysConfigPage() {
  const [search, setSearch] = useState('');
  const [activeAnchor, setActiveAnchor] = useState<string>('');

  // 命中搜索的 section keys（仅当 search 非空时计算）
  const hitSet = useMemo(() => {
    if (!search.trim()) return null;
    const set = new Set<string>();
    IA.forEach((cat) => {
      cat.sections.forEach((sec) => {
        if (sectionMatchesQuery(sec, search)) set.add(sec.key);
      });
    });
    return set;
  }, [search]);

  // 过滤后的分类（每分类下至少有 1 个命中的 section 才显示）
  const filteredIA = useMemo(() => {
    if (!hitSet) return IA;
    return IA.map((cat) => ({
      ...cat,
      sections: cat.sections.filter((s) => hitSet.has(s.key)),
    })).filter((cat) => cat.sections.length > 0);
  }, [hitSet]);

  // 左侧 Anchor items
  const anchorItems = useMemo(
    () =>
      filteredIA.map((cat) => ({
        key: cat.key,
        href: `#cat-${cat.key}`,
        title: cat.title,
        children: cat.sections.map((sec) => ({
          key: sec.key,
          href: `#section-${sec.key}`,
          title: sec.title,
        })),
      })),
    [filteredIA],
  );

  // 滚动监听：在内容容器内根据可见 section 同步左侧 Anchor 高亮
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const sectionEls = Array.from(root.querySelectorAll<HTMLElement>('[id^="section-"]'));
    if (sectionEls.length === 0) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (a.target as HTMLElement).offsetTop - (b.target as HTMLElement).offsetTop);
        if (visible.length > 0) {
          const id = (visible[0].target as HTMLElement).id;
          setActiveAnchor(`#${id}`);
        }
      },
      { root, rootMargin: '-10% 0px -70% 0px', threshold: 0 },
    );
    sectionEls.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [filteredIA]);

  return (
    <div>
      <PageHeader
        title="系统参数"
        description="按集成 / 子系统聚合的运维配置；按角色分层（任意管理员 / 超管 / 运维管理员）。修改后即时生效，部分凭据需重启服务。"
      />

      {/* 顶部搜索 */}
      <div style={{ marginTop: 12, marginBottom: 16, maxWidth: 480 }}>
        <Input
          allowClear
          size="large"
          prefix={<SearchOutlined />}
          placeholder="搜索字段名、描述或 key（如 access_key / 短信 / OSS）"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filteredIA.length === 0 ? (
        <Empty description={`没有匹配「${search}」的字段`} style={{ padding: '60px 0' }} />
      ) : (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {/* 左侧目录 */}
          <Card
            style={{
              width: 240,
              flexShrink: 0,
              position: 'sticky',
              top: 16,
              maxHeight: 'calc(100vh - 140px)',
              overflow: 'auto',
            }}
            styles={{ body: { padding: 12 } }}
          >
            <Anchor
              affix={false}
              getContainer={() => contentRef.current ?? window}
              items={anchorItems}
              onClick={(e, link) => {
                e.preventDefault();
                const id = link.href.replace('#', '');
                const el = document.getElementById(id);
                if (el && contentRef.current) {
                  const offsetTop = el.offsetTop - contentRef.current.offsetTop;
                  contentRef.current.scrollTo({ top: offsetTop - 8, behavior: 'smooth' });
                }
              }}
              getCurrentAnchor={() => activeAnchor}
            />
          </Card>

          {/* 右侧内容 */}
          <div
            ref={contentRef}
            style={{
              flex: 1,
              maxHeight: 'calc(100vh - 140px)',
              overflowY: 'auto',
              paddingRight: 4,
            }}
          >
            {filteredIA.map((cat) => (
              <div key={cat.key} id={`cat-${cat.key}`} style={{ scrollMarginTop: 16, marginBottom: 32 }}>
                <div style={{ marginBottom: 12 }}>
                  <Title level={4} style={{ margin: 0 }}>{cat.title}</Title>
                  {cat.hint && (
                    <Text type="secondary" style={{ fontSize: 13 }}>{cat.hint}</Text>
                  )}
                </div>

                {cat.sections.map((sec) => {
                  const highlight = !!hitSet && hitSet.has(sec.key);
                  if (sec.kind === 'branding') {
                    return (
                      <Card
                        id={`section-${sec.key}`}
                        key={sec.key}
                        style={{ marginBottom: 16, scrollMarginTop: 16, ...(highlight ? { boxShadow: '0 0 0 2px var(--ant-color-warning)' } : null) }}
                        title={
                          <span>
                            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--ant-color-primary)', verticalAlign: 'text-bottom', marginRight: 8 }}>
                              {sec.icon}
                            </span>
                            {sec.title}
                          </span>
                        }
                        styles={{ body: { paddingTop: 0 } }}
                      >
                        <BrandingForm />
                      </Card>
                    );
                  }
                  if (sec.kind === 'nas') {
                    return (
                      <div id={`section-${sec.key}`} key={sec.key} style={{ scrollMarginTop: 16, ...(highlight ? { boxShadow: '0 0 0 2px var(--ant-color-warning)', borderRadius: 8 } : null) }}>
                        <NASConfigTab />
                      </div>
                    );
                  }
                  return <IntegrationCard key={sec.key} section={sec} highlight={highlight} />;
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
