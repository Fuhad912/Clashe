(function () {
  const FUNCTION_NAME = "ai-judge";
  const ALLOWED_STATUS = new Set(["fresh", "cached", "not_eligible"]);
  const ALLOWED_VERDICTS = new Set(["Agree leaning", "Disagree leaning", "Too close to call"]);
  const ALLOWED_CONFIDENCE = new Set(["Low", "Medium", "High"]);

  function getClientOrThrow() {
    if (!window.ClashlySupabase) {
      throw new Error("Supabase client module is not loaded.");
    }

    const client = window.ClashlySupabase.getClient();
    if (!client) {
      throw new Error("Supabase client is not configured.");
    }

    return client;
  }

  function safeString(value) {
    return String(value || "").trim();
  }

  function safeNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  function normalizeTopPick(value) {
    if (!value || typeof value !== "object") return null;
    const commentId = safeString(value.commentId);
    const excerpt = safeString(value.excerpt);
    if (!commentId || !excerpt) return null;
    return {
      commentId,
      excerpt,
    };
  }

  function normalizeJudgeResult(value) {
    if (!value || typeof value !== "object") return null;
    const verdict = safeString(value.verdict);
    const confidence = safeString(value.confidence);
    const reason = safeString(value.reason);
    if (!ALLOWED_VERDICTS.has(verdict) || !ALLOWED_CONFIDENCE.has(confidence) || !reason) return null;

    return {
      verdict,
      confidence,
      reason,
      agreeTop: normalizeTopPick(value.agreeTop),
      disagreeTop: normalizeTopPick(value.disagreeTop),
      analyzedAt: safeString(value.analyzedAt),
      model: safeString(value.model),
    };
  }

  function normalizeEligibility(value) {
    if (!value || typeof value !== "object") {
      return {
        eligible: false,
        reason: "Not enough debate yet for AI Judge.",
        metrics: null,
        thresholds: null,
      };
    }

    const metrics = value.metrics && typeof value.metrics === "object"
      ? {
          totalVotes: safeNumber(value.metrics.totalVotes),
          totalComments: safeNumber(value.metrics.totalComments),
          agreeVotes: safeNumber(value.metrics.agreeVotes),
          disagreeVotes: safeNumber(value.metrics.disagreeVotes),
        }
      : null;

    const thresholds = value.thresholds && typeof value.thresholds === "object"
      ? {
          minVotes: safeNumber(value.thresholds.minVotes),
          minComments: safeNumber(value.thresholds.minComments),
        }
      : null;

    return {
      eligible: Boolean(value.eligible),
      reason: safeString(value.reason),
      metrics,
      thresholds,
    };
  }

  function normalizeResponse(payload) {
    const status = safeString(payload && payload.status);
    if (!ALLOWED_STATUS.has(status)) {
      throw new Error("AI Judge returned an unexpected response.");
    }

    const eligibility = normalizeEligibility(payload && payload.eligibility);
    const result = normalizeJudgeResult(payload && payload.result);

    if ((status === "fresh" || status === "cached") && !result) {
      throw new Error("AI Judge result is missing.");
    }

    return {
      status,
      eligibility,
      result,
    };
  }

  async function analyzeTake(takeId) {
    const safeTakeId = safeString(takeId);
    if (!safeTakeId) {
      return { data: null, error: new Error("Take ID is required.") };
    }

    const client = getClientOrThrow();
    const response = await client.functions.invoke(FUNCTION_NAME, {
      body: {
        takeId: safeTakeId,
      },
    });

    if (response.error) {
      return {
        data: null,
        error: response.error,
      };
    }

    try {
      return {
        data: normalizeResponse(response.data || {}),
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error,
      };
    }
  }

  const MIN_VOTES = 20;
  const MIN_COMMENTS = 6;

  function extractVoteCounts(take) {
    if (!take || typeof take !== "object") {
      return { totalVotes: 0, agreeVotes: 0, disagreeVotes: 0 };
    }

    if (take.vote && typeof take.vote === "object") {
      const agree = Number(take.vote.agree_count) || 0;
      const disagree = Number(take.vote.disagree_count) || 0;
      const total = Number.isFinite(Number(take.vote.total_votes))
        ? Number(take.vote.total_votes)
        : agree + disagree;
      return {
        totalVotes: Math.max(0, Math.floor(total)),
        agreeVotes: Math.max(0, Math.floor(agree)),
        disagreeVotes: Math.max(0, Math.floor(disagree)),
      };
    }

    const agree = Number(take.agree_count) || 0;
    const disagree = Number(take.disagree_count) || 0;
    const directTotals = [take.total_votes, take.vote_count, take.votes_count, take.voteCount];
    let total = 0;
    for (const val of directTotals) {
      if (Number.isFinite(Number(val))) {
        total = Number(val);
        break;
      }
    }
    if (total === 0 && (agree > 0 || disagree > 0)) {
      total = agree + disagree;
    }

    return {
      totalVotes: Math.max(0, Math.floor(total)),
      agreeVotes: Math.max(0, Math.floor(agree)),
      disagreeVotes: Math.max(0, Math.floor(disagree)),
    };
  }

  function extractCommentCount(take) {
    if (!take || typeof take !== "object") return 0;
    const directFields = [
      take.comment_count,
      take.comments_count,
      take.total_comments,
      take.commentCount,
    ];
    for (const field of directFields) {
      if (Number.isFinite(Number(field))) {
        return Math.max(0, Math.floor(Number(field)));
      }
    }
    if (Array.isArray(take.comments)) {
      return take.comments.length;
    }
    return 0;
  }

  function hasJudgeVerdict(take) {
    if (!take || typeof take !== "object") return false;
    if (take.ai_judge) {
      if (take.ai_judge.status === "ready" && take.ai_judge.result) return true;
      if (typeof take.ai_judge === "object" && (take.ai_judge.verdict || take.ai_judge.result)) return true;
      if (typeof take.ai_judge.verdict === "string" && take.ai_judge.verdict.trim().length > 0) return true;
    }
    if (typeof take.ai_judge_verdict === "string" && take.ai_judge_verdict.trim().length > 0) return true;
    if (typeof take.verdict === "string" && take.verdict.trim().length > 0) return true;
    if (typeof take.ai_verdict === "string" && take.ai_verdict.trim().length > 0) return true;
    return false;
  }

  function getJudgeEligibilityProgress(take) {
    const voteThreshold = MIN_VOTES;
    const commentThreshold = MIN_COMMENTS;

    const { totalVotes: voteCount, agreeVotes, disagreeVotes } = extractVoteCounts(take);
    const commentCount = extractCommentCount(take);
    const alreadyJudged = hasJudgeVerdict(take);

    const meetsThresholds = voteCount >= voteThreshold && commentCount >= commentThreshold;
    const isEligible = alreadyJudged || meetsThresholds;

    const missingVotes = isEligible ? 0 : Math.max(0, voteThreshold - voteCount);
    const missingComments = isEligible ? 0 : Math.max(0, commentThreshold - commentCount);

    const voteRatio = Math.min(1, Math.max(0, voteCount / voteThreshold));
    const commentRatio = Math.min(1, Math.max(0, commentCount / commentThreshold));

    let overallProgress;
    if (isEligible) {
      overallProgress = 1;
    } else {
      // Equal 50/50 weighted blend of vote progress and comment progress
      const blended = (voteRatio + commentRatio) / 2;
      // Cap at 0.99 until both thresholds are fulfilled
      overallProgress = Math.min(0.99, Number(blended.toFixed(4)));
    }

    const hasBothSides = agreeVotes > 0 && disagreeVotes > 0;

    return {
      isEligible,
      voteCount,
      voteThreshold,
      commentCount,
      commentThreshold,
      overallProgress,
      missingVotes,
      missingComments,
      voteProgress: Number(voteRatio.toFixed(4)),
      commentProgress: Number(commentRatio.toFixed(4)),
      bottleneckProgress: Number(Math.min(voteRatio, commentRatio).toFixed(4)),
      alreadyJudged,
      hasBothSides,
    };
  }

  window.ClashlyAiJudge = {
    FUNCTION_NAME,
    MIN_VOTES,
    MIN_COMMENTS,
    analyzeTake,
    getJudgeEligibilityProgress,
    hasJudgeVerdict,
  };
  window.ClasheAiJudge = window.ClashlyAiJudge;
})();
