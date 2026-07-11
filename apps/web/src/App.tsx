import { MAP_MODEL_SCHEMA_VERSION } from '@fantasy-map/map-model';
import { WORKSPACE_NAME } from '@fantasy-map/shared';
import { healthResponseSchema } from '@fantasy-map/validation';

const workspaceStatus = healthResponseSchema.parse({
  name: WORKSPACE_NAME,
  status: 'ok',
});

export function App() {
  return (
    <main className="app-shell">
      <p className="eyebrow">Phase 1 · Authentication</p>
      <h1>{workspaceStatus.name}</h1>
      <p className="status">P3 authentication API is ready</p>
      <p className="detail">
        Argon2id registration, constrained JWT access tokens and owner-scoped resource boundaries
        now protect map model schema v{MAP_MODEL_SCHEMA_VERSION}.
      </p>
    </main>
  );
}
