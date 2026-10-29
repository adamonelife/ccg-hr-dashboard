export default function Logo({ height = 44, compact = false }) {
  return (
    <div className="np-logo">
      <img
        src="/brand/nallin-people.svg"
        alt="Nallin People"
        width={height}
        height={height}
      />
      {!compact && (
        <span>
          <span className="np-wordmark">NALLIN</span>
          <strong>People</strong>
        </span>
      )}
    </div>
  );
}
