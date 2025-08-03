// --- Model Weights ---
export const weights = {
    bias: -7.0,
    maxRating: 0.02,
    avgRating: 0.01,
    contestCount: 0.03,
    lunaScore: 0.04,
    placementScore: 0.08,
    avgDiv2PerfScore: 0.16,
    weightedSolves: 0.05,
    activityScore: 0.08,
    inactivityPattern: -0.04,
    skipped: -0.015,
};

// --- Core Calculation Logic & Model ---
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const logisticCurve = (x, L, k, x0) => L / (1 + Math.exp(-k * (x - x0)));

// --- Feature Scoring Functions ---
export function getScoreFromMaxRating(maxRating) { return logisticCurve(maxRating, 60, 0.01, 1750); }
export function getScoreFromAvgRating(avgRating) { return logisticCurve(avgRating, 50, 0.012, 1650); }
export function getScoreFromContestCount(contestCount) { return logisticCurve(contestCount, 25, 0.06, 60); }
export function getScoreFromAvgDiv2Performance(avgScore) { return logisticCurve(avgScore, 100, 0.3, 10); }
export function getCombinedLunaScore(lunaNovaScore, lunaHardScore) {
    const combinedRaw = (lunaNovaScore * 0.5) + (lunaHardScore * 1.5);
    return logisticCurve(combinedRaw, 50, 0.025, 300);
}
export function getScoreFromPlacements(placements) {
    if (!placements || placements.length === 0) return 0;
    const invertedScores = placements.map(p => 100 - p);
    const sumOfSquares = invertedScores.reduce((acc, score) => acc + score * score, 0);
    const rms = Math.sqrt(sumOfSquares / invertedScores.length);
    return logisticCurve(rms, 70, 0.08, 75);
}
export function getRecencyWeightedSolvedProblemScore(submissions) {
    let score = 0;
    const solvedProblemIds = new Set();
    const now = Date.now() / 1000;
    const DECAY_CONSTANT = 0.005;
    const RATING_BASE = 1200;
    const GROWTH_FACTOR = 1.15;
    const sortedSubmissions = submissions.sort((a, b) => b.creationTimeSeconds - a.creationTimeSeconds);
    for (const sub of sortedSubmissions) {
        if (sub.verdict !== 'OK' || !sub.problem.rating) continue;
        const problemId = `${sub.problem.contestId || 'gym'}-${sub.problem.index}`;
        if (solvedProblemIds.has(problemId)) continue;
        solvedProblemIds.add(problemId);
        const daysOld = (now - sub.creationTimeSeconds) / (60 * 60 * 24);
        const recencyWeight = Math.exp(-DECAY_CONSTANT * daysOld);
        const problemScore = Math.pow(GROWTH_FACTOR, (sub.problem.rating - RATING_BASE) / 100);
        score += problemScore * recencyWeight;
    }
    return logisticCurve(score, 40, 0.002, 1500);
}
export function calculateActivityAndInactivityMetrics(submissions) {
    const oneDay = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const DECAY_CONSTANT = 0.003;
    const dailyActivity = new Map();
    submissions.forEach(sub => {
        if (sub.verdict === 'OK') {
            const date = new Date(sub.creationTimeSeconds * 1000);
            date.setHours(0, 0, 0, 0);
            const dateStr = date.toISOString().split('T')[0];
            if (!dailyActivity.has(dateStr)) {
                dailyActivity.set(dateStr, { count: 0, timestamp: date.getTime() });
            }
            dailyActivity.get(dateStr).count++;
        }
    });
    let rawActivityScore = 0;
    for (const data of dailyActivity.values()) {
        const daysOld = (now - data.timestamp) / oneDay;
        const recencyWeight = Math.exp(-DECAY_CONSTANT * daysOld);
        const dailyContribution = Math.sqrt(data.count);
        rawActivityScore += dailyContribution * recencyWeight;
    }
    const uniqueActiveDays = dailyActivity.size;
    if (uniqueActiveDays < 3) return { rawActivityScore, uniqueActiveDays, inactivityScore: 100, avgGap: 365, stdDevGap: 0 };
    const sortedTimestamps = Array.from(dailyActivity.values()).map(d => d.timestamp).sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < sortedTimestamps.length; i++) {
        gaps.push((sortedTimestamps[i] - sortedTimestamps[i - 1]) / oneDay);
    }
    const sumGaps = gaps.reduce((acc, val) => acc + val, 0);
    const avgGap = sumGaps / gaps.length;
    const variance = gaps.reduce((acc, val) => acc + Math.pow(val - avgGap, 2), 0) / gaps.length;
    const stdDevGap = Math.sqrt(variance);
    const lastSubTimestamp = sortedTimestamps[sortedTimestamps.length - 1];
    const recencyGap = (now - lastSubTimestamp) / oneDay;
    const rawPenalty = avgGap + (2 * stdDevGap) + (1.5 * recencyGap);
    const inactivityScore = logisticCurve(rawPenalty, 100, 0.1, 40);
    return { rawActivityScore, uniqueActiveDays, inactivityScore, avgGap, stdDevGap };
}
export function getScoreFromActivity(rawActivityScore) { return logisticCurve(rawActivityScore, 50, 0.1, 50); }
export function calculateReadinessProbability(stats) {
    let { scoreMaxRating, scoreAvgRating, scoreContestCount, scoreFromCombinedLuna, scoreFromPlacements, scoreFromAvgDiv2Performance, scoreWeightedSolvedProblems, scoreFromActivity, inactivityScore } = stats;
    if (!stats.isTrusted) {
        const cfPenaltyFactor = 0.1, manualPenaltyFactor = 0.8;
        scoreMaxRating *= cfPenaltyFactor; scoreAvgRating *= cfPenaltyFactor; scoreContestCount *= cfPenaltyFactor;
        scoreFromAvgDiv2Performance *= cfPenaltyFactor; scoreWeightedSolvedProblems *= cfPenaltyFactor;
        scoreFromActivity *= cfPenaltyFactor; scoreFromCombinedLuna *= manualPenaltyFactor; inactivityScore *= 0.5;
    }
    const z = weights.bias + (scoreMaxRating * weights.maxRating) + (scoreAvgRating * weights.avgRating) + (scoreContestCount * weights.contestCount) + (scoreFromCombinedLuna * weights.lunaScore) + (scoreFromPlacements * weights.placementScore) + (scoreFromAvgDiv2Performance * weights.avgDiv2PerfScore) + (scoreWeightedSolvedProblems * weights.weightedSolves) + (scoreFromActivity * weights.activityScore) + (inactivityScore * weights.inactivityPattern) + (stats.skippedSubmissionsCount * weights.skipped);
    return sigmoid(z);
}
export function calculateAvgDiv2PerformanceScore(div2Submissions, div2ContestCount) {
    if (!div2Submissions || div2Submissions.length === 0 || div2ContestCount === 0) return 0;
    const solvedInDiv2 = {};
    for (const sub of div2Submissions) {
        if (sub.verdict === 'OK') {
            if (!solvedInDiv2[sub.contestId]) solvedInDiv2[sub.contestId] = new Set();
            solvedInDiv2[sub.contestId].add(sub.problem.index);
        }
    }
    const problemWeights = { 'A': 1, 'B': 2, 'C': 4, 'D': 8, 'E': 12, 'F': 16 };
    let totalPerformanceScore = 0;
    for (const contestId in solvedInDiv2) {
        const contestScore = Array.from(solvedInDiv2[contestId]).reduce((score, problemIndex) => score + (problemWeights[problemIndex.charAt(0).toUpperCase()] || 0), 0);
        totalPerformanceScore += contestScore;
    }
    return totalPerformanceScore / div2ContestCount;
}

