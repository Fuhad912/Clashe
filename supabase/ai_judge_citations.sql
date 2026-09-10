-- ==============================================================================
-- CLASHE — AI JUDGE COMMENT CITATIONS MIGRATION
-- Run this script in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/xpzirxdjydahaczhbyck/sql/new
-- ==============================================================================

-- 1. Add citation tracking columns to comments table
ALTER TABLE public.comments 
ADD COLUMN IF NOT EXISTS ai_judge_cited BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ai_judge_cited_at TIMESTAMPTZ NULL;

-- 2. Create comment_citations table for durable audit logging
CREATE TABLE IF NOT EXISTS public.comment_citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  take_id UUID NOT NULL REFERENCES public.takes(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('agree', 'disagree')),
  cited_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_comment_citations_comment_id ON public.comment_citations(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_citations_take_id ON public.comment_citations(take_id);
CREATE INDEX IF NOT EXISTS idx_comments_ai_judge_cited ON public.comments(ai_judge_cited) WHERE ai_judge_cited = TRUE;

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.comment_citations ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- Readable by anyone (public & authenticated)
DROP POLICY IF EXISTS "Allow public read on comment_citations" ON public.comment_citations;
CREATE POLICY "Allow public read on comment_citations"
  ON public.comment_citations
  FOR SELECT
  USING (true);

-- Direct inserts from anon/authenticated are not allowed per RLS.
-- Inserts must go through service_role or the SECURITY DEFINER function below.

-- 6. Atomic citation recording RPC
CREATE OR REPLACE FUNCTION public.record_comment_citation(
  p_take_id UUID,
  p_comment_id UUID,
  p_side TEXT
)
RETURNS public.comment_citations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_citation public.comment_citations;
BEGIN
  -- Validate comment belongs to take
  IF NOT EXISTS (
    SELECT 1 FROM public.comments 
    WHERE id = p_comment_id AND take_id = p_take_id
  ) THEN
    RAISE EXCEPTION 'Comment % does not belong to take %', p_comment_id, p_take_id;
  END IF;

  -- Validate debate side
  IF p_side NOT IN ('agree', 'disagree') THEN
    RAISE EXCEPTION 'Invalid side: %, must be agree or disagree', p_side;
  END IF;

  -- Insert citation record
  INSERT INTO public.comment_citations (comment_id, take_id, side, cited_at)
  VALUES (p_comment_id, p_take_id, p_side, NOW())
  RETURNING * INTO v_citation;

  -- Mark comment as cited
  UPDATE public.comments
  SET ai_judge_cited = TRUE,
      ai_judge_cited_at = NOW()
  WHERE id = p_comment_id;

  RETURN v_citation;
END;
$$;

-- Grant execution to authenticated and anon users
GRANT EXECUTE ON FUNCTION public.record_comment_citation(UUID, UUID, TEXT) TO authenticated, anon;
