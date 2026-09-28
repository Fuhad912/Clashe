-- Migration: Add pinned_take_id to profiles table
-- Run this script in the Supabase SQL Editor

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS pinned_take_id uuid REFERENCES takes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_pinned_take_id ON profiles(pinned_take_id);
