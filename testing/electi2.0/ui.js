// --- DOM Element References ---
export const DOM = {
    handleInput: document.getElementById('handleInput'),
    lunaNovaScoreInput: document.getElementById('lunaNovaScoreInput'),
    lunaHardScoreInput: document.getElementById('lunaHardScoreInput'),
    placementsInput: document.getElementById('placementsInput'),
    trustedUserInput: document.getElementById('trustedUserInput'),
    addManualUserBtn: document.getElementById('addManualUserBtn'),
    csvFileInput: document.getElementById('csvFileInput'),
    loadCsvBtn: document.getElementById('loadCsvBtn'),
    clearListBtn: document.getElementById('clearListBtn'),
    processAllBtn: document.getElementById('processAllBtn'),
    downloadResultsBtn: document.getElementById('downloadResultsBtn'),
    downloadUserListBtn: document.getElementById('downloadUserListBtn'),
    userList: document.getElementById('userList'),
    userCount: document.getElementById('userCount'),
    noUsersMessage: document.getElementById('noUsersMessage'),
    resultsContainer: document.getElementById('resultsContainer'),
    resultsTableBody: document.querySelector('#resultsTable tbody'),
    resultsTableHeader: document.querySelector('#resultsTable thead'),
    readinessFilter: document.getElementById('readinessFilter'),
    errorMessageDiv: document.getElementById('errorMessage'),
    loadingIndicator: document.getElementById('loadingIndicator'),
    selectAllCheckbox: document.getElementById('selectAllCheckbox'),
    saveSelectedBtn: document.getElementById('saveSelectedBtn'),
    // Modals
    detailsModal: document.getElementById('detailsModal'),
    modalContentContainer: document.getElementById('modalContentContainer'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    authModal: document.getElementById('authModal'),
    closeAuthModalBtn: document.getElementById('closeAuthModalBtn'),
    profileModal: document.getElementById('profileModal'),
    closeProfileModalBtn: document.getElementById('closeProfileModalBtn'),
    // Auth
    loginBtn: document.getElementById('loginBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    loggedInState: document.getElementById('loggedInState'),
    loggedOutState: document.getElementById('loggedOutState'),
    userEmailSpan: document.getElementById('userEmail'),
    emailInput: document.getElementById('emailInput'),
    passwordInput: document.getElementById('passwordInput'),
    signInBtn: document.getElementById('signInBtn'),
    signUpBtn: document.getElementById('signUpBtn'),
    authErrorDiv: document.getElementById('authError'),
    // Profile
    profileBtn: document.getElementById('profileBtn'),
    profileCodeforcesInput: document.getElementById('profileCodeforcesInput'),
    profileLinkedinInput: document.getElementById('profileLinkedinInput'),
    profileIcpcInput: document.getElementById('profileIcpcInput'),
    profilePictureInput: document.getElementById('profilePictureInput'),
    saveProfileBtn: document.getElementById('saveProfileBtn'),
    profileMessageDiv: document.getElementById('profileMessage'),
};

// --- UI Update Functions ---
export function updateUserListDisplay(usersToAnalyze) {
    DOM.userList.innerHTML = '';
    DOM.userCount.textContent = usersToAnalyze.length;
    DOM.downloadUserListBtn.disabled = usersToAnalyze.length === 0;
    DOM.noUsersMessage.classList.toggle('hidden', usersToAnalyze.length > 0);

    usersToAnalyze.forEach((user, index) => {
        const handleClass = user.isTrusted ? 'font-semibold' : 'font-semibold text-red-600';
        const listItem = document.createElement('li');
        listItem.className = 'p-2 bg-gray-50 rounded-md text-sm flex justify-between items-center border border-gray-200';
        listItem.innerHTML = `
            <div class="flex items-center gap-2">
                <input type="checkbox" data-index="${index}" class="user-trust-checkbox h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" ${user.isTrusted ? 'checked' : ''}>
                <span><span class="${handleClass}">${user.handle}</span> (Luna: ${user.lunaNovaScore}/${user.lunaHardScore})</span>
            </div>
            <button data-index="${index}" class="remove-list-btn text-red-500 hover:text-red-700 font-bold px-2">×</button>`;
        DOM.userList.appendChild(listItem);
    });
}

export function updateTableRow(row, userData) {
    if (userData.error) {
        row.innerHTML = `
            <td></td>
            <td class="px-4 py-3 font-semibold">${userData.handle}</td>
            <td colspan="3" class="px-4 py-3 text-red-600">${userData.error}</td>
            <td class="px-4 py-3 text-center">
                <button class="retry-btn bg-blue-100 text-blue-700 text-xs font-bold py-1 px-3 rounded-full hover:bg-blue-200" data-handle="${userData.handle}">Retry</button>
            </td>`;
        return;
    }

    const probability = userData.readinessProbability * 100;
    const category = getConfidenceCategory(userData.readinessProbability);
    let probClass = 'bg-red-100 text-red-800', confidence = 'Low';
    if (category === 'very-high') { probClass = 'bg-green-100 text-green-800'; confidence = 'Very High'; }
    else if (category === 'high') { probClass = 'bg-emerald-100 text-emerald-800'; confidence = 'High'; }
    else if (category === 'medium') { probClass = 'bg-yellow-100 text-yellow-800'; confidence = 'Medium'; }
    
    const handleClass = userData.isTrusted ? 'font-semibold' : 'font-semibold text-red-600';

    row.innerHTML = `
        <td class="px-2 py-3 text-center"><input type="checkbox" class="result-checkbox h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" data-handle="${userData.handle}"></td>
        <td class="px-4 py-3 whitespace-nowrap ${handleClass}">${userData.handle}</td>
        <td class="px-4 py-3 whitespace-nowrap font-bold text-center">${userData.scoreFromAvgDiv2Performance.toFixed(2)}</td>
        <td class="px-4 py-3 whitespace-nowrap">Top ${userData.avgPlacement.toFixed(1)}%</td>
        <td class="px-4 py-3 whitespace-nowrap text-center rounded-md ${probClass}">
            <div class="font-bold text-lg">${probability.toFixed(2)}%</div>
            <div class="text-xs font-semibold">${confidence}</div>
        </td>
        <td class="px-4 py-3 whitespace-nowrap text-center">
            <button class="details-btn bg-indigo-100 text-indigo-700 text-xs font-bold py-1 px-3 rounded-full hover:bg-indigo-200" data-handle="${userData.handle}">Details</button>
            <button class="remove-result-btn text-red-500 hover:text-red-700 font-bold px-2 ml-2" data-handle="${userData.handle}" title="Remove User">×</button>
        </td>
    `;
}

export function updateSortIndicators(sortState) {
    DOM.resultsTableHeader.querySelectorAll('th.sortable-header').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.sortKey === sortState.key) {
            th.classList.add(`sort-${sortState.direction}`);
        }
    });
}

export function displayError(message) { 
    DOM.errorMessageDiv.textContent = message; 
    DOM.errorMessageDiv.classList.remove('hidden'); 
}
export function hideError() { 
    DOM.errorMessageDiv.classList.add('hidden'); 
}
export function showLoading() { 
    DOM.loadingIndicator.classList.remove('hidden'); 
    document.querySelectorAll('button, input, select').forEach(el => el.disabled = true); 
}
export function hideLoading(cachedUserData) { 
    DOM.loadingIndicator.classList.add('hidden'); 
    document.querySelectorAll('button, input, select').forEach(el => el.disabled = false); 
    DOM.downloadResultsBtn.disabled = cachedUserData.filter(d => !d.error).length === 0;
}

export function getConfidenceCategory(p) { 
    if (p >= 0.85) return 'very-high'; 
    if (p >= 0.65) return 'high'; 
    if (p >= 0.40) return 'medium'; 
    return 'low'; 
}

// --- All other UI functions can be placed here ---

