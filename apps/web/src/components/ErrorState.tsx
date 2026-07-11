export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="error-state" role="alert">
      <span className="error-state__sigil">!</span>
      <div>
        <p className="kicker">连接中断</p>
        <h2>地图室暂时无法响应</h2>
        <p>{message}</p>
      </div>
      <button className="button button--ink" onClick={onRetry}>
        重新连接
      </button>
    </div>
  );
}
