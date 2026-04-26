"use client";

import { useId, useRef, useState } from "react";
import type { ReactNode } from "react";

export function ConfirmSubmitButton({
  message,
  children,
  className = "",
}: {
  message: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const submitRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const descId = useId();

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      <button ref={submitRef} type="submit" hidden aria-hidden="true" tabIndex={-1} />

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
            className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <p id={titleId} className="text-lg font-semibold text-slate-900">确认清空历史记录</p>
            <p id={descId} className="mt-3 text-sm leading-6 text-slate-600">{message}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  submitRef.current?.click();
                }}
                className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
              >
                确认清空
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
