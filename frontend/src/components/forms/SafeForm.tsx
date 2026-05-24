import type { FormHTMLAttributes, ReactNode } from "react";

interface SafeFormProps extends FormHTMLAttributes<HTMLFormElement> {
  children: ReactNode;
  onSafeSubmit?: () => void;
}

export function SafeForm({ children, onSafeSubmit, onSubmit, ...props }: SafeFormProps) {
  return (
    <form
      {...props}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(e);
        onSafeSubmit?.();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) {
          e.preventDefault();
        }
        props.onKeyDown?.(e);
      }}
    >
      {children}
    </form>
  );
}
