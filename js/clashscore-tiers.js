(function () {
  /**
   * Clashscore Tier Definitions
   *
   * Threshold Calibration:
   * - In Clashe, posting 1 take awards a base of (8 * 2) = 16 points.
   * - Adding images (+6 pts), receiving votes (+2 pts each), receiving comments (+4 pts each),
   *   and controversy balance (+0-12 pts) yields ~25-50 points per active take.
   *
   * Tiers:
   * 0. Rookie   (0 - 99): New arrivals, initial 1-3 takes.
   * 1. Debater  (100 - 499): Active participant, ~4-15 takes with consistent voting/comments.
   * 2. Sharp    (500 - 1,499): Influential contributor, ~15-40 takes generating lively debate.
   * 3. Clasher  (1,500 - 4,999): Platform regular, ~40-100+ high-engagement takes.
   * 4. Legend   (5,000+): Elite debater, 100+ takes with thousands of community votes.
   */
  const TIERS = [
    { name: "Rookie", tierIndex: 0, minScore: 0, nextTierMinScore: 100 },
    { name: "Debater", tierIndex: 1, minScore: 100, nextTierMinScore: 500 },
    { name: "Sharp", tierIndex: 2, minScore: 500, nextTierMinScore: 1500 },
    { name: "Clasher", tierIndex: 3, minScore: 1500, nextTierMinScore: 5000 },
    { name: "Legend", tierIndex: 4, minScore: 5000, nextTierMinScore: null },
  ];

  /**
   * Returns the full ordered list of tier definitions.
   * @returns {Array<{ name: string, tierIndex: number, minScore: number, nextTierMinScore: number | null }>}
   */
  function getAllTiers() {
    return TIERS.map((tier) => ({ ...tier }));
  }

  /**
   * Maps a raw numeric Clashscore to its corresponding tier object with progression metadata.
   * @param {number|string} score
   * @returns {{
   *   name: string,
   *   tierIndex: number,
   *   minScore: number,
   *   nextTierMinScore: number | null,
   *   progressToNext: number
   * }}
   */
  function getClashscoreTier(score) {
    const numericScore = Number(score);
    const safeScore = Number.isFinite(numericScore) ? Math.max(0, numericScore) : 0;

    let matchedTier = TIERS[0];
    for (let i = TIERS.length - 1; i >= 0; i--) {
      if (safeScore >= TIERS[i].minScore) {
        matchedTier = TIERS[i];
        break;
      }
    }

    let progressToNext = 1;
    if (matchedTier.nextTierMinScore !== null) {
      const span = matchedTier.nextTierMinScore - matchedTier.minScore;
      if (span > 0) {
        const rawProgress = (safeScore - matchedTier.minScore) / span;
        progressToNext = Math.min(1, Math.max(0, rawProgress));
      } else {
        progressToNext = 0;
      }
    }

    return {
      name: matchedTier.name,
      tierIndex: matchedTier.tierIndex,
      minScore: matchedTier.minScore,
      nextTierMinScore: matchedTier.nextTierMinScore,
      progressToNext,
    };
  }

  window.ClasheClashscoreTiers = {
    TIERS,
    getAllTiers,
    getClashscoreTier,
  };

  // Alias for naming convention consistency with Clashly* modules
  window.ClashlyClashscoreTiers = window.ClasheClashscoreTiers;
})();
