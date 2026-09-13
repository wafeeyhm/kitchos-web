'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';

export interface Branch {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
}

interface BranchContextType {
  branches: Branch[];
  currentBranch: Branch | null;
  setCurrentBranch: (branch: Branch) => void;
  loadingBranches: boolean;
  refreshBranches: () => Promise<void>;
}

const BranchContext = createContext<BranchContextType | undefined>(undefined);

export function BranchProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [currentBranch, setCurrentBranchState] = useState<Branch | null>(null);
  const [loadingBranches, setLoadingBranches] = useState<boolean>(true);

  const fetchBranches = useCallback(async () => {
    try {
      setLoadingBranches(true);
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      const activeBranches = (data as Branch[]) || [];
      setBranches(activeBranches);

      // Check saved branch in localStorage
      const savedBranchId = localStorage.getItem('kitchos_active_branch_id');
      const found = activeBranches.find((b) => b.id === savedBranchId);

      if (found) {
        setCurrentBranchState(found);
      } else if (activeBranches.length > 0) {
        setCurrentBranchState(activeBranches[0]);
        localStorage.setItem('kitchos_active_branch_id', activeBranches[0].id);
      }
    } catch (err: any) {
      console.error('Error fetching branches:', err.message);
    } finally {
      setLoadingBranches(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  const setCurrentBranch = (branch: Branch) => {
    setCurrentBranchState(branch);
    localStorage.setItem('kitchos_active_branch_id', branch.id);
  };

  return (
    <BranchContext.Provider
      value={{
        branches,
        currentBranch,
        setCurrentBranch,
        loadingBranches,
        refreshBranches: fetchBranches,
      }}
    >
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  const context = useContext(BranchContext);
  if (!context) {
    throw new Error('useBranch must be used within a BranchProvider');
  }
  return context;
}