class PlayerObject {
    static enum(name, values) {
        this[name] = values;
        for (let i = 0; i < values.length; i++)
            this[values[i]] = i;
    }
};
