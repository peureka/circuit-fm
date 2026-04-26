// Scoring for the Circuit FM leaderboard.
//
// Per the reconciled spec (docs/CULTURE_CLUB_VISION_V2.md > "The Card and the Board"):
//   +1  the recipient tapped a member's card and joined the Queue
//   +3  the recipient reached Floor (attended their first outing)
//   +10 the recipient became a voucher themselves (was handed a card)
//
// These are cumulative milestones. A recipient who reaches Floor has already
// joined the Queue, so they score 1 + 3 = 4. A recipient who becomes a voucher
// has also reached Floor, so they score 1 + 3 + 10 = 14.
//
// Each `vouches` document tracks the highest milestone reached in its `status`
// field. The lookup below returns the cumulative score for that status.

const CUMULATIVE_POINTS = {
  tapped: 1,
  floor: 4, // 1 + 3
  voucher: 14, // 1 + 3 + 10
};

function scoreForStatus(status) {
  if (!status || typeof status !== "string") return 0;
  return CUMULATIVE_POINTS[status] || 0;
}

function scoreForMember(vouches, memberId) {
  let total = 0;
  for (const v of vouches) {
    if (v.from_member_id === memberId) {
      total += scoreForStatus(v.status);
    }
  }
  return total;
}

function topN(vouches, n) {
  const scoresByMember = new Map();
  for (const v of vouches) {
    const s = scoreForStatus(v.status);
    if (s === 0) continue;
    const current = scoresByMember.get(v.from_member_id) || 0;
    scoresByMember.set(v.from_member_id, current + s);
  }
  return Array.from(scoresByMember.entries())
    .map(([memberId, score]) => ({ memberId, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

module.exports = {
  CUMULATIVE_POINTS,
  scoreForStatus,
  scoreForMember,
  topN,
};
