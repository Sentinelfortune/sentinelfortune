import type { D1Like } from "../types";
import { insertAuditLog } from "./db";
import { newId } from "./ids";

export async function logAdminAction(
  db: D1Like,
  actorEmail: string,
  action: string,
  targetType: string,
  targetId: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  await insertAuditLog(db, {
    id: newId(),
    actor: actorEmail,
    action,
    target_type: targetType,
    target_id: targetId,
    details_json: JSON.stringify(details),
    created_at: new Date().toISOString(),
  });
}
