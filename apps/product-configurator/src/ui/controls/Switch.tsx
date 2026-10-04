import styles from './Switch.module.css';

interface SwitchProps {
  label: string;
  checked: boolean;
  hint?: string;
  onChange: (checked: boolean) => void;
}

export function Switch({ label, checked, hint, onChange }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={styles.row}
      onClick={() => {
        onChange(!checked);
      }}
    >
      <span className={styles.text}>
        <span className={styles.label}>
          {checked ? `${label} included` : `Add ${label.toLowerCase()}`}
        </span>
        {hint && <span className={styles.hint}>{hint}</span>}
      </span>
      <span className={styles.track} aria-hidden="true">
        <span className={styles.thumb} />
      </span>
    </button>
  );
}
