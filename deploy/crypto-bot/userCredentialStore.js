const fs = require('fs');
const path = require('path');

function createEmptyStore() {
    return { version: 1, users: {} };
}

function normalizeStore(parsed) {
    if (!parsed || typeof parsed !== 'object') return createEmptyStore();
    if (!parsed.users || typeof parsed.users !== 'object') parsed.users = {};
    return parsed;
}

function createUserCredentialStore(filePath) {
    function readStore() {
        try {
            if (!fs.existsSync(filePath)) return createEmptyStore();
            return normalizeStore(JSON.parse(fs.readFileSync(filePath, 'utf8')));
        } catch (error) {
            console.warn(`⚠️ Failed to read credential store ${filePath}:`, error.message);
            return createEmptyStore();
        }
    }

    function writeStore(store) {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const tmpPath = `${filePath}.tmp`;
        fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2));
        fs.renameSync(tmpPath, filePath);
    }

    function getBrokerBucket(store, userId, broker, create = false) {
        const userKey = String(userId);
        if (!store.users[userKey]) {
            if (!create) return null;
            store.users[userKey] = { brokers: {} };
        }
        if (!store.users[userKey].brokers || typeof store.users[userKey].brokers !== 'object') {
            store.users[userKey].brokers = {};
        }
        if (!store.users[userKey].brokers[broker]) {
            if (!create) return null;
            store.users[userKey].brokers[broker] = {};
        }
        return store.users[userKey].brokers[broker];
    }

    function loadEncryptedCredentials(userId, broker) {
        if (userId === undefined || userId === null || !broker) return {};
        const bucket = getBrokerBucket(readStore(), userId, broker);
        if (!bucket || typeof bucket !== 'object') return {};

        const result = {};
        for (const [key, value] of Object.entries(bucket)) {
            if (typeof value === 'string') {
                result[key] = value;
                continue;
            }
            if (value && typeof value === 'object' && typeof value.encryptedValue === 'string') {
                result[key] = value.encryptedValue;
            }
        }
        return result;
    }

    function saveEncryptedCredentials(userId, broker, encryptedByKey) {
        if (userId === undefined || userId === null || !broker) return 0;
        if (!encryptedByKey || typeof encryptedByKey !== 'object') return 0;

        const store = readStore();
        const bucket = getBrokerBucket(store, userId, broker, true);
        let written = 0;
        const now = new Date().toISOString();

        for (const [key, encryptedValue] of Object.entries(encryptedByKey)) {
            if (typeof encryptedValue !== 'string' || encryptedValue.length === 0) continue;
            bucket[key] = { encryptedValue, updatedAt: now };
            written++;
        }

        if (written > 0) writeStore(store);
        return written;
    }

    function countCredentials(userId, broker) {
        return Object.keys(loadEncryptedCredentials(userId, broker)).length;
    }

    return {
        countCredentials,
        loadEncryptedCredentials,
        saveEncryptedCredentials,
    };
}

module.exports = { createUserCredentialStore };
