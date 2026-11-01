import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "md" | "sm";
  icon?: ReactNode;
}

/** One primary per view, labelled with a verb (and a count when there is one). */
export function Button({ variant = "secondary", size = "md", icon, children, className = "", ...rest }: Props) {
  return (
    <button className={`btn btn-${variant} btn-${size} ${size === "md" ? "body-strong" : "label"} ${className}`} {...rest}>
      {icon}
      <span>{children}</span>
    </button>
  );
}
