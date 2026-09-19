import { useEffect, useRef, type ReactNode } from "react";
export function RefundDialog({
  title,
  children,
  onClose,
  wide = false,
  error,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  error?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    const previous = document.activeElement as HTMLElement;
    d?.showModal();
    return () => {
      d?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      className={`refund-dialog ${wide ? "wide" : ""}`}
      ref={ref}
      aria-labelledby="refund-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="drawer-head">
        <h3 id="refund-dialog-title">{title}</h3>
        <button className="text-button" onClick={onClose} aria-label="关闭弹窗">
          关闭
        </button>
      </div>
      {error && (
        <p className="refund-error" role="alert">
          {error}
        </p>
      )}
      {children}
    </dialog>
  );
}
