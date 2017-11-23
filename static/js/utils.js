class Utils { // eslint-disable-line no-unused-vars
    static validInt(value, def) {
        const v = Number.parseInt(value, 10);
        return Number.isNaN(v) ? def : v;
    }

    static validFloat(value, def) {
        const v = Number.parseFloat(value);
        return Number.isNaN(v) ? def : v;
    }
}
