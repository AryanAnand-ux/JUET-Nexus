import React from "react";

export function LoginIllustration() {
  return (
    <aside className="hidden md:flex md:w-1/2 bg-[#e8effe] items-center justify-center p-8 md:p-10 select-none overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/login-illustration.jpg"
        alt="Student working on a laptop on pastel pedestals"
        className="w-full max-w-[400px] h-full object-contain mix-blend-multiply pointer-events-none select-none"
      />
    </aside>
  );
}
