// worker.js

// --- STATE & HELPERS ---
let userDatabase = [];
let teamDatabase = [];
let competitionDatabase = {};
let universityDatabase = [];

// --- DATE & ACADEMIC YEAR HELPERS ---
function getAcademicYear(user) {
    if (!user || !user.universityStartDate) {
        return { year: null, label: 'Unknown' };
    }
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    const start = new Date(user.universityStartDate);
    const startYear = start.getFullYear();
    const startMonth = start.getMonth();
    
    let academicYear = currentYear - startYear;
    if (currentMonth < startMonth) {
        academicYear--;
    }
    academicYear++; // Convert to 1-based index

    if (academicYear === 1) return { year: 1, label: '1st Year' };
    if (academicYear === 2) return { year: 2, label: '2nd Year' };
    if (academicYear === 3) return { year: 3, label: '3rd Year' };
    if (academicYear === 4) return { year: 4, label: '4th Year' };
    if (academicYear > 4 && academicYear < 10) return { year: 5, label: '5th Year+' };
    if (academicYear >= 10) return { year: 6, label: 'Graduated' };
    return { year: 6, label: 'Graduated' };
}

// --- DATA PROCESSING & PRE-COMPUTATION ---
function preprocessData(data) {
    userDatabase = data.users.map(u => {
        const academicYearInfo = getAcademicYear(u);
        return {
            ...u,
            isTrusted: u.isTrusted !== false,
            updatedAt: new Date(u.updatedAt),
            academicYear: academicYearInfo.year,
            academicYearLabel: academicYearInfo.label,
            placements: u.placements.map(p => ({
                ...p,
                percentile: p.total > 0 ? (p.rank / p.total) * 100 : 100,
                date: data.competitions[p.name]?.date
            }))
        };
    }) || [];
    teamDatabase = data.teams || [];
    competitionDatabase = data.competitions || {};
    universityDatabase = data.universities || [];
}

// --- ANALYTICS FUNCTIONS ---

function getIndividualAnalytics(handle) {
    if (!handle) return null;
    const user = userDatabase.find(u => u.handle === handle);
    if (!user) return null;

    const placements = user.placements
        .filter(p => p.date)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    const bestPlacement = placements.length > 0 ? Math.min(...placements.map(p => p.percentile)) : null;
    const totalCompetitions = user.placements.length;
    const soloCompetitions = user.placements.filter(p => !p.teamId).length;
    const teamCompetitions = totalCompetitions - soloCompetitions;

    return {
        user,
        placements,
        bestPlacement,
        totalCompetitions,
        soloCompetitions,
        teamCompetitions
    };
}

function getTeamAnalytics(teamName) {
    if (!teamName) return null;
    const team = teamDatabase.find(t => t.name === teamName);
    if (!team) return null;

    const teamPlacements = userDatabase
        .flatMap(u => u.placements.filter(p => p.teamId === team.id))
        .reduce((acc, p) => {
            if (!acc.some(ap => ap.name === p.name)) {
                acc.push(p);
            }
            return acc;
        }, [])
        .filter(p => p.date)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    const bestPlacement = teamPlacements.length > 0 ? Math.min(...teamPlacements.map(p => p.percentile)) : null;
    const totalCompetitions = teamPlacements.length;

    return {
        team,
        teamPlacements,
        bestPlacement,
        totalCompetitions
    };
}

function getUniversityAnalytics(uniName) {
    if (!uniName) return null;

    const students = userDatabase.filter(u => u.university === uniName);
    const allTeams = teamDatabase.filter(t => t.university === uniName);
    const activeTeams = allTeams.filter(t => t.isActive);

    // Add user handle to each placement for easy access later
    const allPlacements = students.flatMap(student =>
        student.placements.map(p => ({ ...p, handle: student.handle }))
    );

    const topTeamPlacements = Object.values(allPlacements
        .filter(p => p.teamId)
        .reduce((acc, p) => {
            const key = `${p.teamId}-${p.name}`;
            if (!acc[key] || p.percentile < acc[key].percentile) {
                const team = teamDatabase.find(t => t.id === p.teamId);
                if (team) {
                    acc[key] = { ...p, teamName: team.name };
                }
            }
            return acc;
        }, {}))
        .sort((a, b) => a.percentile - b.percentile)
        .slice(0, 5);

    // Now topStudentPlacements will have the 'handle' property
    const topStudentPlacements = allPlacements
        .filter(p => !p.teamId)
        .sort((a, b) => a.percentile - b.percentile)
        .slice(0, 5);

    // Growth chart data
    const studentsWithJoinDate = students.filter(u => u.joinDate);
    const growthData = { labels: [], dataPoints: [] };
    if (studentsWithJoinDate.length > 0) {
        studentsWithJoinDate.sort((a, b) => new Date(a.joinDate) - new Date(b.joinDate));
        let cumulativeTotal = 0;
        const joinCounts = {};
        studentsWithJoinDate.forEach(u => {
            const month = u.joinDate.slice(0, 7);
            joinCounts[month] = (joinCounts[month] || 0) + 1;
        });

        const firstMonth = studentsWithJoinDate[0].joinDate.slice(0, 7);
        const lastMonth = new Date().toISOString().slice(0, 7);
        let current = new Date(firstMonth + '-02');
        const end = new Date(lastMonth + '-02');

        while (current <= end) {
            const monthStr = current.getFullYear() + '-' + (current.getMonth() + 1).toString().padStart(2, '0');
            growthData.labels.push(monthStr);
            cumulativeTotal += (joinCounts[monthStr] || 0);
            growthData.dataPoints.push(cumulativeTotal);
            current.setMonth(current.getMonth() + 1);
        }
    }

    // Active teams chart data
    const activeTeamsData = { labels: [], dataPoints: [] };
    const teamsWithDates = allTeams.filter(t => t.createdAt);
    if (teamsWithDates.length > 0) {
        const dates = teamsWithDates.flatMap(t => [t.createdAt, t.inactiveAt]).filter(Boolean);
        const allMonths = new Set(dates.map(d => d.slice(0, 7)));
        const sortedMonths = Array.from(allMonths).sort();
        
        activeTeamsData.labels = sortedMonths;
        activeTeamsData.dataPoints = sortedMonths.map(month => {
            const monthDate = new Date(month + '-02');
            return teamsWithDates.filter(team => {
                const createdAt = new Date(team.createdAt);
                const inactiveAt = team.inactiveAt ? new Date(team.inactiveAt) : null;
                return createdAt <= monthDate && (!inactiveAt || inactiveAt > monthDate);
            }).length;
        });
    }

    // Students by year chart data
    const yearCounts = { '1st Year': 0, '2nd Year': 0, '3rd Year': 0, '4th Year': 0, '5th Year+': 0, 'Graduated': 0, 'Unknown': 0 };
    students.forEach(s => {
        const yearLabel = s.academicYearLabel || 'Unknown';
        if (yearCounts.hasOwnProperty(yearLabel)) {
            yearCounts[yearLabel]++;
        } else {
            yearCounts['Unknown']++;
        }
    });
    const studentsByYearData = {
        labels: Object.keys(yearCounts).filter(k => yearCounts[k] > 0),
        data: Object.values(yearCounts).filter(v => v > 0)
    };


    return {
        uniName,
        students,
        allTeams,
        activeTeams,
        topTeamPlacements,
        topStudentPlacements,
        growthData,
        activeTeamsData,
        studentsByYearData
    };
}

function getContestSeries(name) {
    if (!name) return '';
    return name.replace(/\b\d{4}\b/g, '').trim().toLowerCase();
}

function isFirstTimeForUser(userHandle, currentCompName) {
    const currentSeries = getContestSeries(currentCompName);
    if (!currentSeries) return false;
    const user = userDatabase.find(u => u.handle.toLowerCase() === userHandle.toLowerCase());
    if (!user) return false;

    const hasPastParticipation = user.placements.some(p => {
        return p.name !== currentCompName && getContestSeries(p.name) === currentSeries;
    });
    return !hasPastParticipation;
}

function isFirstTimeForTeam(team, currentCompName) {
    for (const memberHandle of team.members) {
        if (!isFirstTimeForUser(memberHandle, currentCompName)) {
            return false;
        }
    }
    return true;
}

function getCompetitionAnalytics(compName) {
    if (!compName) return null;

    const individualStandings = userDatabase.flatMap(user => {
        return user.placements
            .filter(p => p.name === compName)
            .map(p => {
                const team = p.teamId ? teamDatabase.find(t => t.id === p.teamId) : null;
                return {
                    rank: p.rank,
                    handle: user.handle,
                    university: user.university,
                    teamName: team ? team.name : null,
                    teamId: team ? team.id : null,
                    isFirstTime: isFirstTimeForUser(user.handle, compName)
                };
            });
    }).sort((a, b) => a.rank - b.rank);

    const teamPlacementsAgg = individualStandings.filter(p => p.teamId).reduce((acc, p) => {
        if (!acc[p.teamId]) {
            const team = teamDatabase.find(t => t.id === p.teamId);
            if (team) {
                acc[p.teamId] = {
                    rank: p.rank,
                    teamName: team.name,
                    university: team.university,
                    members: team.members,
                    teamId: team.id,
                    isFirstTime: isFirstTimeForTeam(team, compName)
                };
            }
        }
        return acc;
    }, {});
    const teamStandings = Object.values(teamPlacementsAgg).sort((a, b) => a.rank - b.rank);

    return { individualStandings, teamStandings };
}

function getGlobalAnalytics() {
    const uniScores = {};
    universityDatabase.forEach(uni => {
        const students = userDatabase.filter(u => u.university === uni);
        if (students.length > 0) {
            const totalPlacements = students.flatMap(s => s.placements);
            if (totalPlacements.length > 0) {
                const avgPercentile = totalPlacements.reduce((sum, p) => sum + p.percentile, 0) / totalPlacements.length;
                uniScores[uni] = {
                    score: students.length * (100 - avgPercentile),
                    students: students.length,
                    avgPercentile: avgPercentile
                };
            }
        }
    });
    const topUniversities = Object.entries(uniScores).sort((a, b) => b[1].score - a[1].score).slice(0, 5);

    const individualScores = {};
    userDatabase.forEach(u => {
        const topPlacements = u.placements.filter(p => p.percentile <= 10).length;
        if (topPlacements > 0) {
            individualScores[u.handle] = topPlacements;
        }
    });
    const topIndividuals = Object.entries(individualScores).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Active teams growth chart data
    const activeTeamsGrowth = { labels: [], dataPoints: [] };
    if (teamDatabase.length > 0) {
        const dates = teamDatabase.flatMap(t => [t.createdAt, t.inactiveAt]).filter(Boolean);
        if (dates.length > 0) {
            const allMonths = new Set(dates.map(d => d.slice(0, 7)));
            const sortedMonths = Array.from(allMonths).sort();
            activeTeamsGrowth.labels = sortedMonths;
            activeTeamsGrowth.dataPoints = sortedMonths.map(month => {
                const monthDate = new Date(month + '-02');
                return teamDatabase.filter(team => {
                    const createdAt = new Date(team.createdAt);
                    const inactiveAt = team.inactiveAt ? new Date(team.inactiveAt) : null;
                    return createdAt <= monthDate && (!inactiveAt || inactiveAt >= monthDate);
                }).length;
            });
        }
    }

    // Distribution chart data
    const userUniCounts = universityDatabase.reduce((acc, uni) => {
        acc[uni] = userDatabase.filter(u => u.university === uni).length;
        return acc;
    }, {});
    const sortedUserUnis = Object.entries(userUniCounts).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]);
    const userDistribution = { labels: sortedUserUnis.map(u => u[0]), data: sortedUserUnis.map(u => u[1]) };

    const teamUniCounts = universityDatabase.reduce((acc, uni) => {
        acc[uni] = teamDatabase.filter(t => t.university === uni).length;
        return acc;
    }, {});
    const sortedTeamUnis = Object.entries(teamUniCounts).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]);
    const teamDistribution = { labels: sortedTeamUnis.map(u => u[0]), data: sortedTeamUnis.map(u => u[1]) };

    return {
        topUniversities,
        topIndividuals,
        activeTeamsGrowth,
        userDistribution,
        teamDistribution
    };
}


// --- MESSAGE HANDLER ---
self.onmessage = function(e) {
    const { type, payload, requestId } = e.data;
    let result;

    try {
        switch (type) {
            case 'INIT_DATA':
                preprocessData(payload);
                result = {
                    users: userDatabase.map(u => ({ handle: u.handle, fullName: u.fullName })),
                    teams: teamDatabase.map(t => ({ name: t.name, id: t.id })),
                    universities: universityDatabase,
                    competitions: Object.keys(competitionDatabase)
                };
                break;
            case 'GET_INITIAL_DATA':
                result = {
                    users: userDatabase.map(u => ({ handle: u.handle, fullName: u.fullName })),
                    teams: teamDatabase.map(t => ({ name: t.name, id: t.id })),
                    universities: universityDatabase,
                    competitions: Object.keys(competitionDatabase)
                };
                break;
            case 'GET_INDIVIDUAL_ANALYTICS':
                result = getIndividualAnalytics(payload);
                break;
            case 'GET_TEAM_ANALYTICS':
                result = getTeamAnalytics(payload);
                break;
            case 'GET_UNIVERSITY_ANALYTICS':
                result = getUniversityAnalytics(payload);
                break;
            case 'GET_COMPETITION_ANALYTICS':
                result = getCompetitionAnalytics(payload);
                break;
            case 'GET_GLOBAL_ANALYTICS':
                result = getGlobalAnalytics();
                break;
            case 'GET_USER_DETAILS':
                const userHandle = payload.toLowerCase();
                result = {
                    user: userDatabase.find(u => u.handle.toLowerCase() === userHandle),
                    teams: teamDatabase.filter(t => t.members.map(m => m.toLowerCase()).includes(userHandle))
                };
                break;
            case 'GET_TEAM_DETAILS':
                 const team = teamDatabase.find(t => t.id === payload);
                 if (team) {
                    const teamPlacements = userDatabase
                        .flatMap(u => u.placements.filter(p => p.teamId === team.id))
                        .reduce((acc, p) => {
                            if (!acc.some(ap => ap.name === p.name)) acc.push(p);
                            return acc;
                        }, [])
                        .sort((a, b) => (competitionDatabase[b.name]?.date || '').localeCompare(competitionDatabase[a.name]?.date || ''));
                    result = { team, teamPlacements };
                 } else {
                    result = null;
                 }
                break;
            default:
                throw new Error(`Unknown message type: ${type}`);
        }
        // Post message back to the main thread
        self.postMessage({ type: `${type}_SUCCESS`, payload: result, requestId });

    } catch (error) {
        console.error(`Error in worker for type ${type}:`, error);
        self.postMessage({ type: `${type}_ERROR`, payload: error.message, requestId });
    }
};

