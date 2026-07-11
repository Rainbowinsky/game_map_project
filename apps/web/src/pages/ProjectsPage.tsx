import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useNavigate } from 'react-router-dom';

import { Brand } from '../components/Brand.js';
import { ErrorState } from '../components/ErrorState.js';
import { Icon } from '../components/Icon.js';
import { LoadingState } from '../components/LoadingState.js';
import { api, readableError } from '../services/api-client.js';
import { useSessionStore } from '../stores/session-store.js';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(
    new Date(value),
  );
}

export function ProjectsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useSessionStore((state) => state.session);
  const clearSession = useSessionStore((state) => state.clearSession);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [form, setForm] = useState({ projectName: '', mapName: '', width: 24000, height: 16000 });
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.listProjects(session?.accessToken ?? ''),
    enabled: Boolean(session),
  });
  const createWorld = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error('No session');
      const project = await api.createProject(session.accessToken, { name: form.projectName });
      return api.createMap(session.accessToken, project.id, {
        name: form.mapName,
        width: form.width,
        height: form.height,
        themeId: 'mvp-classic',
      });
    },
    onSuccess: async (map) => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      setDialogOpen(false);
      navigate(`/editor/${map.id}`);
    },
  });

  if (!session) return <Navigate to="/login" replace />;
  const recentMaps =
    projects.data?.items
      .flatMap((project) => project.maps.map((map) => ({ ...map, projectName: project.name })))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 6) ?? [];
  const submit = (event: FormEvent) => {
    event.preventDefault();
    createWorld.mutate();
  };

  return (
    <main className="projects-page route-enter">
      <aside className="dashboard-nav">
        <Brand />
        <nav aria-label="主导航">
          <a className="active" href="#worlds">
            <Icon name="grid" />
            地图室
          </a>
          <a href="#archive">
            <Icon name="map" />
            档案库<span>即将推出</span>
          </a>
        </nav>
        <div className="dashboard-nav__bottom">
          <button>
            <Icon name="settings" />
            设置
          </button>
          <p>ATLAS / 01</p>
        </div>
      </aside>
      <section className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <p className="kicker">THE MAP ROOM</p>
            <h1>地图室</h1>
          </div>
          <div className="dashboard-actions">
            <label className="search">
              <Icon name="search" />
              <input aria-label="搜索地图" placeholder="搜索你的世界" />
            </label>
            <button
              className="avatar"
              aria-label="打开账户菜单"
              aria-expanded={profileOpen}
              onClick={() => setProfileOpen(!profileOpen)}
            >
              {session.user.displayName.slice(0, 1).toUpperCase()}
            </button>
            {profileOpen && (
              <div className="profile-menu popover-enter">
                <strong>{session.user.displayName}</strong>
                <span>{session.user.email}</span>
                <button
                  onClick={() => {
                    clearSession();
                    navigate('/login');
                  }}
                >
                  退出地图室
                </button>
              </div>
            )}
          </div>
        </header>
        <div className="dashboard-content" id="worlds">
          <section className="welcome">
            <p>
              {new Date().getHours() < 12
                ? '早上好'
                : new Date().getHours() < 18
                  ? '下午好'
                  : '晚上好'}
              ，{session.user.displayName}
            </p>
            <h2>
              今天，去往哪一片<em>未知之地？</em>
            </h2>
            <button className="button button--primary" onClick={() => setDialogOpen(true)}>
              <Icon name="plus" />
              创建新世界
            </button>
          </section>
          <section className="project-section">
            <div className="section-heading">
              <div>
                <p className="kicker">RECENTLY VISITED</p>
                <h2>最近开启</h2>
              </div>
              <button className="text-button">
                查看全部 <Icon name="arrow" />
              </button>
            </div>
            {projects.isPending ? (
              <LoadingState />
            ) : projects.isError ? (
              <ErrorState
                message={readableError(projects.error)}
                onRetry={() => void projects.refetch()}
              />
            ) : recentMaps.length === 0 ? (
              <div className="empty-worlds">
                <div className="empty-worlds__mark">
                  <Icon name="map" />
                </div>
                <h3>第一张地图，正等待一个名字</h3>
                <p>建立世界档案，我们会准备好画布与默认图层。</p>
                <button className="button button--ink" onClick={() => setDialogOpen(true)}>
                  开始绘制
                </button>
              </div>
            ) : (
              <div className="card-grid">
                {recentMaps.map((map, index) => (
                  <Link
                    className="project-card"
                    to={`/editor/${map.id}`}
                    key={map.id}
                    style={{ '--delay': `${index * 55}ms` } as React.CSSProperties}
                  >
                    <div className={`map-preview map-preview--${index % 3}`}>
                      <span className="map-preview__coast" />
                      <span className="map-preview__pin" />
                    </div>
                    <div className="project-card__body">
                      <p>{map.projectName}</p>
                      <h3>{map.name}</h3>
                      <div>
                        <span>R{map.revision}</span>
                        <span>{formatDate(map.updatedAt)} 编辑</span>
                        <Icon name="chevron" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
      {dialogOpen && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDialogOpen(false);
          }}
        >
          <section
            className="dialog dialog-enter"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-world-title"
          >
            <button
              className="icon-button dialog__close"
              aria-label="关闭"
              onClick={() => setDialogOpen(false)}
            >
              <Icon name="close" />
            </button>
            <p className="kicker">NEW WORLD</p>
            <h2 id="new-world-title">为未知之地命名</h2>
            <p>我们将同时建立项目档案与第一张地图。</p>
            <form onSubmit={submit}>
              <label className="field">
                <span>项目名称</span>
                <input
                  autoFocus
                  required
                  maxLength={120}
                  value={form.projectName}
                  onChange={(event) => setForm({ ...form, projectName: event.target.value })}
                  placeholder="例如：北境编年史"
                />
              </label>
              <label className="field">
                <span>地图名称</span>
                <input
                  required
                  maxLength={120}
                  value={form.mapName}
                  onChange={(event) => setForm({ ...form, mapName: event.target.value })}
                  placeholder="例如：灰烬海岸"
                />
              </label>
              <div className="field-row">
                <label className="field">
                  <span>世界宽度</span>
                  <input
                    required
                    type="number"
                    min={1000}
                    max={1000000}
                    value={form.width}
                    onChange={(event) => setForm({ ...form, width: Number(event.target.value) })}
                  />
                </label>
                <label className="field">
                  <span>世界高度</span>
                  <input
                    required
                    type="number"
                    min={1000}
                    max={1000000}
                    value={form.height}
                    onChange={(event) => setForm({ ...form, height: Number(event.target.value) })}
                  />
                </label>
              </div>
              {createWorld.error && (
                <p className="form-error" role="alert">
                  {readableError(createWorld.error)}
                </p>
              )}
              <button
                className="button button--primary button--wide"
                disabled={createWorld.isPending}
              >
                {createWorld.isPending ? '正在铺开地图…' : '创建并打开'}
                <Icon name="arrow" />
              </button>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
