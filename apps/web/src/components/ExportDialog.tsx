import { useEffect, useMemo, useState } from 'react';
import type { MapDocument } from '@fantasy-map/map-model';

import {
  PNG_EXPORT_DEFAULT_LONG_EDGE,
  createPngExportPlan,
  formatEstimatedBytes,
  pngLongEdgeOptions,
} from '../exports/png-export-plan.js';
import { Icon } from './Icon.js';

interface ExportDialogProps {
  readonly document: MapDocument;
  readonly maxTextureSize: number | null;
  readonly exporting: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onExport: (longEdge: number) => void;
}

export function ExportDialog({
  document,
  maxTextureSize,
  exporting,
  error,
  onClose,
  onExport,
}: ExportDialogProps) {
  const initialLongEdge = Math.min(PNG_EXPORT_DEFAULT_LONG_EDGE, maxTextureSize ?? 4096);
  const [longEdge, setLongEdge] = useState(initialLongEdge);
  const plan = useMemo(
    () =>
      createPngExportPlan(document.width, document.height, longEdge, {
        deviceMaxTextureSize: maxTextureSize,
      }),
    [document.height, document.width, longEdge, maxTextureSize],
  );
  const options = pngLongEdgeOptions(plan.maxLongEdge);

  useEffect(() => {
    setLongEdge((current) => Math.min(current, plan.maxLongEdge));
  }, [plan.maxLongEdge]);

  return (
    <div
      className="export-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !exporting) onClose();
      }}
    >
      <section
        className="export-dialog dialog-enter"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
      >
        <button
          className="icon-button export-dialog__close"
          onClick={onClose}
          disabled={exporting}
          aria-label="关闭导出对话框"
        >
          <Icon name="close" />
        </button>
        <p className="kicker">PNG EXPORT</p>
        <h2 id="export-title">导出整张地图</h2>
        <p className="export-dialog__intro">
          将按地图比例生成预览 PNG；网格、选择框、手柄和其他编辑叠层不会包含在文件中。
        </p>
        <label className="export-dialog__field">
          <span>安全输出长边</span>
          <select
            aria-label="安全输出长边"
            value={longEdge}
            onChange={(event) => setLongEdge(Number(event.target.value))}
            disabled={exporting}
          >
            {options.map((value) => (
              <option value={value} key={value}>
                {value.toLocaleString()} px
                {value === PNG_EXPORT_DEFAULT_LONG_EDGE ? '（默认）' : ''}
              </option>
            ))}
          </select>
        </label>
        <dl className="export-dialog__estimate">
          <div>
            <dt>输出尺寸</dt>
            <dd data-testid="export-dimensions">
              {plan.outputWidth.toLocaleString()} × {plan.outputHeight.toLocaleString()} px
            </dd>
          </div>
          <div>
            <dt>像素数量</dt>
            <dd>{plan.pixelCount.toLocaleString()}</dd>
          </div>
          <div>
            <dt>预估临时内存</dt>
            <dd>{formatEstimatedBytes(plan.estimatedMemoryBytes)}</dd>
          </div>
        </dl>
        {plan.wasReduced && (
          <p className="export-dialog__notice" role="status">
            当前设备或安全限制会将请求按比例降采样，最大安全长边为{' '}
            {plan.maxLongEdge.toLocaleString()} px。
          </p>
        )}
        {error && (
          <p className="export-dialog__error" role="alert">
            {error}
          </p>
        )}
        <div className="export-dialog__actions">
          <button className="button" onClick={onClose} disabled={exporting}>
            取消
          </button>
          <button
            className="button button--primary"
            onClick={() => onExport(longEdge)}
            disabled={exporting}
          >
            {exporting ? '正在生成 PNG…' : '生成并下载 PNG'}
          </button>
        </div>
      </section>
    </div>
  );
}
