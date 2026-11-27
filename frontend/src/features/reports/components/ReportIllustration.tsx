import styles from "./report-illustration.module.css";

export function ReportIllustration({ kind }: { kind: "receipt" | "profit" | "cash" | "stock" }) {
  return (
    <div className={`${styles.illustration} ${styles[kind]}`} aria-hidden="true">
      <span /><span /><span />
    </div>
  );
}
