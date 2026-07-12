import { useRef, useState, type FormEvent, type PointerEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Navigate, useNavigate } from 'react-router-dom';

import { Brand } from '../components/Brand.js';
import { Icon } from '../components/Icon.js';
import { api, readableError } from '../services/api-client.js';
import { useSessionStore } from '../stores/session-store.js';

export function AuthPage() {
  const storyRef = useRef<HTMLElement>(null);
  const navigate = useNavigate();
  const session = useSessionStore((state) => state.session);
  const setSession = useSessionStore((state) => state.setSession);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ displayName: '', email: '', password: '' });
  const mutation = useMutation({
    mutationFn: () =>
      mode === 'login'
        ? api.login({ email: form.email, password: form.password })
        : api.register(form),
    onSuccess: (result) => {
      setSession(result);
      navigate('/', { replace: true });
    },
  });

  if (session) return <Navigate to="/" replace />;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
  };
  const moveStory = (event: PointerEvent<HTMLElement>) => {
    const story = storyRef.current;
    if (!story || event.pointerType === 'touch') return;
    const bounds = story.getBoundingClientRect();
    const x = event.clientX - bounds.left - bounds.width / 2;
    const y = event.clientY - bounds.top - bounds.height / 2;
    story.style.setProperty('--auth-pointer-x', `${x}px`);
    story.style.setProperty('--auth-pointer-y', `${y}px`);
    story.style.setProperty('--auth-pointer-rx', `${(y / bounds.height) * -5}deg`);
    story.style.setProperty('--auth-pointer-ry', `${(x / bounds.width) * 7}deg`);
    story.style.setProperty('--auth-shift-x', `${x * 0.025}px`);
    story.style.setProperty('--auth-shift-y', `${y * 0.025}px`);
    story.style.setProperty('--auth-shift-x-near', `${x * -0.04}px`);
    story.style.setProperty('--auth-shift-y-near', `${y * -0.04}px`);
    story.style.setProperty('--auth-glow-x', `${event.clientX - bounds.left}px`);
    story.style.setProperty('--auth-glow-y', `${event.clientY - bounds.top}px`);
  };
  const resetStory = () => {
    const story = storyRef.current;
    if (!story) return;
    story.style.setProperty('--auth-pointer-x', '0px');
    story.style.setProperty('--auth-pointer-y', '0px');
    story.style.setProperty('--auth-pointer-rx', '0deg');
    story.style.setProperty('--auth-pointer-ry', '0deg');
    story.style.setProperty('--auth-shift-x', '0px');
    story.style.setProperty('--auth-shift-y', '0px');
    story.style.setProperty('--auth-shift-x-near', '0px');
    story.style.setProperty('--auth-shift-y-near', '0px');
  };
  return (
    <main className="auth-page route-enter">
      <section
        ref={storyRef}
        className="auth-story"
        onPointerMove={moveStory}
        onPointerLeave={resetStory}
      >
        <div className="auth-story__glow" aria-hidden="true" />
        <div className="auth-topography" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <Brand />
        <div className="auth-story__copy">
          <p className="kicker">PRIVATE CARTOGRAPHY STUDIO</p>
          <h1>
            为你的世界，
            <br />
            <em>绘一席疆域。</em>
          </h1>
          <p>从第一条海岸线，到最后一座无名城邦。这里是故事开始拥有坐标的地方。</p>
        </div>
        <div className="auth-story__coordinates">
          <span>31°14′ N</span>
          <i />
          <span>THE INNER SEA</span>
          <i />
          <span>118°37′ E</span>
        </div>
        <div className="contour contour--one" />
        <div className="contour contour--two" />
        <div className="auth-glass-card auth-glass-card--signal" aria-hidden="true">
          <header>
            <span>
              <i /> LIVE TERRAIN
            </span>
            <b>04</b>
          </header>
          <div className="auth-signal-map">
            <i />
            <i />
            <i />
            <span />
          </div>
          <footer>
            <span>COASTLINE SCAN</span>
            <b>72%</b>
          </footer>
        </div>
        <div className="auth-glass-card auth-glass-card--note" aria-hidden="true">
          <span>FIELD NOTE · 31°14′</span>
          <strong>
            每个世界，
            <br />
            都始于第一笔。
          </strong>
          <i />
        </div>
        <div className="compass">
          <span>N</span>
          <i />
        </div>
      </section>
      <section className="auth-panel">
        <form className="auth-form" onSubmit={submit}>
          <p className="kicker">{mode === 'login' ? 'WELCOME BACK' : 'JOIN THE ATELIER'}</p>
          <h2>{mode === 'login' ? '继续你的地图' : '建立制图档案'}</h2>
          <p className="auth-form__lead">
            {mode === 'login' ? '登录后回到最近编辑的世界。' : '创建一个只属于你的世界档案。'}
          </p>
          {mode === 'register' && (
            <label className="field field--reveal">
              <span>称呼</span>
              <input
                required
                minLength={2}
                maxLength={100}
                value={form.displayName}
                onChange={(event) => setForm({ ...form, displayName: event.target.value })}
                placeholder="你的名字"
                autoComplete="name"
              />
            </label>
          )}
          <label className="field">
            <span>邮箱</span>
            <input
              required
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              placeholder="name@example.com"
              autoComplete="email"
            />
          </label>
          <label className="field">
            <span>密码</span>
            <input
              required
              minLength={12}
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              placeholder="至少 12 个字符"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>
          {mutation.error && (
            <p className="form-error" role="alert">
              {readableError(mutation.error)}
            </p>
          )}
          <button className="button button--primary button--wide" disabled={mutation.isPending}>
            {mutation.isPending ? '正在进入…' : mode === 'login' ? '进入地图室' : '创建档案'}
            <Icon name="arrow" />
          </button>
          <p className="auth-switch">
            {mode === 'login' ? '第一次来到这里？' : '已经拥有档案？'}{' '}
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                mutation.reset();
              }}
            >
              {mode === 'login' ? '创建账户' : '返回登录'}
            </button>
          </p>
        </form>
      </section>
    </main>
  );
}
