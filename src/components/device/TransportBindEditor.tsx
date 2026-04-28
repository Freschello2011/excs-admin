/**
 * device-mgmt-v2 P6 — 6 套 transport bind 字段编辑器
 *
 * 复用于：
 *   - raw_transport device 的 connection_config（设备级）
 *   - listener trigger 的 source.bind（触发器级）
 *
 * 6 套字段表（PRD-v2 §九 + P5 TriggerModels.cs 对齐）：
 *   tcp/udp:  port, host
 *   serial:   com, baudrate, parity, data_bits, stop_bits, frame_gap_ms
 *   osc:      port
 *   artnet:   universe
 *   modbus:   host, port=502, unit_id=1, register, function_code=3, poll_interval_ms=200, quantity=1
 */
import { Form, Input, InputNumber, Select } from 'antd';
import type { TransportKind } from '@/types/deviceConnector';

interface Props {
  transport: TransportKind;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}

export default function TransportBindEditor({ transport, value, onChange }: Props) {
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v });

  switch (transport) {
    case 'tcp':
    case 'udp':
      return (
        <>
          <Form.Item label="设备 IP" required>
            <Input
              value={value.host as string | undefined}
              onChange={(e) => set('host', e.target.value)}
              placeholder="192.168.1.10"
            />
          </Form.Item>
          <Form.Item label="端口" required>
            <InputNumber
              value={value.port as number | undefined}
              onChange={(v) => set('port', v)}
              min={1}
              max={65535}
              style={{ width: '100%' }}
              placeholder="2000"
            />
          </Form.Item>
        </>
      );
    case 'osc':
      return (
        <Form.Item label="OSC 端口" required>
          <InputNumber
            value={value.port as number | undefined}
            onChange={(v) => set('port', v)}
            min={1}
            max={65535}
            style={{ width: '100%' }}
            placeholder="8000"
          />
        </Form.Item>
      );
    case 'artnet':
      return (
        <Form.Item
          label="DMX universe 编号"
          required
          extra="Art-Net 监听 UDP 6454 端口，按 universe 过滤"
        >
          <InputNumber
            value={value.universe as number | undefined}
            onChange={(v) => set('universe', v)}
            min={0}
            max={32767}
            style={{ width: '100%' }}
            placeholder="1"
          />
        </Form.Item>
      );
    case 'serial':
      return (
        <>
          <Form.Item label="串口路径" required extra="Mac/Linux 形如 /dev/cu.usbserial-1；Windows 形如 COM3">
            <Input
              value={value.com as string | undefined}
              onChange={(e) => set('com', e.target.value)}
              placeholder="/dev/cu.usbserial-1 或 COM3"
            />
          </Form.Item>
          <Form.Item label="波特率">
            <InputNumber
              value={(value.baudrate as number | undefined) ?? 9600}
              onChange={(v) => set('baudrate', v)}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <details style={{ marginBottom: 16 }}>
            <summary style={{ cursor: 'pointer', color: 'var(--ant-color-text-secondary)', fontSize: 13 }}>
              高级（校验位 / 数据位 / 停止位 / 帧间隔）
            </summary>
            <div style={{ marginTop: 12 }}>
              <Form.Item label="校验位">
                <Select
                  value={(value.parity as string | undefined) ?? 'none'}
                  onChange={(v) => set('parity', v)}
                  options={[
                    { value: 'none', label: '无' },
                    { value: 'even', label: '偶' },
                    { value: 'odd', label: '奇' },
                    { value: 'mark', label: 'mark' },
                    { value: 'space', label: 'space' },
                  ]}
                />
              </Form.Item>
              <Form.Item label="数据位">
                <InputNumber
                  value={(value.data_bits as number | undefined) ?? 8}
                  onChange={(v) => set('data_bits', v)}
                  min={5}
                  max={8}
                  style={{ width: '100%' }}
                />
              </Form.Item>
              <Form.Item label="停止位">
                <Select
                  value={(value.stop_bits as number | undefined) ?? 1}
                  onChange={(v) => set('stop_bits', v)}
                  options={[
                    { value: 0, label: '0' },
                    { value: 1, label: '1' },
                    { value: 2, label: '2' },
                  ]}
                />
              </Form.Item>
              <Form.Item label="帧间隔（毫秒）">
                <InputNumber
                  value={(value.frame_gap_ms as number | undefined) ?? 50}
                  onChange={(v) => set('frame_gap_ms', v)}
                  min={0}
                  max={5000}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </div>
          </details>
        </>
      );
    case 'modbus':
      return (
        <>
          <Form.Item label="设备 IP" required>
            <Input
              value={value.host as string | undefined}
              onChange={(e) => set('host', e.target.value)}
              placeholder="192.168.1.20"
            />
          </Form.Item>
          <Form.Item label="端口">
            <InputNumber
              value={(value.port as number | undefined) ?? 502}
              onChange={(v) => set('port', v)}
              min={1}
              max={65535}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label="设备地址 (unit id)">
            <InputNumber
              value={(value.unit_id as number | undefined) ?? 1}
              onChange={(v) => set('unit_id', v)}
              min={0}
              max={255}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label="寄存器号" required>
            <InputNumber
              value={value.register as number | undefined}
              onChange={(v) => set('register', v)}
              min={0}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <details>
            <summary style={{ cursor: 'pointer', color: 'var(--ant-color-text-secondary)', fontSize: 13 }}>
              高级（功能码 / 轮询周期 / 读取数量）
            </summary>
            <div style={{ marginTop: 12 }}>
              <Form.Item label="功能码">
                <InputNumber
                  value={(value.function_code as number | undefined) ?? 3}
                  onChange={(v) => set('function_code', v)}
                  min={1}
                  max={255}
                  style={{ width: '100%' }}
                />
              </Form.Item>
              <Form.Item label="轮询周期 (ms)">
                <InputNumber
                  value={(value.poll_interval_ms as number | undefined) ?? 200}
                  onChange={(v) => set('poll_interval_ms', v)}
                  min={10}
                  max={60000}
                  style={{ width: '100%' }}
                />
              </Form.Item>
              <Form.Item label="读取数量">
                <InputNumber
                  value={(value.quantity as number | undefined) ?? 1}
                  onChange={(v) => set('quantity', v)}
                  min={1}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </div>
          </details>
        </>
      );
    default:
      return <span>不支持的连接方式</span>;
  }
}
