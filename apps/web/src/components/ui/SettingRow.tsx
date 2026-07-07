interface Props {
  label:   string
  value:   string
  onClick: () => void
}

/** A tappable config row: label · value ›  (opens a sheet). */
export function SettingRow({ label, value, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between gap-3 py-3.5 border-b border-aetas-border text-left hover:bg-aetas-raised/40 transition-colors px-1"
    >
      <span className="font-body text-aetas-label text-[11px] uppercase tracking-wider">{label}</span>
      <span className="flex items-center gap-1.5 text-aetas-muted text-sm font-medium">
        {value}
        <span className="text-aetas-dim text-base leading-none">›</span>
      </span>
    </button>
  )
}

export default SettingRow
