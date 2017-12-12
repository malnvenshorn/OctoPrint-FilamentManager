class Utils { // eslint-disable-line no-unused-vars
    static validInt(value, def) {
        const v = Number.parseInt(value, 10);
        return Number.isNaN(v) ? def : v;
    }

    static validFloat(value, def) {
        const v = Number.parseFloat(value);
        return Number.isNaN(v) ? def : v;
    }

    static runRequestChain(requests) {
        let index = 0;

        const next = function callNextRequest() {
            if (index < requests.length) {
                // Do the next, increment the call index
                requests[index]().done(() => {
                    index += 1;
                    next();
                });
            }
        };

        next(); // Start chain
    }

    static extractToolIDFromName(name) {
        const result = /(\d+)/.exec(name);
        return result === null ? 0 : result[1];
    }
}
