import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { colors, fonts } from "./tokens.js";

export type ButtonVariant = "primary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

const variantStyles: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: colors.signalBlue,
    color: colors.paper,
    border: `1px solid ${colors.signalBlue}`,
  },
  ghost: {
    background: "transparent",
    color: colors.ink,
    border: `1px solid ${colors.mutedSlate}`,
  },
  danger: {
    background: colors.errorRed,
    color: colors.paper,
    border: `1px solid ${colors.errorRed}`,
  },
};

export function Button({
  variant = "primary",
  children,
  style,
  type = "button",
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={["llm-focus-ring", "llm-motion-safe", className]
        .filter(Boolean)
        .join(" ")}
      style={{
        fontFamily: fonts.ui,
        fontSize: "0.9375rem",
        lineHeight: 1.3,
        padding: "0.45rem 0.9rem",
        borderRadius: 2,
        cursor: rest.disabled ? "not-allowed" : "pointer",
        opacity: rest.disabled ? 0.55 : 1,
        ...variantStyles[variant],
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
