
-- Fix RLS policies for bookmaker_stake_reservations
-- The current policies have incorrect correlated subquery references

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view reservations in their workspace" ON public.bookmaker_stake_reservations;
DROP POLICY IF EXISTS "Users can create reservations in their workspace" ON public.bookmaker_stake_reservations;
DROP POLICY IF EXISTS "Users can update their own reservations" ON public.bookmaker_stake_reservations;
DROP POLICY IF EXISTS "Users can delete their own reservations" ON public.bookmaker_stake_reservations;

-- Create corrected SELECT policy
-- Users can view ALL active reservations in their workspace (including from other users)
-- This is critical for the real-time balance reservation system to work
CREATE POLICY "Workspace members can view active reservations"
ON public.bookmaker_stake_reservations
FOR SELECT
USING (
  workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  )
);

-- Create INSERT policy - users can only insert their own reservations
CREATE POLICY "Users can create own reservations"
ON public.bookmaker_stake_reservations
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  )
);

-- Create UPDATE policy - users can only update their own reservations
CREATE POLICY "Users can update own reservations"
ON public.bookmaker_stake_reservations
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Create DELETE policy - users can only delete their own reservations
CREATE POLICY "Users can delete own reservations"
ON public.bookmaker_stake_reservations
FOR DELETE
USING (user_id = auth.uid());
