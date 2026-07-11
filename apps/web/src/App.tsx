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
      <p className="eyebrow">Phase 1 · Model Kernel</p>
      <h1>{workspaceStatus.name}</h1>
      <p className="status">P1 model kernel is ready</p>
      <p className="detail">
        Strict document schemas, camera math, chunk coordinates and operation contracts are
        available on map model schema v{MAP_MODEL_SCHEMA_VERSION}.
      </p>
    </main>
  );
}
