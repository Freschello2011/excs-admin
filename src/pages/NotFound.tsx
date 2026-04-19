import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '60vh',
      gap: '16px',
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 64, color: 'var(--color-outline)' }}>
        search_off
      </span>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>
        404 - 页面不存在
      </h2>
      <p style={{ color: 'var(--color-outline)' }}>您访问的页面不存在或已被移除</p>
      <Link
        to="/dashboard"
        style={{
          marginTop: 8,
          padding: '8px 24px',
          background: 'var(--color-primary)',
          color: '#fff',
          borderRadius: 8,
          fontSize: '0.875rem',
          textDecoration: 'none',
        }}
      >
        返回总览
      </Link>
    </div>
  );
}
