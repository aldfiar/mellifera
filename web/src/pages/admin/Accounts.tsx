// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from "react";

import AdminTabs from "@/pages/admin/AdminTabs";
import ExplainViewer from "@/pages/admin/accounts/ExplainViewer";
import GroupsPanel from "@/pages/admin/accounts/GroupsPanel";
import UsersPanel from "@/pages/admin/accounts/UsersPanel";

// Accounts — the admin accounts surface (/admin/accounts, l6-accounts 9.4):
// ONE page with three sections over the 9.1/9.2/9.3 endpoints — the users
// panel, the groups panel, and the visibility-explain viewer. The layout is
// the admin-surface pattern (Collections/Sources/Plugins/Pairing): the
// shared AdminTabs row, then sections. The surface lives behind the served
// role gate (8.3): the sidebar's Admin link is rendered only for an admin
// principal, and a non-admin reaching the route by URL gets the backend's
// 401/403 surfaced honestly by the panels' inline error states — no new
// auth logic client-side.
export default function Accounts(): ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <AdminTabs />
      <UsersPanel />
      <GroupsPanel />
      <ExplainViewer />
    </div>
  );
}
