// Ye-Almaz TV — page dots for screens that rotate through several pages.
export default function Pager({ page, pages }) {
  return pages > 1 ? (
    <div className="tv-pager" aria-label={`Page ${page + 1} of ${pages}`}>
      {Array.from({ length: pages }, (_, i) => <span key={i} className={i === page ? 'on' : ''} />)}
    </div>
  ) : null;
}
