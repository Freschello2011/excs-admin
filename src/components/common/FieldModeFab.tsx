/**
 * device-mgmt-v2 P9-D：现场态右下角浮动操作按钮（仅 fieldMode.enabled 时挂载）。
 *
 * 3 快速操作：
 *   - + 新建设备 → /devices?create=1
 *   - 🛠️ 跳调试  → 当前展厅设备列表，让 admin 选目标
 *   - ▶ 跑场景   → 当前展厅场景列表
 */
import { useNavigate } from 'react-router-dom';
import { useFieldMode } from '@/stores/fieldModeStore';
import { useHallStore } from '@/stores/hallStore';
import styles from './FieldModeFab.module.scss';

export default function FieldModeFab() {
  const enabled = useFieldMode((s) => s.enabled);
  const navigate = useNavigate();
  const selectedHallId = useHallStore((s) => s.selectedHallId);

  if (!enabled) return null;

  const goCreateDevice = () => navigate('/devices?create=1');
  const goDebug = () => navigate('/devices');
  const goScenes = () =>
    navigate(selectedHallId ? `/scenes?hall_id=${selectedHallId}` : '/scenes');

  return (
    <div className={styles.fab} role="group" aria-label="现场快速操作">
      <button className={styles.action} type="button" onClick={goCreateDevice} title="新建设备">
        <span className="material-symbols-outlined">add</span>
        <span className={styles.label}>新建设备</span>
      </button>
      <button className={styles.action} type="button" onClick={goDebug} title="跳调试">
        <span className="material-symbols-outlined">build</span>
        <span className={styles.label}>跳调试</span>
      </button>
      <button className={styles.action} type="button" onClick={goScenes} title="跑场景">
        <span className="material-symbols-outlined">play_arrow</span>
        <span className={styles.label}>跑场景</span>
      </button>
    </div>
  );
}
