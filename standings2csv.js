// Paste this in the console :D
(function() {
    // 1. Grab the contest title from the page and clean it for a filename
    const titleElement = document.querySelector('.contest-name');
    let fileName = titleElement ? titleElement.innerText.trim() : "Standings";
    // Remove special characters that might break filenames
    fileName = fileName.replace(/[^a-z0-9\s]/gi, '').replace(/\s+/g, '_');

    // 2. Target the standings table rows
    const rows = document.querySelectorAll('.standings tr:not(.standingsStatisticsRow)');
    let csvContent = "Rank,Who,Solved,Penalty,A,B,C,D,E,F,G,H,I,J,K,L,M\n";

    rows.forEach((row) => {
        // Skip the header row
        if (row.querySelector('th')) return;

        const cells = row.querySelectorAll('td');
        if (cells.length < 5) return; 

        // Rank
        const rank = cells[0].innerText.trim();
        
        // Who (Handle/Team) - Cleaning the "→to practice" text
        let who = cells[1].innerText.trim();
        who = who.split('→')[0].trim(); 

        // Solved Count
        const solved = cells[2].innerText.trim();

        // Penalty
        const penalty = cells[3].innerText.trim();

        // Problem Results (A through M are cells 4 to 16)
        let problemResults = [];
        for (let i = 4; i <= 16; i++) {
            if (cells[i]) {
                // Get the main result (+, +1, -3, etc.) and clean extra whitespace
                let res = cells[i].innerText.trim().replace(/\s+/g, ' ');
                problemResults.push(`"${res}"`);
            } else {
                problemResults.push("");
            }
        }

        // Add to CSV string
        csvContent += `"${rank}","${who}","${solved}","${penalty}",${problemResults.join(',')}\n`;
    });

    // 3. Create and trigger download with the contest title
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${fileName}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    console.log(`CSV Generated: ${fileName}.csv`);
})();
