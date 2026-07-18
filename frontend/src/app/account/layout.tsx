import { Outlet } from "react-router-dom";
import { AccountShell } from "@/components/dashboard/AccountShell";

export default function AccountLayout() {
  return (
    <AccountShell>
      <Outlet />
    </AccountShell>
  );
}
