"use client";

import AdminBottomBar from "@/components/layout/AdminBottomBar";

export default function AdminScreensLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-shell">
      {children}
      <AdminBottomBar />
    </div>
  );
}
