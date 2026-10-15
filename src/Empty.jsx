// An empty screen with a next step, instead of a blank page: a faint stamp, one line on what will appear, and actions.
export default function Empty({ title, text, children }) {
  return (
    <div className="empty-state">
      <svg className="empty-art" viewBox="0 0 120 120" aria-hidden="true">
        <rect x="14" y="14" width="92" height="92" rx="16" transform="rotate(-6 60 60)" />
        <circle cx="60" cy="56" r="22" />
        <path d="M38 56h44M60 34c-9 7-9 37 0 44M60 34c9 7 9 37 0 44" />
      </svg>
      <h2 className="empty-title">{title}</h2>
      <p className="hint">{text}</p>
      {children}
    </div>
  );
}
