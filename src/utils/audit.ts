import { createClient } from '@/utils/supabase/client';

export type AuditSeverity = 'INFO' | 'WARN' | 'CRITICAL';

export type AuditActionType =
  | 'VOID_SALE'
  | 'PRICE_OVERRIDE'
  | 'MENU_UPDATE'
  | 'STOCK_ADJUSTMENT'
  | 'TILL_FLOAT_OPEN'
  | 'TILL_FLOAT_CLOSE'
  | 'TERMINAL_LOCK'
  | 'TERMINAL_UNLOCK'
  | 'BRANCH_UPDATE'
  | 'PAYMENT_CONFIG_CHANGE'
  | 'MANAGER_OVERRIDE'
  | 'SYSTEM_EVENT';

interface LogAuditParams {
  branchId?: string | null;
  staffId?: string | null;
  actionType: AuditActionType;
  severity?: AuditSeverity;
  entityName?: string;
  entityId?: string;
  summary: string;
  details?: Record<string, any>;
}

export async function logAuditEvent({
  branchId = null,
  staffId = null,
  actionType,
  severity = 'INFO',
  entityName = 'general',
  entityId = undefined,
  summary,
  details = {},
}: LogAuditParams) {
  try {
    const supabase = createClient();

    // If staffId not provided, check localStorage
    let resolvedStaffId = staffId;
    if (!resolvedStaffId && typeof window !== 'undefined') {
      const savedStaff = localStorage.getItem('kitchos_active_staff');
      if (savedStaff) {
        try {
          const parsed = JSON.parse(savedStaff);
          resolvedStaffId = parsed.id || null;
        } catch (e) {}
      }
    }

    // If branchId not provided, check localStorage
    let resolvedBranchId = branchId;
    if (!resolvedBranchId && typeof window !== 'undefined') {
      resolvedBranchId = localStorage.getItem('kitchos_active_branch_id') || null;
    }

    const { error } = await supabase.rpc('log_audit_event', {
      p_branch_id: resolvedBranchId,
      p_staff_id: resolvedStaffId,
      p_action_type: actionType,
      p_severity: severity,
      p_entity_name: entityName,
      p_entity_id: entityId || null,
      p_summary: summary,
      p_details: details,
    });

    if (error) {
      console.warn('Audit RPC failed, falling back to direct table insert:', error.message);
      await supabase.from('audit_logs').insert({
        branch_id: resolvedBranchId,
        staff_id: resolvedStaffId,
        action_type: actionType,
        severity,
        entity_name: entityName,
        entity_id: entityId || null,
        summary,
        details,
      });
    }
  } catch (err) {
    // Non-blocking catch to ensure core checkout/operations never crash if logging fails
    console.error('Failed to record audit log event:', err);
  }
}