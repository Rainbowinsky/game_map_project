import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

const AuthPage = lazy(() =>
  import('./pages/AuthPage.js').then((module) => ({ default: module.AuthPage })),
);
const EditorPage = lazy(() =>
  import('./pages/EditorPage.js').then((module) => ({ default: module.EditorPage })),
);
const ProjectsPage = lazy(() =>
  import('./pages/ProjectsPage.js').then((module) => ({ default: module.ProjectsPage })),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
    mutations: { retry: false },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense
          fallback={
            <div className="app-boot" aria-label="正在进入地图室">
              <span />
            </div>
          }
        >
          <Routes>
            <Route path="/login" element={<AuthPage />} />
            <Route path="/" element={<ProjectsPage />} />
            <Route path="/editor/:mapId" element={<EditorPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
