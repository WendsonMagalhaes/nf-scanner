"use client";

import { Toaster as SonnerToaster } from "sonner";

/** Área de toasts do app (canto superior direito). */
export default function Toaster() {
  return <SonnerToaster position="top-right" richColors closeButton duration={4500} />;
}
