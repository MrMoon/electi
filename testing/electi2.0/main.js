import { firebaseServices } from './firebase-config.js';
import { apiQueue } from './api.js';
import * as model from './model.js';
import { DOM, updateUserListDisplay, updateTableRow, updateSortIndicators, displayError, hideError, showLoading, hideLoading, getConfidenceCategory } from './ui.js';

// --- State Variables ---
let usersToAnalyze = [];
let cachedUserData = [];
let ratingChart = null;
let problemChart = null;
let sortState = { key: 'readinessProbability', direction: 'desc' };
let activeFilter = 'all';
let currentUser = null;

// --- Firebase Auth Logic ---
firebaseServices.onAuthStateChanged(firebaseServices.auth, (user) => {
    currentUser = user;
    if (user) {
        DOM.loggedInState.classList.remove('hidden');
        DOM.loggedOutState.classList.add('hidden');
        DOM.userEmailSpan.textContent = user.email;
        toggleModal(DOM.authModal, false);
    } else {
        DOM.loggedInState.classList.add('hidden');
        DOM.loggedOutState.classList.remove('hidden');
        DOM.userEmailSpan.textContent = '';
    }
    updateSaveButtonState();
});

async function handleAuthAction(action) {
    const email = DOM.emailInput.value;
    const password = DOM.passwordInput.value;
    DOM.authErrorDiv.classList.add('hidden');
    try {
        await action(firebaseServices.auth, email, password);
    } catch (error) {
        DOM.authErrorDiv.textContent = error.message;
        DOM.authErrorDiv.classList.remove('hidden');
    }
};

// --- Firestore Logic ---
async function saveUserProfile() {
    if (!currentUser) return;
    const profileData = {
        codeforcesHandle: DOM.profileCodeforcesInput.value,
        linkedinAccount: DOM.profileLinkedinInput.value,
        icpcId: DOM.profileIcpcInput.value,
        pictureUrl: DOM.profilePictureInput.value,
    };
    try {
        const userDocRef = firebaseServices.doc(firebaseServices.db, "users", currentUser.uid);
        await firebaseServices.setDoc(userDocRef, {
            email: currentUser.email,
            profile: profileData,
            createdAt: firebaseServices.serverTimestamp()
        }, { merge: true });
        
        DOM.profileMessageDiv.textContent = 'Profile saved successfully!';
        DOM.profileMessageDiv.className = 'text-center text-sm mb-4 text-green-600';
        DOM.profileMessageDiv.classList.remove('hidden');
    } catch (error) {
        console.error("Error saving profile: ", error);
        DOM.profileMessageDiv.textContent = `Error: ${error.message}`;
        DOM.profileMessageDiv.className = 'text-center text-sm mb-4 text-red-600';
        DOM.profileMessageDiv.classList.remove('hidden');
    }
};

async function loadUserProfile() {
    if (!currentUser) return;
    const userDocRef = firebaseServices.doc(firebaseServices.db, "users", currentUser.uid);
    const docSnap = await firebaseServices.getDoc(userDocRef);
    if (docSnap.exists() && docSnap.data().profile) {
        const profile = docSnap.data().profile;
        DOM.profileCodeforcesInput.value = profile.codeforcesHandle || '';
        DOM.profileLinkedinInput.value = profile.linkedinAccount || '';
        DOM.profileIcpcInput.value = profile.icpcId || '';
        DOM.profilePictureInput.value = profile.pictureUrl || '';
    }
};

async function saveSelectedResultsToDB() {
    if (!currentUser) {
        displayError("You must be logged in to save results.");
        return;
    }
    const selectedCheckboxes = DOM.resultsTableBody.querySelectorAll('.result-checkbox:checked');
    if (selectedCheckboxes.length === 0) {
        displayError("No users selected to save.");
        return;
    }
    
    displayError("Saving selected users to database...");

    let savedCount = 0;
    const promises = [];

    selectedCheckboxes.forEach(checkbox => {
        const handle = checkbox.dataset.handle;
        const userData = cachedUserData.find(u => u.handle.toLowerCase() === handle.toLowerCase() && !u.error);
        if (userData) {
            const { allRatingChanges, allSubmissions, userInfo, ...dataToSave } = userData;
            const docRef = firebaseServices.doc(firebaseServices.db, `analysis_history/${handle.toLowerCase()}/entries`, Date.now().toString());
            const promise = firebaseServices.setDoc(docRef, {
                ...dataToSave,
                savedBy: currentUser.uid,
                savedAt: firebaseServices.serverTimestamp()
            }).then(() => savedCount++);
            promises.push(promise);
        }
    });

    await Promise.all(promises);

    if (savedCount > 0) {
        displayError(`Successfully saved ${savedCount} user(s) to the database.`);
    } else {
        displayError("Could not save any users. Make sure they have been processed first.");
    }
};

// --- Core App Logic ---
function addManualUserToList() {
    const handle = DOM.handleInput.value.trim();
    if (!handle) { displayError('Please enter a Codeforces handle.'); return; }
    
    const normalizedHandle = handle.toLowerCase();
    if (usersToAnalyze.some(user => user.handle.toLowerCase() === normalizedHandle)) {
        displayError(`User "${handle}" is already in the list.`); return;
    }

    usersToAnalyze.push({ 
        handle, 
        lunaNovaScore: parseFloat(DOM.lunaNovaScoreInput.value) || 0,
        lunaHardScore: parseFloat(DOM.lunaHardScoreInput.value) || 0,
        placements: DOM.placementsInput.value.trim().split(',').map(p => parseFloat(p.trim())).filter(p => !isNaN(p)),
        isTrusted: DOM.trustedUserInput.checked 
    });
    updateUserListDisplay(usersToAnalyze);
    DOM.handleInput.value = ''; DOM.lunaNovaScoreInput.value = ''; DOM.lunaHardScoreInput.value = ''; DOM.placementsInput.value = '';
    DOM.trustedUserInput.checked = true;
    hideError();
}

function loadCSVFile() {
    const file = DOM.csvFileInput.files[0];
    if (!file) { displayError('Please select a CSV file.'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
        try { parseCSV(e.target.result); hideError(); } 
        catch (error) { displayError(`Error parsing CSV: ${error.message}`); }
    };
    reader.readAsText(file);
}

function parseCSV(csvString) {
    const lines = csvString.trim().split('\n');
    if (lines.length === 0) throw new Error('CSV file is empty or invalid.');
    const newUsersFromCsv = [];
    const startLine = lines[0].toLowerCase().includes('handle') ? 1 : 0;
    for(let i = startLine; i < lines.length; i++) {
        const parts = lines[i].match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || [];
        if (parts.length < 4) continue;
        const handle = parts[0]?.trim();
        const placementsStr = parts[3]?.trim().replace(/"/g, ''); 
        if (!handle || !placementsStr) continue;
        const normalizedHandle = handle.toLowerCase();
        if (usersToAnalyze.some(u => u.handle.toLowerCase() === normalizedHandle)) continue;
        newUsersFromCsv.push({ 
            handle, 
            lunaNovaScore: parseFloat(parts[1]?.trim()) || 0,
            lunaHardScore: parseFloat(parts[2]?.trim()) || 0,
            placements: placementsStr.split(/[;,]/).map(p => parseFloat(p.trim())).filter(p => !isNaN(p)),
            isTrusted: true 
        });
    }
    if (newUsersFromCsv.length === 0) throw new Error('No valid new users found in CSV.');
    usersToAnalyze.push(...newUsersFromCsv);
    updateUserListDisplay(usersToAnalyze);
    displayError(`Loaded ${newUsersFromCsv.length} new users. Total: ${usersToAnalyze.length}`);
    DOM.csvFileInput.value = '';
}

async function processAllUsers() {
    if (usersToAnalyze.length === 0) { displayError('Please add users to the list first.'); return; }
    DOM.resultsContainer.classList.remove('hidden');
    hideError();
    showLoading();
    const usersToProcess = usersToAnalyze.filter(user => {
        const cachedUser = cachedUserData.find(cached => cached.handle.toLowerCase() === user.handle.toLowerCase() && !cached.error);
        return !cachedUser || cachedUser.isTrusted !== user.isTrusted || cachedUser.lunaNovaScore !== user.lunaNovaScore || cachedUser.lunaHardScore !== user.lunaHardScore;
    });
    if (usersToProcess.length === 0) { hideLoading(cachedUserData); displayError("All users in the list are up-to-date."); return; }
    for (let i = 0; i < usersToProcess.length; i++) {
        const user = usersToProcess[i];
        document.querySelector('#loadingIndicator p:first-child').textContent = `Processing user ${i + 1} of ${usersToProcess.length}: ${user.handle}...`;
        let row = document.getElementById(`row-${user.handle.toLowerCase()}`);
        if (!row) { row = DOM.resultsTableBody.insertRow(); row.id = `row-${user.handle.toLowerCase()}`; }
        await processSingleUser(user, row);
    }
    hideLoading(cachedUserData);
    DOM.downloadResultsBtn.disabled = cachedUserData.filter(d => !d.error).length === 0;
    updateTableView();
}

async function processSingleUser(user, rowElement) {
    rowElement.innerHTML = `<td colspan="6" class="px-4 py-3 text-center text-gray-500"><div class="flex items-center justify-center gap-2"><div class="spinner h-4 w-4 rounded-full border-2 border-gray-200"></div><span>Processing ${user.handle}...</span></div></td>`;
    try {
        const userData = await fetchStatsForHandle(user.handle, user.lunaNovaScore, user.lunaHardScore, user.placements, user.isTrusted);
        const cacheIndex = cachedUserData.findIndex(data => data.handle.toLowerCase() === user.handle.toLowerCase());
        if (cacheIndex > -1) cachedUserData[cacheIndex] = userData; else cachedUserData.push(userData);
        updateTableRow(rowElement, userData);
    } catch (error) {
        console.error(`Error fetching stats for ${user.handle}:`, error);
        const errorData = { handle: user.handle, error: `API Error: ${error.message.substring(0, 60)}...` };
        const cacheIndex = cachedUserData.findIndex(data => data.handle.toLowerCase() === user.handle.toLowerCase());
        if (cacheIndex > -1) cachedUserData[cacheIndex] = errorData; else cachedUserData.push(errorData);
        updateTableRow(rowElement, errorData);
    }
}

async function fetchStatsForHandle(handle, lunaNovaScore, lunaHardScore, placements, isTrusted) {
    if (handle === 'MrMoon') throw new Error("MrMoon is off the grid");
    const [userInfoData, userRatingData, userStatusData] = await Promise.all([
        apiQueue.add(`https://codeforces.com/api/user.info?handles=${handle}`),
        apiQueue.add(`https://codeforces.com/api/user.rating?handle=${handle}`),
        apiQueue.add(`https://codeforces.com/api/user.status?handle=${handle}&from=1&count=5000`)
    ]);
    
    const userInfo = userInfoData.result[0];
    const allRatingChanges = userRatingData.result;
    const allSubmissions = userStatusData.result;
    
    const totalContestCount = allRatingChanges.length;
    const avgPlacement = placements.length > 0 ? placements.reduce((a, b) => a + b, 0) / placements.length : 0;
    const div2Contests = allRatingChanges.filter(c => c.contestName.includes('Div. 2'));
    const div2ContestIds = new Set(div2Contests.map(c => c.contestId));
    
    const stats = {
        handle, lunaNovaScore, lunaHardScore, placements, isTrusted, avgPlacement,
        maxRating: totalContestCount > 0 ? Math.max(...allRatingChanges.map(c => c.newRating)) : 0,
        averageContestRating: totalContestCount > 0 ? (allRatingChanges.reduce((acc, curr) => acc + curr.newRating, 0) / totalContestCount) : 0,
        totalContestCount,
        skippedSubmissionsCount: allSubmissions.filter(s => s.verdict === 'SKIPPED').length,
        div2ContestCount: div2Contests.length,
        avgDiv2PerformanceScore: model.calculateAvgDiv2PerformanceScore(allSubmissions.filter(s => div2ContestIds.has(s.contestId)), div2Contests.length),
        ...model.calculateActivityAndInactivityMetrics(allSubmissions),
        userInfo, allRatingChanges, allSubmissions
    };

    stats.scoreFromPlacements = model.getScoreFromPlacements(stats.placements);
    stats.scoreFromCombinedLuna = model.getCombinedLunaScore(stats.lunaNovaScore, stats.lunaHardScore);
    stats.scoreMaxRating = model.getScoreFromMaxRating(stats.maxRating);
    stats.scoreAvgRating = model.getScoreFromAvgRating(stats.averageContestRating);
    stats.scoreContestCount = model.getScoreFromContestCount(stats.totalContestCount);
    stats.scoreWeightedSolvedProblems = model.getRecencyWeightedSolvedProblemScore(allSubmissions);
    stats.scoreFromAvgDiv2Performance = model.getScoreFromAvgDiv2Performance(stats.avgDiv2PerformanceScore);
    stats.scoreFromActivity = model.getScoreFromActivity(stats.rawActivityScore);
    
    const readinessProbability = model.calculateReadinessProbability(stats);
    return { ...stats, readinessProbability };
}

function updateTableView() {
    let filteredData = cachedUserData.filter(user => {
        if (user.error) return true;
        if (activeFilter === 'all') return true;
        return getConfidenceCategory(user.readinessProbability) === activeFilter;
    });
    const { key, direction } = sortState;
    const sortedData = [...filteredData].sort((a, b) => {
        if (a.error) return 1; if (b.error) return -1;
        const valA = a[key], valB = b[key];
        if (typeof valA === 'string') return direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        return direction === 'asc' ? valA - valB : valB - valA;
    });
    DOM.resultsTableBody.innerHTML = '';
    sortedData.forEach(userData => {
        const row = DOM.resultsTableBody.insertRow();
        row.id = `row-${userData.handle.toLowerCase()}`;
        updateTableRow(row, userData);
    });
    updateSortIndicators(sortState);
    updateSaveButtonState();
}

function updateSaveButtonState() {
    const hasResults = cachedUserData.filter(d => !d.error).length > 0;
    const hasSelection = DOM.resultsTableBody.querySelector('.result-checkbox:checked');
    DOM.saveSelectedBtn.disabled = !currentUser || !hasResults || !hasSelection;
}

function clearUserList() { 
    usersToAnalyze = []; 
    cachedUserData = []; 
    updateUserListDisplay(usersToAnalyze); 
    DOM.resultsTableBody.innerHTML = ''; 
    DOM.resultsContainer.classList.add('hidden'); 
    hideError(); 
    DOM.downloadResultsBtn.disabled = true; 
    updateSaveButtonState(); 
}

// --- Event Listeners ---
DOM.addManualUserBtn.addEventListener('click', addManualUserToList);
DOM.loadCsvBtn.addEventListener('click', loadCSVFile);
DOM.clearListBtn.addEventListener('click', clearUserList);
DOM.processAllBtn.addEventListener('click', processAllUsers);
DOM.signInBtn.addEventListener('click', () => handleAuthAction(firebaseServices.signInWithEmailAndPassword));
DOM.signUpBtn.addEventListener('click', () => handleAuthAction(firebaseServices.createUserWithEmailAndPassword));
DOM.logoutBtn.addEventListener('click', () => firebaseServices.signOut(firebaseServices.auth));
DOM.saveProfileBtn.addEventListener('click', saveUserProfile);
DOM.saveSelectedBtn.addEventListener('click', saveSelectedResultsToDB);

DOM.readinessFilter.addEventListener('change', (e) => { activeFilter = e.target.value; updateTableView(); });
DOM.selectAllCheckbox.addEventListener('change', (e) => {
    DOM.resultsTableBody.querySelectorAll('.result-checkbox').forEach(checkbox => checkbox.checked = e.target.checked);
    updateSaveButtonState();
});

// Modal Listeners
function toggleModal(modal, show) {
    // ... logic to show/hide modals
}
DOM.loginBtn.addEventListener('click', () => toggleModal(DOM.authModal, true));
DOM.closeAuthModalBtn.addEventListener('click', () => toggleModal(DOM.authModal, false));
DOM.profileBtn.addEventListener('click', () => { loadUserProfile(); toggleModal(DOM.profileModal, true); });
DOM.closeProfileModalBtn.addEventListener('click', () => toggleModal(DOM.profileModal, false));


// Event Delegation
DOM.userList.addEventListener('click', e => {
    if (e.target.classList.contains('remove-list-btn')) {
        usersToAnalyze.splice(parseInt(e.target.dataset.index, 10), 1);
        updateUserListDisplay(usersToAnalyze);
    }
});
DOM.userList.addEventListener('change', e => {
    if (e.target.classList.contains('user-trust-checkbox')) {
        usersToAnalyze[parseInt(e.target.dataset.index, 10)].isTrusted = e.target.checked;
    }
});
DOM.resultsTableBody.addEventListener('click', async (e) => {
    // ... logic for details, retry, remove buttons
    if (e.target.classList.contains('result-checkbox')) {
        updateSaveButtonState();
    }
});
DOM.resultsTableHeader.addEventListener('click', (e) => {
    const header = e.target.closest('th.sortable-header');
    if (!header) return;
    const key = header.dataset.sortKey;
    sortState.direction = (sortState.key === key && sortState.direction === 'desc') ? 'asc' : 'desc';
    sortState.key = key;
    updateTableView();
});


// --- Initial Setup ---
updateUserListDisplay(usersToAnalyze);
updateSortIndicators(sortState);

