import { Link } from 'react-router-dom';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      className={`brand ${compact ? 'brand--compact' : ''}`}
      to="/"
      aria-label="Atlas Atelier 首页"
    >
      <span className="brand__mark">
        <i />
        <i />
        <i />
      </span>
      {compact ? null : (
        <span>
          <b>ATLAS</b>
          <small>ATELIER</small>
        </span>
      )}
    </Link>
  );
}
