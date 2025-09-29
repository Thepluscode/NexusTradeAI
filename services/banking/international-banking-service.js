const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

class InternationalBankingService {
    constructor() {
        this.app = express();
        this.port = 3004;
        
        // In-memory storage (replace with database in production)
        this.users = new Map();
        this.bankAccounts = new Map();
        this.transactions = new Map();
        this.pendingTransactions = new Map();
        this.exchangeRates = new Map();
        
        // International payment processors
        this.paymentProcessors = {
            // UK & EU
            stripe: { 
                enabled: true, 
                regions: ['UK', 'EU', 'US'], 
                publicKey: 'pk_test_...', 
                secretKey: 'sk_test_...' 
            },
            wise: { 
                enabled: true, 
                regions: ['UK', 'EU', 'US', 'NG'], 
                apiKey: 'wise_api_key',
                webhookSecret: 'wise_webhook_secret'
            },
            // Nigeria & Africa
            flutterwave: { 
                enabled: true, 
                regions: ['NG', 'GH', 'KE', 'ZA', 'UK', 'EU'], 
                publicKey: 'FLWPUBK_TEST-...', 
                secretKey: 'FLWSECK_TEST-...' 
            },
            paystack: { 
                enabled: true, 
                regions: ['NG', 'GH', 'ZA'], 
                publicKey: 'pk_test_...', 
                secretKey: 'sk_test_...' 
            },
            // EU SEPA
            gocardless: { 
                enabled: true, 
                regions: ['EU', 'UK'], 
                accessToken: 'sandbox_...',
                environment: 'sandbox'
            }
        };
        
        // Supported countries and their configurations
        this.supportedCountries = {
            'UK': {
                currency: 'GBP',
                processors: ['stripe', 'wise', 'flutterwave'],
                depositMethods: ['bank_transfer', 'card', 'open_banking'],
                withdrawalMethods: ['bank_transfer', 'faster_payments'],
                kycRequired: true,
                maxDailyDeposit: 50000,
                maxDailyWithdrawal: 40000
            },
            'EU': {
                currency: 'EUR',
                processors: ['stripe', 'wise', 'flutterwave', 'gocardless'],
                depositMethods: ['sepa', 'card', 'bank_transfer'],
                withdrawalMethods: ['sepa', 'bank_transfer'],
                kycRequired: true,
                maxDailyDeposit: 50000,
                maxDailyWithdrawal: 40000
            },
            'NG': {
                currency: 'NGN',
                processors: ['flutterwave', 'paystack', 'wise'],
                depositMethods: ['bank_transfer', 'card', 'ussd', 'mobile_money'],
                withdrawalMethods: ['bank_transfer', 'mobile_money'],
                kycRequired: true,
                maxDailyDeposit: 20000000, // 20M NGN ≈ $50k USD
                maxDailyWithdrawal: 16000000 // 16M NGN ≈ $40k USD
            },
            'US': {
                currency: 'USD',
                processors: ['stripe', 'wise'],
                depositMethods: ['ach', 'wire', 'card'],
                withdrawalMethods: ['ach', 'wire'],
                kycRequired: true,
                maxDailyDeposit: 50000,
                maxDailyWithdrawal: 40000
            }
        };
        
        this.initializeExchangeRates();
        this.setupMiddleware();
        this.setupRoutes();
        this.startTransactionProcessor();
    }

    initializeExchangeRates() {
        // Mock exchange rates (in production, fetch from real API)
        this.exchangeRates.set('USD_GBP', 0.79);
        this.exchangeRates.set('USD_EUR', 0.85);
        this.exchangeRates.set('USD_NGN', 1580);
        this.exchangeRates.set('GBP_USD', 1.27);
        this.exchangeRates.set('GBP_EUR', 1.08);
        this.exchangeRates.set('GBP_NGN', 2000);
        this.exchangeRates.set('EUR_USD', 1.18);
        this.exchangeRates.set('EUR_GBP', 0.93);
        this.exchangeRates.set('EUR_NGN', 1860);
        this.exchangeRates.set('NGN_USD', 0.00063);
        this.exchangeRates.set('NGN_GBP', 0.0005);
        this.exchangeRates.set('NGN_EUR', 0.00054);
    }

    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.static('public'));
        
        // Request logging
        this.app.use((req, res, next) => {
            console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
            next();
        });
    }

    setupRoutes() {
        // Health check
        this.app.get('/api/health', (req, res) => {
            res.json({ 
                status: 'healthy', 
                service: 'international-banking',
                timestamp: new Date().toISOString(),
                supportedCountries: Object.keys(this.supportedCountries),
                processors: this.paymentProcessors
            });
        });

        // Country and currency support
        this.app.get('/api/banking/countries', this.getSupportedCountries.bind(this));
        this.app.get('/api/banking/exchange-rates', this.getExchangeRates.bind(this));
        this.app.post('/api/banking/convert', this.convertCurrency.bind(this));

        // User management with country support
        this.app.post('/api/banking/users/register', this.registerInternationalUser.bind(this));
        this.app.get('/api/banking/users/:userId', this.getUserProfile.bind(this));
        this.app.put('/api/banking/users/:userId/country', this.updateUserCountry.bind(this));

        // International bank account management
        this.app.post('/api/banking/accounts/add', this.addInternationalBankAccount.bind(this));
        this.app.get('/api/banking/accounts/:userId', this.getBankAccounts.bind(this));
        this.app.post('/api/banking/accounts/:accountId/verify', this.verifyBankAccount.bind(this));

        // International deposits
        this.app.post('/api/banking/deposits/uk', this.processUKDeposit.bind(this));
        this.app.post('/api/banking/deposits/eu', this.processEUDeposit.bind(this));
        this.app.post('/api/banking/deposits/nigeria', this.processNigeriaDeposit.bind(this));
        this.app.post('/api/banking/deposits/card', this.processCardDeposit.bind(this));

        // International withdrawals
        this.app.post('/api/banking/withdrawals/uk', this.processUKWithdrawal.bind(this));
        this.app.post('/api/banking/withdrawals/eu', this.processEUWithdrawal.bind(this));
        this.app.post('/api/banking/withdrawals/nigeria', this.processNigeriaWithdrawal.bind(this));

        // Transaction management
        this.app.get('/api/banking/transactions/:userId', this.getTransactionHistory.bind(this));
        this.app.get('/api/banking/balance/:userId', this.getAccountBalance.bind(this));
        this.app.get('/api/banking/limits/:userId', this.getTransactionLimits.bind(this));

        // Compliance and reporting
        this.app.post('/api/banking/compliance/report', this.generateComplianceReport.bind(this));
        this.app.get('/api/banking/fees/:country/:method', this.getFeeStructure.bind(this));
    }

    async getSupportedCountries(req, res) {
        try {
            const countries = Object.keys(this.supportedCountries).map(code => ({
                code,
                ...this.supportedCountries[code]
            }));
            
            res.json({ success: true, data: countries });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async getExchangeRates(req, res) {
        try {
            const rates = {};
            for (const [pair, rate] of this.exchangeRates) {
                rates[pair] = rate;
            }
            
            res.json({ 
                success: true, 
                data: rates,
                lastUpdated: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async convertCurrency(req, res) {
        try {
            const { amount, fromCurrency, toCurrency } = req.body;
            
            if (fromCurrency === toCurrency) {
                return res.json({ 
                    success: true, 
                    data: { 
                        originalAmount: amount,
                        convertedAmount: amount,
                        rate: 1,
                        fromCurrency,
                        toCurrency
                    }
                });
            }
            
            const rateKey = `${fromCurrency}_${toCurrency}`;
            const rate = this.exchangeRates.get(rateKey);
            
            if (!rate) {
                return res.status(400).json({ 
                    success: false, 
                    error: `Exchange rate not available for ${fromCurrency} to ${toCurrency}` 
                });
            }
            
            const convertedAmount = amount * rate;
            
            res.json({
                success: true,
                data: {
                    originalAmount: amount,
                    convertedAmount: Math.round(convertedAmount * 100) / 100,
                    rate,
                    fromCurrency,
                    toCurrency,
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async registerInternationalUser(req, res) {
        try {
            const { 
                email, firstName, lastName, dateOfBirth, 
                country, address, phoneNumber, idDocument 
            } = req.body;
            
            if (!this.supportedCountries[country]) {
                return res.status(400).json({ 
                    success: false, 
                    error: `Country ${country} is not supported` 
                });
            }
            
            const userId = uuidv4();
            const countryConfig = this.supportedCountries[country];
            
            const user = {
                id: userId,
                email,
                firstName,
                lastName,
                dateOfBirth,
                country,
                currency: countryConfig.currency,
                address,
                phoneNumber,
                idDocument: this.encryptSensitiveData(idDocument),
                kycStatus: 'pending',
                accountBalance: 0,
                accountBalanceCurrency: countryConfig.currency,
                createdAt: new Date().toISOString(),
                verificationLevel: 'basic',
                availableProcessors: countryConfig.processors,
                depositMethods: countryConfig.depositMethods,
                withdrawalMethods: countryConfig.withdrawalMethods
            };

            this.users.set(userId, user);

            // Simulate KYC verification process
            setTimeout(() => {
                this.processKYCVerification(userId);
            }, 5000);

            res.json({
                success: true,
                data: {
                    userId,
                    country,
                    currency: countryConfig.currency,
                    kycStatus: user.kycStatus,
                    verificationLevel: user.verificationLevel,
                    availableMethods: {
                        deposits: countryConfig.depositMethods,
                        withdrawals: countryConfig.withdrawalMethods
                    }
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async addInternationalBankAccount(req, res) {
        try {
            const { 
                userId, accountNumber, sortCode, iban, routingNumber, 
                bankName, accountType, country, currency 
            } = req.body;
            
            const user = this.users.get(userId);
            if (!user) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }

            const accountId = uuidv4();
            const bankAccount = {
                id: accountId,
                userId,
                accountNumber: this.encryptSensitiveData(accountNumber),
                sortCode, // UK
                iban, // EU
                routingNumber, // US
                bankName,
                accountType,
                country: country || user.country,
                currency: currency || user.currency,
                status: 'pending_verification',
                verificationMethod: this.getVerificationMethod(country || user.country),
                addedAt: new Date().toISOString()
            };

            this.bankAccounts.set(accountId, bankAccount);

            // Start verification process based on country
            setTimeout(() => {
                this.initiateAccountVerification(accountId);
            }, 2000);

            res.json({
                success: true,
                data: {
                    accountId,
                    status: bankAccount.status,
                    verificationMethod: bankAccount.verificationMethod,
                    country: bankAccount.country,
                    currency: bankAccount.currency
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    getVerificationMethod(country) {
        const methods = {
            'UK': 'open_banking',
            'EU': 'sepa_verification',
            'NG': 'bvn_verification',
            'US': 'micro_deposits'
        };
        return methods[country] || 'manual_verification';
    }

    async processUKDeposit(req, res) {
        try {
            const { userId, accountId, amount, method } = req.body;

            const user = this.users.get(userId);
            if (!user || user.country !== 'UK') {
                return res.status(400).json({
                    success: false,
                    error: 'User must be from UK for this deposit method'
                });
            }

            const transactionId = uuidv4();
            let fees = 0;
            let processor = 'wise';

            // UK-specific deposit methods
            switch (method) {
                case 'faster_payments':
                    fees = 0; // Free
                    processor = 'wise';
                    break;
                case 'bank_transfer':
                    fees = 0; // Free
                    processor = 'wise';
                    break;
                case 'open_banking':
                    fees = 0; // Free
                    processor = 'stripe';
                    break;
                default:
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid deposit method for UK'
                    });
            }

            const transaction = {
                id: transactionId,
                userId,
                accountId,
                type: 'deposit',
                method: `uk_${method}`,
                amount: parseFloat(amount),
                currency: 'GBP',
                fees,
                processor,
                status: 'pending',
                estimatedCompletion: this.calculateCompletionTime('UK', method),
                createdAt: new Date().toISOString(),
                country: 'UK'
            };

            this.pendingTransactions.set(transactionId, transaction);

            // Simulate processing
            setTimeout(() => {
                this.processInternationalTransaction(transactionId);
            }, 8000);

            res.json({
                success: true,
                data: {
                    transactionId,
                    status: transaction.status,
                    estimatedCompletion: transaction.estimatedCompletion,
                    fees: transaction.fees,
                    currency: transaction.currency,
                    processor: transaction.processor
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async processEUDeposit(req, res) {
        try {
            const { userId, accountId, amount, method } = req.body;

            const user = this.users.get(userId);
            if (!user || user.country !== 'EU') {
                return res.status(400).json({
                    success: false,
                    error: 'User must be from EU for this deposit method'
                });
            }

            const transactionId = uuidv4();
            let fees = 0;
            let processor = 'wise';

            // EU-specific deposit methods
            switch (method) {
                case 'sepa':
                    fees = 0; // Free for SEPA
                    processor = 'gocardless';
                    break;
                case 'bank_transfer':
                    fees = amount * 0.005; // 0.5% for international
                    processor = 'wise';
                    break;
                case 'instant_sepa':
                    fees = 1.50; // €1.50 for instant SEPA
                    processor = 'stripe';
                    break;
                default:
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid deposit method for EU'
                    });
            }

            const transaction = {
                id: transactionId,
                userId,
                accountId,
                type: 'deposit',
                method: `eu_${method}`,
                amount: parseFloat(amount),
                currency: 'EUR',
                fees,
                processor,
                status: 'pending',
                estimatedCompletion: this.calculateCompletionTime('EU', method),
                createdAt: new Date().toISOString(),
                country: 'EU'
            };

            this.pendingTransactions.set(transactionId, transaction);

            // Simulate processing
            setTimeout(() => {
                this.processInternationalTransaction(transactionId);
            }, 10000);

            res.json({
                success: true,
                data: {
                    transactionId,
                    status: transaction.status,
                    estimatedCompletion: transaction.estimatedCompletion,
                    fees: transaction.fees,
                    currency: transaction.currency,
                    processor: transaction.processor
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async processNigeriaDeposit(req, res) {
        try {
            const { userId, accountId, amount, method } = req.body;

            const user = this.users.get(userId);
            if (!user || user.country !== 'NG') {
                return res.status(400).json({
                    success: false,
                    error: 'User must be from Nigeria for this deposit method'
                });
            }

            const transactionId = uuidv4();
            let fees = 0;
            let processor = 'flutterwave';

            // Nigeria-specific deposit methods
            switch (method) {
                case 'bank_transfer':
                    fees = amount * 0.015; // 1.5% for bank transfer
                    processor = 'flutterwave';
                    break;
                case 'ussd':
                    fees = 100; // ₦100 flat fee
                    processor = 'paystack';
                    break;
                case 'mobile_money':
                    fees = amount * 0.02; // 2% for mobile money
                    processor = 'flutterwave';
                    break;
                case 'card':
                    fees = amount * 0.025; // 2.5% for card
                    processor = 'paystack';
                    break;
                default:
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid deposit method for Nigeria'
                    });
            }

            const transaction = {
                id: transactionId,
                userId,
                accountId,
                type: 'deposit',
                method: `ng_${method}`,
                amount: parseFloat(amount),
                currency: 'NGN',
                fees,
                processor,
                status: 'pending',
                estimatedCompletion: this.calculateCompletionTime('NG', method),
                createdAt: new Date().toISOString(),
                country: 'NG'
            };

            this.pendingTransactions.set(transactionId, transaction);

            // Simulate processing
            setTimeout(() => {
                this.processInternationalTransaction(transactionId);
            }, 5000);

            res.json({
                success: true,
                data: {
                    transactionId,
                    status: transaction.status,
                    estimatedCompletion: transaction.estimatedCompletion,
                    fees: transaction.fees,
                    currency: transaction.currency,
                    processor: transaction.processor
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    calculateCompletionTime(country, method) {
        const now = new Date();
        const completionTimes = {
            'UK': {
                'faster_payments': 0, // Instant
                'bank_transfer': 2 * 60 * 60 * 1000, // 2 hours
                'open_banking': 0 // Instant
            },
            'EU': {
                'sepa': 24 * 60 * 60 * 1000, // 1 day
                'bank_transfer': 2 * 24 * 60 * 60 * 1000, // 2 days
                'instant_sepa': 0 // Instant
            },
            'NG': {
                'bank_transfer': 30 * 60 * 1000, // 30 minutes
                'ussd': 5 * 60 * 1000, // 5 minutes
                'mobile_money': 10 * 60 * 1000, // 10 minutes
                'card': 0 // Instant
            }
        };

        const delay = completionTimes[country]?.[method] || 24 * 60 * 60 * 1000;
        return new Date(now.getTime() + delay).toISOString();
    }

    async processInternationalTransaction(transactionId) {
        const transaction = this.pendingTransactions.get(transactionId);
        if (!transaction) return;

        // Simulate success rate based on country and method
        const successRates = {
            'UK': 0.98,
            'EU': 0.96,
            'NG': 0.92,
            'US': 0.97
        };

        const successRate = successRates[transaction.country] || 0.95;
        const success = Math.random() < successRate;

        if (success) {
            transaction.status = 'completed';
            transaction.completedAt = new Date().toISOString();

            if (transaction.type === 'deposit') {
                const user = this.users.get(transaction.userId);
                // Convert to user's base currency if needed
                const convertedAmount = this.convertToBaseCurrency(
                    transaction.amount - transaction.fees,
                    transaction.currency,
                    user.currency
                );
                user.accountBalance += convertedAmount;
                this.users.set(transaction.userId, user);
            }
        } else {
            transaction.status = 'failed';
            transaction.failureReason = this.getFailureReason(transaction.country);

            // Refund withdrawal if it failed
            if (transaction.type === 'withdrawal') {
                const user = this.users.get(transaction.userId);
                const convertedAmount = this.convertToBaseCurrency(
                    transaction.amount + transaction.fees,
                    transaction.currency,
                    user.currency
                );
                user.accountBalance += convertedAmount;
                this.users.set(transaction.userId, user);
            }
        }

        this.transactions.set(transactionId, transaction);
        this.pendingTransactions.delete(transactionId);

        console.log(`International transaction ${transactionId} ${transaction.status} (${transaction.country})`);
    }

    convertToBaseCurrency(amount, fromCurrency, toCurrency) {
        if (fromCurrency === toCurrency) return amount;

        const rateKey = `${fromCurrency}_${toCurrency}`;
        const rate = this.exchangeRates.get(rateKey) || 1;
        return amount * rate;
    }

    getFailureReason(country) {
        const reasons = {
            'UK': 'Bank declined transaction - insufficient funds',
            'EU': 'SEPA transfer rejected by receiving bank',
            'NG': 'Network timeout - please retry',
            'US': 'ACH transfer failed - invalid account'
        };
        return reasons[country] || 'Transaction failed - please contact support';
    }

    // Helper methods
    encryptSensitiveData(data) {
        if (!data) return '';
        return Buffer.from(String(data)).toString('base64');
    }

    async processKYCVerification(userId) {
        const user = this.users.get(userId);
        if (!user) return;

        // Simulate KYC verification (90% success rate)
        const success = Math.random() > 0.1;

        user.kycStatus = success ? 'verified' : 'rejected';
        user.verificationLevel = success ? 'full' : 'basic';
        user.kycCompletedAt = new Date().toISOString();

        this.users.set(userId, user);
        console.log(`KYC verification for ${userId} (${user.country}): ${user.kycStatus}`);
    }

    async initiateAccountVerification(accountId) {
        const account = this.bankAccounts.get(accountId);
        if (!account) return;

        // Simulate different verification methods by country
        switch (account.country) {
            case 'UK':
                account.status = 'verified'; // Open Banking instant verification
                break;
            case 'EU':
                account.status = 'verified'; // SEPA verification
                break;
            case 'NG':
                account.status = 'bvn_pending'; // BVN verification required
                break;
            default:
                account.status = 'manual_review';
        }

        account.verifiedAt = new Date().toISOString();
        this.bankAccounts.set(accountId, account);
        console.log(`Account verification for ${accountId} (${account.country}): ${account.status}`);
    }

    // Missing methods implementation
    async getUserProfile(req, res) {
        try {
            const { userId } = req.params;
            const user = this.users.get(userId);

            if (!user) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }

            // Remove sensitive data from response
            const safeUser = { ...user };
            delete safeUser.idDocument;

            res.json({ success: true, data: safeUser });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async updateUserCountry(req, res) {
        try {
            const { userId } = req.params;
            const { country } = req.body;

            if (!this.supportedCountries[country]) {
                return res.status(400).json({
                    success: false,
                    error: `Country ${country} is not supported`
                });
            }

            const user = this.users.get(userId);
            if (!user) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }

            const countryConfig = this.supportedCountries[country];
            user.country = country;
            user.currency = countryConfig.currency;
            user.availableProcessors = countryConfig.processors;
            user.depositMethods = countryConfig.depositMethods;
            user.withdrawalMethods = countryConfig.withdrawalMethods;

            this.users.set(userId, user);

            res.json({
                success: true,
                message: 'Country updated successfully',
                data: {
                    country,
                    currency: countryConfig.currency,
                    availableMethods: {
                        deposits: countryConfig.depositMethods,
                        withdrawals: countryConfig.withdrawalMethods
                    }
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async getBankAccounts(req, res) {
        try {
            const { userId } = req.params;
            const userAccounts = Array.from(this.bankAccounts.values())
                .filter(account => account.userId === userId)
                .map(account => ({
                    id: account.id,
                    bankName: account.bankName,
                    accountType: account.accountType,
                    country: account.country,
                    currency: account.currency,
                    status: account.status,
                    addedAt: account.addedAt
                }));

            res.json({ success: true, data: userAccounts });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async verifyBankAccount(req, res) {
        try {
            const { accountId } = req.params;
            const { verificationData } = req.body;

            const account = this.bankAccounts.get(accountId);
            if (!account) {
                return res.status(404).json({ success: false, error: 'Account not found' });
            }

            // For demo purposes, accept any verification data
            account.status = 'verified';
            account.verifiedAt = new Date().toISOString();
            this.bankAccounts.set(accountId, account);

            res.json({
                success: true,
                message: 'Bank account verified successfully'
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async processCardDeposit(req, res) {
        try {
            const { userId, amount, cardToken, description } = req.body;

            const user = this.users.get(userId);
            if (!user) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }

            const transactionId = uuidv4();
            const fees = amount * 0.029; // 2.9% for card processing

            const transaction = {
                id: transactionId,
                userId,
                type: 'deposit',
                method: 'card',
                amount: parseFloat(amount),
                currency: user.currency,
                fees,
                processor: 'stripe',
                status: 'completed', // Cards are instant
                description,
                createdAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
                country: user.country
            };

            // Immediately update user balance
            const convertedAmount = this.convertToBaseCurrency(
                transaction.amount - transaction.fees,
                transaction.currency,
                user.currency
            );
            user.accountBalance += convertedAmount;
            this.users.set(userId, user);

            this.transactions.set(transactionId, transaction);

            res.json({
                success: true,
                data: {
                    transactionId,
                    status: transaction.status,
                    newBalance: user.accountBalance,
                    fees: transaction.fees,
                    currency: transaction.currency
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async processUKWithdrawal(req, res) {
        try {
            const { userId, accountId, amount, method } = req.body;

            const user = this.users.get(userId);
            if (!user || user.country !== 'UK') {
                return res.status(400).json({
                    success: false,
                    error: 'User must be from UK for this withdrawal method'
                });
            }

            if (user.accountBalance < amount) {
                return res.status(400).json({
                    success: false,
                    error: 'Insufficient funds'
                });
            }

            const transactionId = uuidv4();
            let fees = 0; // UK withdrawals are typically free

            const transaction = {
                id: transactionId,
                userId,
                accountId,
                type: 'withdrawal',
                method: `uk_${method}`,
                amount: parseFloat(amount),
                currency: 'GBP',
                fees,
                processor: 'wise',
                status: 'pending',
                estimatedCompletion: this.calculateCompletionTime('UK', method),
                createdAt: new Date().toISOString(),
                country: 'UK'
            };

            // Immediately deduct from balance
            const convertedAmount = this.convertToBaseCurrency(
                amount + fees,
                'GBP',
                user.currency
            );
            user.accountBalance -= convertedAmount;
            this.users.set(userId, user);

            this.pendingTransactions.set(transactionId, transaction);

            setTimeout(() => {
                this.processInternationalTransaction(transactionId);
            }, 8000);

            res.json({
                success: true,
                data: {
                    transactionId,
                    status: transaction.status,
                    estimatedCompletion: transaction.estimatedCompletion,
                    fees: transaction.fees,
                    newBalance: user.accountBalance
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async processEUWithdrawal(req, res) {
        try {
            const { userId, accountId, amount, method } = req.body;

            const user = this.users.get(userId);
            if (!user || user.country !== 'EU') {
                return res.status(400).json({
                    success: false,
                    error: 'User must be from EU for this withdrawal method'
                });
            }

            if (user.accountBalance < amount) {
                return res.status(400).json({
                    success: false,
                    error: 'Insufficient funds'
                });
            }

            const transactionId = uuidv4();
            let fees = method === 'sepa' ? 0 : amount * 0.005; // SEPA free, others 0.5%

            const transaction = {
                id: transactionId,
                userId,
                accountId,
                type: 'withdrawal',
                method: `eu_${method}`,
                amount: parseFloat(amount),
                currency: 'EUR',
                fees,
                processor: method === 'sepa' ? 'gocardless' : 'wise',
                status: 'pending',
                estimatedCompletion: this.calculateCompletionTime('EU', method),
                createdAt: new Date().toISOString(),
                country: 'EU'
            };

            // Immediately deduct from balance
            const convertedAmount = this.convertToBaseCurrency(
                amount + fees,
                'EUR',
                user.currency
            );
            user.accountBalance -= convertedAmount;
            this.users.set(userId, user);

            this.pendingTransactions.set(transactionId, transaction);

            setTimeout(() => {
                this.processInternationalTransaction(transactionId);
            }, 10000);

            res.json({
                success: true,
                data: {
                    transactionId,
                    status: transaction.status,
                    estimatedCompletion: transaction.estimatedCompletion,
                    fees: transaction.fees,
                    newBalance: user.accountBalance
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async processNigeriaWithdrawal(req, res) {
        try {
            const { userId, accountId, amount, method } = req.body;

            const user = this.users.get(userId);
            if (!user || user.country !== 'NG') {
                return res.status(400).json({
                    success: false,
                    error: 'User must be from Nigeria for this withdrawal method'
                });
            }

            if (user.accountBalance < amount) {
                return res.status(400).json({
                    success: false,
                    error: 'Insufficient funds'
                });
            }

            const transactionId = uuidv4();
            let fees = method === 'bank_transfer' ? amount * 0.01 : amount * 0.015; // 1% or 1.5%

            const transaction = {
                id: transactionId,
                userId,
                accountId,
                type: 'withdrawal',
                method: `ng_${method}`,
                amount: parseFloat(amount),
                currency: 'NGN',
                fees,
                processor: 'flutterwave',
                status: 'pending',
                estimatedCompletion: this.calculateCompletionTime('NG', method),
                createdAt: new Date().toISOString(),
                country: 'NG'
            };

            // Immediately deduct from balance
            const convertedAmount = this.convertToBaseCurrency(
                amount + fees,
                'NGN',
                user.currency
            );
            user.accountBalance -= convertedAmount;
            this.users.set(userId, user);

            this.pendingTransactions.set(transactionId, transaction);

            setTimeout(() => {
                this.processInternationalTransaction(transactionId);
            }, 5000);

            res.json({
                success: true,
                data: {
                    transactionId,
                    status: transaction.status,
                    estimatedCompletion: transaction.estimatedCompletion,
                    fees: transaction.fees,
                    newBalance: user.accountBalance
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async getTransactionHistory(req, res) {
        try {
            const { userId } = req.params;
            const { limit = 50, offset = 0, type, status } = req.query;

            let userTransactions = Array.from(this.transactions.values())
                .filter(t => t.userId === userId);

            // Add pending transactions
            const pendingTransactions = Array.from(this.pendingTransactions.values())
                .filter(t => t.userId === userId);
            userTransactions = [...userTransactions, ...pendingTransactions];

            // Apply filters
            if (type) {
                userTransactions = userTransactions.filter(t => t.type === type);
            }
            if (status) {
                userTransactions = userTransactions.filter(t => t.status === status);
            }

            // Sort by date (newest first)
            userTransactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            // Apply pagination
            const paginatedTransactions = userTransactions.slice(offset, offset + limit);

            res.json({
                success: true,
                data: {
                    transactions: paginatedTransactions,
                    total: userTransactions.length,
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async getAccountBalance(req, res) {
        try {
            const { userId } = req.params;
            const user = this.users.get(userId);

            if (!user) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }

            // Calculate pending transactions
            const pendingDeposits = Array.from(this.pendingTransactions.values())
                .filter(t => t.userId === userId && t.type === 'deposit' && t.status === 'pending')
                .reduce((sum, t) => sum + this.convertToBaseCurrency(t.amount - t.fees, t.currency, user.currency), 0);

            const pendingWithdrawals = Array.from(this.pendingTransactions.values())
                .filter(t => t.userId === userId && t.type === 'withdrawal' && t.status === 'pending')
                .reduce((sum, t) => sum + this.convertToBaseCurrency(t.amount + t.fees, t.currency, user.currency), 0);

            res.json({
                success: true,
                data: {
                    availableBalance: user.accountBalance,
                    currency: user.currency,
                    country: user.country,
                    pendingDeposits,
                    pendingWithdrawals,
                    totalBalance: user.accountBalance + pendingDeposits,
                    lastUpdated: new Date().toISOString()
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async getTransactionLimits(req, res) {
        try {
            const { userId } = req.params;
            const user = this.users.get(userId);

            if (!user) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }

            const countryConfig = this.supportedCountries[user.country];

            res.json({
                success: true,
                data: {
                    country: user.country,
                    currency: user.currency,
                    deposit: {
                        daily: countryConfig.maxDailyDeposit,
                        monthly: countryConfig.maxDailyDeposit * 10
                    },
                    withdrawal: {
                        daily: countryConfig.maxDailyWithdrawal,
                        monthly: countryConfig.maxDailyWithdrawal * 10
                    }
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async generateComplianceReport(req, res) {
        try {
            const { startDate, endDate, country } = req.body;

            let transactions = Array.from(this.transactions.values());

            if (country) {
                transactions = transactions.filter(t => t.country === country);
            }

            if (startDate) {
                transactions = transactions.filter(t =>
                    new Date(t.createdAt) >= new Date(startDate)
                );
            }

            if (endDate) {
                transactions = transactions.filter(t =>
                    new Date(t.createdAt) <= new Date(endDate)
                );
            }

            const report = {
                totalTransactions: transactions.length,
                transactionsByCountry: {},
                transactionsByCurrency: {},
                totalVolumeUSD: 0,
                suspiciousActivity: [],
                generatedAt: new Date().toISOString()
            };

            transactions.forEach(t => {
                // Count by country
                report.transactionsByCountry[t.country] =
                    (report.transactionsByCountry[t.country] || 0) + 1;

                // Count by currency
                report.transactionsByCurrency[t.currency] =
                    (report.transactionsByCurrency[t.currency] || 0) + 1;

                // Convert to USD for total volume
                const usdAmount = this.convertToBaseCurrency(t.amount, t.currency, 'USD');
                report.totalVolumeUSD += usdAmount;

                // Flag suspicious activity (large amounts)
                if (usdAmount > 10000) {
                    report.suspiciousActivity.push({
                        transactionId: t.id,
                        amount: t.amount,
                        currency: t.currency,
                        usdAmount,
                        country: t.country,
                        date: t.createdAt
                    });
                }
            });

            res.json({ success: true, data: report });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async getFeeStructure(req, res) {
        try {
            const { country, method } = req.params;

            const feeStructures = {
                'UK': {
                    'faster_payments': { fee: 0, type: 'fixed', description: 'Free' },
                    'bank_transfer': { fee: 0, type: 'fixed', description: 'Free' },
                    'open_banking': { fee: 0, type: 'fixed', description: 'Free' }
                },
                'EU': {
                    'sepa': { fee: 0, type: 'fixed', description: 'Free for SEPA' },
                    'instant_sepa': { fee: 1.50, type: 'fixed', description: '€1.50 flat fee' },
                    'bank_transfer': { fee: 0.005, type: 'percentage', description: '0.5% of amount' }
                },
                'NG': {
                    'bank_transfer': { fee: 0.015, type: 'percentage', description: '1.5% of amount' },
                    'ussd': { fee: 100, type: 'fixed', description: '₦100 flat fee' },
                    'mobile_money': { fee: 0.02, type: 'percentage', description: '2% of amount' },
                    'card': { fee: 0.025, type: 'percentage', description: '2.5% of amount' }
                }
            };

            const countryFees = feeStructures[country.toUpperCase()];
            if (!countryFees) {
                return res.status(404).json({
                    success: false,
                    error: 'Country not supported'
                });
            }

            const methodFee = countryFees[method];
            if (!methodFee) {
                return res.status(404).json({
                    success: false,
                    error: 'Payment method not supported for this country'
                });
            }

            res.json({
                success: true,
                data: {
                    country: country.toUpperCase(),
                    method,
                    ...methodFee
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    startTransactionProcessor() {
        // Process pending transactions every 30 seconds
        setInterval(() => {
            this.processPendingTransactions();
        }, 30000);
    }

    async processPendingTransactions() {
        for (const [transactionId, transaction] of this.pendingTransactions) {
            const createdTime = new Date(transaction.createdAt);
            const now = new Date();
            const minutesElapsed = (now - createdTime) / (1000 * 60);

            if (minutesElapsed >= 1) { // Process after 1 minute for demo
                await this.processInternationalTransaction(transactionId);
            }
        }
    }

    start() {
        this.startTransactionProcessor();
        this.app.listen(this.port, () => {
            console.log(`🌍 International Banking Service running on port ${this.port}`);
            console.log(`📊 Health check: http://localhost:${this.port}/api/health`);
            console.log(`🌐 Supported countries: ${Object.keys(this.supportedCountries).join(', ')}`);
        });
    }
}

// Start the international banking service
const internationalBankingService = new InternationalBankingService();
internationalBankingService.start();

module.exports = InternationalBankingService;
