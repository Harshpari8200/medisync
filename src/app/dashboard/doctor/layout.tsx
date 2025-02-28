// src/app/doctor/layout.tsx

import { Sidebar } from "@/modules/doctor/ui/components/sidebar";

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 bg-blue-50 min-h-screen">{children}</main>
    </div>
  );
}