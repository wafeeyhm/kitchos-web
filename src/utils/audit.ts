import { SupabaseClient } from '@supabase/supabase-js'

export type AuditLogParams = {
  supabase: SupabaseClient
  tenantId: string
  userId?: string | null
  userEmail?: string | null
  action: string
  entityType: string
  entityId?: string | null
  details?: Record<string, unknown>
}

export async function createAuditLog({
  supabase,
  tenantId,
  userId,
  userEmail,
  action,
  entityType,
  entityId,
  details = {},
}: AuditLogParams) {
  try {
    const { error } = await supabase.from('audit_logs').insert({
      tenant_id: tenantId,
      user_id: userId || null,
      user_email: userEmail || null,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      details,
    })

    if (error) {
      console.error('Failed to create audit log:', error.message)
    }
  } catch (err) {
    console.error('Unexpected error while logging audit event:', err)
  }
}