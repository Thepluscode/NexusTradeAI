const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
require('dotenv').config();

class AccountManager {
    constructor() {
        this.accountsFile = path.join(__dirname, 'data', 'accounts.json');
        this.alpacaClient = axios.create({
            baseURL: 'https://paper-api.alpaca.markets/v2',
            headers: {
                'APCA-API-KEY-ID': process.env.ALPACA_API_KEY,
                'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY
            }
        });
        this.accounts = {
            real: {
                id: 'real_account_001',
                type: 'real',
                balance: 825000000, // $825M
                initialBalance: 825000000,
                currency: 'USD',
                equity: 825000000,
                margin: 0,
                freeMargin: 825000000,
                marginLevel: 0,
                leverage: 1,
                linkedBanks: [
                    {
                        id: 'bank_001',
                        name: 'JPMorgan Chase',
                        accountNumber: '****4521',
                        routingNumber: '021000021',
                        status: 'active'
                    },
                    {
                        id: 'bank_002',
                        name: 'Bank of America',
                        accountNumber: '****8932',
                        routingNumber: '026009593',
                        status: 'active'
                    }
                ],
                transactions: [],
                createdAt: new Date().toISOString(),
                lastActivity: new Date().toISOString()
            },
            demo: {
                id: 'demo_account_001',
                type: 'demo',
                balance: 100000, // $100K
                initialBalance: 100000,
                currency: 'USD',
                equity: 100000,
                margin: 0,
                freeMargin: 100000,
                marginLevel: 0,
                leverage: 1,
                canReset: true,
                transactions: [],
                createdAt: new Date().toISOString(),
                lastActivity: new Date().toISOString()
            }
        };
        this.activeAccount = 'demo'; // Start with demo by default
        this.initialize();
    }

    async initialize() {
        try {
            const data = await fs.readFile(this.accountsFile, 'utf8');
            const saved = JSON.parse(data);
            this.accounts = saved.accounts || this.accounts;
            this.activeAccount = saved.activeAccount || 'demo';
        } catch (error) {
            // File doesn't exist, use defaults
            await this.save();
        }
    }

    async save() {
        const data = {
            accounts: this.accounts,
            activeAccount: this.activeAccount,
            lastUpdate: new Date().toISOString()
        };
        await fs.writeFile(this.accountsFile, JSON.stringify(data, null, 2));
    }

    async syncWithAlpaca() {
        try {
            const response = await this.alpacaClient.get('/account');
            const alpacaAccount = response.data;

            // Update real account with Alpaca data
            this.accounts.real.balance = parseFloat(alpacaAccount.cash);
            this.accounts.real.equity = parseFloat(alpacaAccount.equity);
            this.accounts.real.initialBalance = parseFloat(alpacaAccount.cash);
            this.accounts.real.margin = parseFloat(alpacaAccount.initial_margin);
            this.accounts.real.freeMargin = parseFloat(alpacaAccount.buying_power);
            this.accounts.real.leverage = parseFloat(alpacaAccount.multiplier);
            this.accounts.real.marginLevel = this.accounts.real.margin > 0
                ? (this.accounts.real.equity / this.accounts.real.margin) * 100
                : 0;

            await this.save();
            console.log('✅ Synced with Alpaca account: $' + alpacaAccount.equity);
            return this.accounts.real;
        } catch (error) {
            console.error('Failed to sync with Alpaca:', error.message);
            return this.accounts.real;
        }
    }

    getAccount(type = null) {
        const accountType = type || this.activeAccount;
        return this.accounts[accountType];
    }

    async switchAccount(type) {
        if (!this.accounts[type]) {
            throw new Error(`Account type ${type} does not exist`);
        }
        this.activeAccount = type;
        await this.save();
        return this.getAccount();
    }

    async updateBalance(amount, type = null) {
        const accountType = type || this.activeAccount;
        const account = this.accounts[accountType];

        account.balance += amount;
        account.equity = account.balance + account.margin;
        account.freeMargin = account.equity - account.margin;
        account.lastActivity = new Date().toISOString();

        // Record transaction
        account.transactions.push({
            id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: amount > 0 ? 'deposit' : 'withdrawal',
            amount: Math.abs(amount),
            balance: account.balance,
            timestamp: new Date().toISOString()
        });

        // Keep only last 1000 transactions
        if (account.transactions.length > 1000) {
            account.transactions = account.transactions.slice(-1000);
        }

        await this.save();
        return account;
    }

    async updatePosition(positionValue, marginUsed, type = null) {
        const accountType = type || this.activeAccount;
        const account = this.accounts[accountType];

        account.margin = marginUsed;
        account.equity = account.balance + positionValue;
        account.freeMargin = account.equity - account.margin;
        account.marginLevel = account.margin > 0 ? (account.equity / account.margin) * 100 : 0;
        account.lastActivity = new Date().toISOString();

        await this.save();
        return account;
    }

    async resetDemoAccount() {
        if (!this.accounts.demo.canReset) {
            throw new Error('Demo account cannot be reset');
        }

        this.accounts.demo = {
            ...this.accounts.demo,
            balance: this.accounts.demo.initialBalance,
            equity: this.accounts.demo.initialBalance,
            margin: 0,
            freeMargin: this.accounts.demo.initialBalance,
            marginLevel: 0,
            transactions: [],
            lastActivity: new Date().toISOString()
        };

        await this.save();
        return this.accounts.demo;
    }

    async addBankAccount(bankDetails, accountType = 'real') {
        if (accountType !== 'real') {
            throw new Error('Bank accounts can only be added to real accounts');
        }

        const bank = {
            id: `bank_${Date.now()}`,
            ...bankDetails,
            status: 'pending',
            addedAt: new Date().toISOString()
        };

        this.accounts.real.linkedBanks.push(bank);
        await this.save();
        return bank;
    }

    async withdraw(amount, bankId, accountType = 'real') {
        if (accountType !== 'real') {
            throw new Error('Withdrawals are only available for real accounts');
        }

        const account = this.accounts[accountType];
        const bank = account.linkedBanks.find(b => b.id === bankId);

        if (!bank) {
            throw new Error('Bank account not found');
        }

        if (bank.status !== 'active') {
            throw new Error('Bank account is not active');
        }

        if (account.freeMargin < amount) {
            throw new Error('Insufficient free margin');
        }

        await this.updateBalance(-amount, accountType);

        // Record withdrawal
        const withdrawal = {
            id: `wd_${Date.now()}`,
            amount,
            bankId,
            bankName: bank.name,
            accountNumber: bank.accountNumber,
            status: 'processing',
            requestedAt: new Date().toISOString()
        };

        return withdrawal;
    }

    getAccountSummary() {
        return {
            activeAccount: this.activeAccount,
            realAccount: {
                balance: this.accounts.real.balance,
                equity: this.accounts.real.equity,
                margin: this.accounts.real.margin,
                freeMargin: this.accounts.real.freeMargin,
                marginLevel: this.accounts.real.marginLevel,
                leverage: this.accounts.real.leverage,
                pnl: this.accounts.real.equity - this.accounts.real.initialBalance,
                pnlPercent: ((this.accounts.real.equity - this.accounts.real.initialBalance) / this.accounts.real.initialBalance) * 100,
                linkedBanks: this.accounts.real.linkedBanks
            },
            demoAccount: {
                balance: this.accounts.demo.balance,
                equity: this.accounts.demo.equity,
                margin: this.accounts.demo.margin,
                freeMargin: this.accounts.demo.freeMargin,
                marginLevel: this.accounts.demo.marginLevel,
                leverage: this.accounts.demo.leverage,
                pnl: this.accounts.demo.equity - this.accounts.demo.initialBalance,
                pnlPercent: ((this.accounts.demo.equity - this.accounts.demo.initialBalance) / this.accounts.demo.initialBalance) * 100,
                canReset: this.accounts.demo.canReset
            }
        };
    }
}

module.exports = AccountManager;
