import { createClient } from '@/utils/supabase/client';
import { logAuditEvent } from '@/utils/audit';

export async function terminateTerminalSession(managerName?: string) {
  const supabase = createClient();

  try {
    // 1. Record audit event before ending session
    await logAuditEvent({
      actionType: 'SYSTEM_EVENT',
      severity: 'WARN',
      summary: `Terminal account session terminated / signed out by ${managerName || 'Manager'}`,
      details: {
        timestamp: new Date().toISOString(),
        authorized_by: managerName || 'Manager',
        client_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
      },
    });

    // 2. Sign out of Supabase Auth
    await supabase.auth.signOut();
  } catch (err) {
    console.warn('Error during audit log or signOut:', err);
  } finally {
    // 3. Clear sensitive local state
    if (typeof window !== 'undefined') {
      localStorage.removeItem('kitchos_active_staff');
      localStorage.removeItem('kitchos_active_branch_id');
      localStorage.removeItem('kitchos_terminal_locked');
      
      // 4. Redirect to login
      window.location.href = '/login';
    }
  }
}