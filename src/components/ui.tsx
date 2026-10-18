"use client";

import React from "react";

/** Rounded pill button used for every selector in the lab. */
export function Chip({
  active,
  onClick,
  children,
  title,
  tone = "walnut",
  size = "md",
  className = "",
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  title?: string;
  tone?: "walnut" | "honey" | "rust";
  size?: "md" | "lg";
  className?: string;
}) {
  const activeClasses = {
    walnut: "bg-walnut-600 text-cream-50 border-walnut-700 shadow-chip",
    honey: "bg-honey-400 text-bark-900 border-honey-500 shadow-chip",
    rust: "bg-rust-500 text-cream-50 border-rust-600 shadow-chip",
  }[tone];
  const sizeClasses = size === "lg" ? "px-4 py-2 text-sm" : "px-3.5 py-1.5 text-[13px]";
  return (
    <button
      type="button"
      title={title}
      aria-pressed={!!active}
      onClick={onClick}
      className={`cursor-pointer rounded-full border font-semibold leading-tight transition-all whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-honey-400 focus-visible:ring-offset-1 ${sizeClasses} ${
        active ? activeClasses : "bg-cream-50 text-bark-700 border-bark-200 hover:border-bark-400 hover:bg-cream-200"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function StepHeading({ step, title, hint }: { step?: number; title: string; hint?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mb-2.5">
      {step !== undefined && (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-honey-400 text-bark-900 text-[12px] font-bold shrink-0">
          {step}
        </span>
      )}
      <span className="font-display text-lg text-bark-800 whitespace-nowrap">{title}</span>
      {hint && <span className="text-xs text-bark-400 basis-full sm:basis-auto sm:ml-0 ml-8">{hint}</span>}
    </div>
  );
}

export function Panel({
  children,
  className = "",
  title,
  subtitle,
  actions,
  flush = false,
}: {
  children: React.ReactNode;
  className?: string;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  flush?: boolean;
}) {
  return (
    <section className={`bg-cream-50 rounded-2xl border border-bark-100 shadow-card ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
          <div>
            <h2 className="font-display text-xl text-bark-800 leading-tight">{title}</h2>
            {subtitle && <p className="text-xs text-bark-400 mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={flush ? "" : "px-5 pb-5"}>{children}</div>
    </section>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="cursor-pointer inline-flex items-center gap-2 select-none text-[13px] font-medium text-bark-600 hover:text-bark-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-honey-400 rounded-full"
    >
      <span className={`relative inline-block w-9 h-5 rounded-full transition-colors shadow-inset ${checked ? "bg-sage-500" : "bg-bark-200"}`}>
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-cream-50 shadow transition-transform ${checked ? "translate-x-4" : ""}`} />
      </span>
      {label}
    </button>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; title?: string }[] }) {
  return (
    <div className="inline-flex rounded-full border border-bark-200 bg-cream-200 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`cursor-pointer px-3.5 py-1.5 text-[13px] font-semibold rounded-full whitespace-nowrap transition-colors ${
            value === o.value ? "bg-walnut-600 text-cream-50 shadow-chip" : "text-bark-600 hover:text-bark-900"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-bark-600">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full border border-white/60" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

export function GhostButton({ onClick, children, title }: { onClick?: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="cursor-pointer text-xs font-semibold px-3 py-1.5 rounded-full border border-bark-200 bg-cream-50 text-bark-700 hover:bg-cream-200 hover:border-bark-400 transition-colors"
    >
      {children}
    </button>
  );
}
