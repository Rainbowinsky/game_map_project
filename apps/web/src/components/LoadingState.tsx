export function LoadingState({ editor = false }: { editor?: boolean }) {
  if (editor)
    return (
      <div className="editor-loading" aria-label="正在加载地图">
        <div className="editor-loading__bar" />
        <div className="editor-loading__rail" />
        <div className="editor-loading__canvas">
          <span />
          <span />
          <span />
        </div>
        <div className="editor-loading__panel" />
      </div>
    );
  return (
    <div className="card-grid" aria-label="正在加载项目">
      {[0, 1, 2].map((item) => (
        <div className="project-card skeleton" key={item}>
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
