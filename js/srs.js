// ═══════════════════════════════════════════════════════════
//  SRS.JS — Spaced Repetition Algorithm (SM-2 based)
// ═══════════════════════════════════════════════════════════

const SRS = {

  /**
   * Calculate next review interval based on rating
   * @param {Object} card - card with SRS fields
   * @param {number} rating - 0=again, 1=hard, 2=good, 3=easy
   * @returns {Object} updated SRS fields
   */
  nextInterval(card, rating) {
    let { interval = 1, easeFactor = 2.5, repetitions = 0 } = card;

    if (rating === 0) {
      // Again: reset
      repetitions = 0;
      interval = 1;
      easeFactor = Math.max(1.3, easeFactor - 0.2);

    } else if (rating === 1) {
      // Hard: short interval, reduce ease
      interval = Math.max(1, Math.ceil(interval * 1.2));
      easeFactor = Math.max(1.3, easeFactor - 0.15);

    } else if (rating === 2) {
      // Good: standard progression
      if (repetitions === 0)      interval = 1;
      else if (repetitions === 1) interval = 3;
      else                        interval = Math.ceil(interval * easeFactor);
      repetitions++;

    } else if (rating === 3) {
      // Easy: accelerated progression
      if (repetitions === 0)      interval = 2;
      else if (repetitions === 1) interval = 5;
      else                        interval = Math.ceil(interval * easeFactor * 1.15);
      easeFactor = Math.min(2.8, easeFactor + 0.15);
      repetitions++;
    }

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + interval);

    return {
      interval,
      easeFactor: parseFloat(easeFactor.toFixed(2)),
      repetitions,
      nextDate: nextDate.toISOString().slice(0, 10),
      lastReviewed: new Date().toISOString().slice(0, 10)
    };
  },

  /**
   * Check if a card is due today
   */
  isDue(card) {
    const today = new Date().toISOString().slice(0, 10);
    return !card.nextDate || card.nextDate <= today;
  },

  /**
   * Get default SRS fields for a new card
   */
  defaults() {
    return {
      interval: 1,
      easeFactor: 2.5,
      repetitions: 0,
      nextDate: new Date().toISOString().slice(0, 10),
      lastReviewed: null
    };
  },

  /**
   * Calculate mastery percentage for a set of cards
   */
  masteryPercent(cards) {
    if (!cards || cards.length === 0) return 0;
    const total = cards.reduce((sum, c) => {
      const score = Math.min(100, (c.repetitions || 0) * 20);
      return sum + score;
    }, 0);
    return Math.round(total / cards.length);
  }
};