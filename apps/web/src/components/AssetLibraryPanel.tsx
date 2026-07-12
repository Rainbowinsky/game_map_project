import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { STAMP_ASSETS } from '../assets/stamp-assets.js';
import { api, readableError } from '../services/api-client.js';
import { useEditorStore } from '../stores/editor-store.js';
import { useSessionStore } from '../stores/session-store.js';
import { AuthenticatedAssetImage } from './AuthenticatedAssetImage.js';
import { Icon } from './Icon.js';

export function AssetLibraryPanel({ onClose }: { readonly onClose: () => void }) {
  const session = useSessionStore((state) => state.session)!;
  const activeAssetId = useEditorStore((state) => state.activeStampAssetId);
  const setActiveStampAsset = useEditorStore((state) => state.setActiveStampAsset);
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [categoryId, setCategoryId] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [categoryEditorOpen, setCategoryEditorOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const assets = useQuery({
    queryKey: ['assets', session.user.id, categoryId],
    queryFn: () => api.listAssets(session.accessToken, categoryId ? { categoryId } : {}),
  });
  const categories = useQuery({
    queryKey: ['asset-categories', session.user.id],
    queryFn: () => api.listAssetCategories(session.accessToken),
  });

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.uploadAsset(session.accessToken, {
        file,
        displayName: file.name.replace(/\.[^.]+$/, '').slice(0, 120),
        kind: 'IMAGE',
        ...(categoryId ? { categoryId } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: ['assets', session.user.id] });
    } catch (uploadError) {
      setError(readableError(uploadError));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };
  const createCategory = async () => {
    if (!newCategory.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.createAssetCategory(session.accessToken, newCategory.trim());
      setNewCategory('');
      setCategoryEditorOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['asset-categories', session.user.id] });
    } catch (categoryError) {
      setError(readableError(categoryError));
    } finally {
      setBusy(false);
    }
  };
  const removeCategory = async () => {
    const selected = categories.data?.items.find((category) => category.id === categoryId);
    if (
      !selected ||
      selected.builtIn ||
      !window.confirm(`删除分类“${selected.name}”？素材会保留为未分类。`)
    )
      return;
    setBusy(true);
    setError(undefined);
    try {
      await api.deleteAssetCategory(session.accessToken, selected.id);
      setCategoryId('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['asset-categories', session.user.id] }),
        queryClient.invalidateQueries({ queryKey: ['assets', session.user.id] }),
      ]);
    } catch (categoryError) {
      setError(readableError(categoryError));
    } finally {
      setBusy(false);
    }
  };
  const removeAsset = async (assetId: string) => {
    if (!window.confirm('删除这个素材？已被地图引用的素材会被安全拒绝。')) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.deleteAsset(session.accessToken, assetId);
      await queryClient.invalidateQueries({ queryKey: ['assets', session.user.id] });
    } catch (deleteError) {
      setError(readableError(deleteError));
    } finally {
      setBusy(false);
    }
  };

  const customAssets = assets.data?.items.filter((asset) => !asset.builtIn) ?? [];
  const selectedCategory = categories.data?.items.find((category) => category.id === categoryId);

  return (
    <div className="asset-library-panel">
      <div className="panel-heading">
        <div>
          <p className="kicker">ASSET LIBRARY</p>
          <h2>素材库</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="收起素材面板">
          <Icon name="back" />
        </button>
      </div>
      <div className="asset-library-body">
        <section className="asset-library-controls" aria-label="素材筛选和上传">
          <div className="asset-field-heading">
            <label htmlFor="asset-category-filter">浏览分类</label>
            <button
              type="button"
              className="asset-text-action"
              onClick={() => setCategoryEditorOpen((open) => !open)}
              aria-expanded={categoryEditorOpen}
            >
              {categoryEditorOpen ? '收起' : '新建分类'}
            </button>
          </div>
          <div className="asset-filter-row">
            <select
              id="asset-category-filter"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">全部素材</option>
              {categories.data?.items.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {selectedCategory && !selectedCategory.builtIn && (
              <button
                type="button"
                className="asset-delete-category"
                onClick={() => void removeCategory()}
                disabled={busy}
                aria-label={`删除分类 ${selectedCategory.name}`}
                title="删除当前分类"
              >
                <Icon name="close" />
              </button>
            )}
          </div>
          {categoryEditorOpen && (
            <div className="asset-category-create">
              <input
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void createCategory();
                }}
                placeholder="输入分类名称"
                aria-label="新分类名称"
                maxLength={100}
                autoFocus
              />
              <button onClick={() => void createCategory()} disabled={busy || !newCategory.trim()}>
                创建
              </button>
            </div>
          )}
          <label className={`asset-upload-action ${busy ? 'is-busy' : ''}`}>
            <Icon name="plus" />
            <span>{busy ? '正在处理素材…' : '上传自定义图片'}</span>
            <input
              ref={fileInput}
              className="visually-hidden"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              disabled={busy}
              onChange={(event) => void upload(event.target.files?.[0])}
            />
          </label>
          <small className="asset-upload-hint">
            PNG、JPEG、WebP 或安全 SVG · 最大 10 MB / 8192 px
          </small>
          {error && (
            <p className="asset-error" role="alert">
              {error}
            </p>
          )}
        </section>

        <section className="asset-library-section" aria-labelledby="builtin-assets-title">
          <div className="asset-section-heading">
            <h3 id="builtin-assets-title">内置图章</h3>
            <span>{STAMP_ASSETS.length}</span>
          </div>
          <div className="builtin-asset-grid">
            {STAMP_ASSETS.map((asset) => (
              <button
                className={activeAssetId === asset.id ? 'active' : ''}
                key={asset.id}
                draggable
                onClick={() => setActiveStampAsset(asset.id)}
                onDragStart={(event) => {
                  event.dataTransfer.setData('application/x-map-stamp', asset.id);
                  setActiveStampAsset(asset.id);
                }}
                title={`${asset.name} · ${asset.description}`}
              >
                <span className="asset-swatch">
                  <img src={asset.url} alt="" />
                </span>
                <strong>{asset.name}</strong>
                <small>{asset.description}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="asset-library-section" aria-labelledby="custom-assets-title">
          <div className="asset-section-heading">
            <h3 id="custom-assets-title">自定义图片</h3>
            {customAssets.length > 0 && <span>{customAssets.length}</span>}
          </div>
          {assets.isLoading ? (
            <div className="asset-empty-state is-loading" aria-label="正在加载自定义素材">
              <i />
              <i />
            </div>
          ) : customAssets.length > 0 ? (
            <div className="custom-asset-grid">
              {customAssets.map((asset) => (
                <article key={asset.id}>
                  <span className="asset-swatch">
                    <AuthenticatedAssetImage
                      accessToken={session.accessToken}
                      assetId={asset.id}
                      alt=""
                    />
                  </span>
                  <div>
                    <strong>{asset.displayName}</strong>
                    <small>
                      {asset.width} × {asset.height} · {Math.ceil(asset.byteSize / 1024)} KB
                    </small>
                  </div>
                  <button
                    className="asset-remove-button"
                    onClick={() => void removeAsset(asset.id)}
                    disabled={busy}
                    aria-label={`删除素材 ${asset.displayName}`}
                    title="删除素材"
                  >
                    <Icon name="close" />
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="asset-empty-state">
              <span>
                <Icon name="grid" />
              </span>
              <strong>还没有自定义素材</strong>
              <p>上传图片后，可将它用作地点标记。</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
