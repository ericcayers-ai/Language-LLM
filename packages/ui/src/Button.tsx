import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "ghost" | "danger" | "nav";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  children,
  style,
  type = "button",
  className,
  ...rest
}: ButtonProps) {
  const variantClass =
    variant === "primary"
      ? "llm-btn--primary"
      : variant === "ghost"
        ? "llm-btn--ghost"
        : variant === "danger"
          ? "llm-btn--danger"
          : "llm-btn--nav";

  return (
    <button
      type={type}
      className={["llm-btn", variantClass, "llm-focus-ring", "llm-motion-safe", className]
        .filter(Boolean)
        .join(" ")}
      style={style}
      {...rest}
    >
      {children}
    </button>
  );
}
