// Manages a queue for API requests to avoid hitting rate limits.
const apiQueue = {
    requests: [],
    isProcessing: false,
    delay: 1100, // 1.1 second delay to be safe with Codeforces API limits
    add(url) {
        return new Promise((resolve, reject) => {
            this.requests.push({ url, resolve, reject });
            if (!this.isProcessing) {
                this.processNext();
            }
        });
    },
    async processNext() {
        if (this.requests.length === 0) {
            this.isProcessing = false;
            return;
        }
        this.isProcessing = true;
        const { url, resolve, reject } = this.requests.shift();
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`API request failed: ${response.status} ${response.statusText}`);
            const data = await response.json();
            if (data.status === 'FAILED') throw new Error(`Codeforces API error: ${data.comment}`);
            resolve(data);
        } catch (error) {
            reject(error);
        }
        setTimeout(() => this.processNext(), this.delay);
    }
};

export { apiQueue };

