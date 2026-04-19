import { Navigate } from 'react-router-dom';

/** ContentGroup 概念已移除；旧深链重定向到内容总库。 */
export default function ContentGroupDetailPage() {
  return <Navigate to="/contents" replace />;
}
