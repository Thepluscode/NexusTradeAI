const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

class BankingService {
    constructor() {
        this.app = express();
        this.port = 3003;
        
        // In-memory storage (replace with database in production)
        this.users = new Map();
        this.bankAccounts = new Map();
        this.transactions = new Map();
        this.pendingTransactions = new Map();
        
        // Mock payment processor configurations
        this.paymentProcessors = {
            stripe: { enabled: true, publicKey: 'pk_test_...', secretKey: 'sk_test_...' },
            plaid: { enabled: true, clientId: 'test_client_id', secret: 'test_secret' },
            dwolla: { enabled: true, key: 'test_key', secret: 'test_secret' }
        };
        
        this.setupMiddleware();
        this.setupRoutes();
        this.startTransactionProcessor();
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
                service: 'banking',
                timestamp: new Date().toISOString(),
                processors: this.paymentProcessors
            });
        });

        // User account management
        this.app.post('/api/banking/users/register', this.registerUser.bind(this));
        this.app.get('/api/banking/users/:userId', this.getUserProfile.bind(this));
        this.app.put('/api/banking/users/:userId/kyc', this.updateKYC.bind(this));

        // Bank account management
        this.app.post('/api/banking/accounts/add', this.addBankAccount.bind(this));
        this.app.get('/api/banking/accounts/:userId', this.getBankAccounts.bind(this));
        this.app.post('/api/banking/accounts/:accountId/verify', this.verifyBankAccount.bind(this));
        this.app.delete('/api/banking/accounts/:accountId', this.removeBankAccount.bind(this));

        // Deposits
        this.app.post('/api/banking/deposits/ach', this.initiateACHDeposit.bind(this));
        this.app.post('/api/banking/deposits/wire', this.initiateWireDeposit.bind(this));
        this.app.post('/api/banking/deposits/instant', this.initiateInstantDeposit.bind(this));

        // Withdrawals
        this.app.post('/api/banking/withdrawals/ach', this.initiateACHWithdrawal.bind(this));
        this.app.post('/api/banking/withdrawals/wire', this.initiateWireWithdrawal.bind(this));

        // Transaction management
        this.app.get('/api/banking/transactions/:userId', this.getTransactionHistory.bind(this));
        this.app.get('/api/banking/transactions/:transactionId/status', this.getTransactionStatus.bind(this));
        this.app.post('/api/banking/transactions/:transactionId/cancel', this.cancelTransaction.bind(this));

        // Balance and limits
        this.app.get('/api/banking/balance/:userId', this.getAccountBalance.bind(this));
        this.app.get('/api/banking/limits/:userId', this.getTransactionLimits.bind(this));

        // Compliance and security
        this.app.post('/api/banking/compliance/report', this.generateComplianceReport.bind(this));
        this.app.get('/api/banking/security/alerts/:userId', this.getSecurityAlerts.bind(this));

        // Demo setup endpoint
        this.app.post('/api/banking/demo/setup/:userId', this.setupDemoUser.bind(this));
    }

    // User Registration and KYC
    async registerUser(req, res) {
        try {
            const { email, firstName, lastName, dateOfBirth, ssn, address } = req.body;
            
            const userId = uuidv4();
            const user = {
                id: userId,
                email,
                firstName,
                lastName,
                dateOfBirth,
                ssn: this.encryptSensitiveData(ssn),
                address,
                kycStatus: 'pending',
                accountBalance: 0,
                createdAt: new Date().toISOString(),
                verificationLevel: 'basic'
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
                    kycStatus: user.kycStatus,
                    verificationLevel: user.verificationLevel
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async getUserProfile(req, res) {
        try {
            const { userId } = req.params;
            const user = this.users.get(userId);

            if (!user) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }

            // Remove sensitive data from response
            const safeUser = { ...user };
            delete safeUser.ssn;

            res.json({ success: true, data: safeUser });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    // Bank Account Management
    async addBankAccount(req, res) {
        try {
            const { userId, accountNumber, routingNumber, accountType, bankName } = req.body;
            
            const user = this.users.get(userId);
            if (!user) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }

            const accountId = uuidv4();
            const bankAccount = {
                id: accountId,
                userId,
                accountNumber: this.encryptSensitiveData(accountNumber),
                routingNumber,
                accountType, // checking, savings
                bankName,
                status: 'pending_verification',
                verificationMethod: 'micro_deposits',
                addedAt: new Date().toISOString()
            };

            this.bankAccounts.set(accountId, bankAccount);

            // Simulate micro-deposit verification
            setTimeout(() => {
                this.initiateMicroDeposits(accountId);
            }, 2000);

            res.json({
                success: true,
                data: {
                    accountId,
                    status: bankAccount.status,
                    verificationMethod: bankAccount.verificationMethod
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
                    lastFour: this.getLastFourDigits(account.accountNumber),
                    status: account.status,
                    addedAt: account.addedAt
                }));

            res.json({ success: true, data: userAccounts });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    // Deposit Methods
    async initiateACHDeposit(req, res) {
        try {
            const { userId, accountId, amount, description } = req.body;
            
            const validation = this.validateTransaction(userId, accountId, amount, 'deposit');
            if (!validation.valid) {
                return res.status(400).json({ success: false, error: validation.error });
            }

            const transactionId = uuidv4();
            const transaction = {
                id: transactionId,
                userId,
                accountId,
                type: 'deposit',
                method: 'ach',
                amount: parseFloat(amount),
                description,
                status: 'pending',
                estimatedCompletion: this.calculateACHCompletion(),
                fees: this.calculateFees('ach_deposit', amount),
                createdAt: new Date().toISOString()
            };

            this.pendingTransactions.set(transactionId, transaction);

            // Simulate ACH processing
            setTimeout(() => {
                this.processACHTransaction(transactionId);
            }, 10000);

            res.json({
                success: true,
                data: {
                    transactionId,
                    status: transaction.status,
                    estimatedCompletion: transaction.estimatedCompletion,
                    fees: transaction.fees
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async initiateInstantDeposit(req, res) {
        try {
            const { userId, accountId, amount, description } = req.body;
            
            const validation = this.validateTransaction(userId, accountId, amount, 'deposit');
            if (!validation.valid) {
                return res.status(400).json({ success: false, error: validation.error });
            }

            // Instant deposits have higher fees but immediate availability
            const transactionId = uuidv4();
            const transaction = {
                id: transactionId,
                userId,
                accountId,
                type: 'deposit',
                method: 'instant',
                amount: parseFloat(amount),
                description,
                status: 'completed',
                fees: this.calculateFees('instant_deposit', amount),
                createdAt: new Date().toISOString(),
                completedAt: new Date().toISOString()
            };

            // Immediately update user balance
            const user = this.users.get(userId);
            user.accountBalance += transaction.amount - transaction.fees;
            this.users.set(userId, user);

            this.transactions.set(transactionId, transaction);

            res.json({
                success: true,
                data: {
                    transactionId,
                    status: transaction.status,
                    newBalance: user.accountBalance,
                    fees: transaction.fees
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    // Withdrawal Methods
    async initiateACHWithdrawal(req, res) {
        try {
            const { userId, accountId, amount, description } = req.body;
            
            const validation = this.validateTransaction(userId, accountId, amount, 'withdrawal');
            if (!validation.valid) {
                return res.status(400).json({ success: false, error: validation.error });
            }

            const user = this.users.get(userId);
            if (user.accountBalance < amount) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Insufficient funds' 
                });
            }

            const transactionId = uuidv4();
            const fees = this.calculateFees('ach_withdrawal', amount);
            const transaction = {
                id: transactionId,
                userId,
                accountId,
                type: 'withdrawal',
                method: 'ach',
                amount: parseFloat(amount),
                description,
                status: 'pending',
                estimatedCompletion: this.calculateACHCompletion(),
                fees,
                createdAt: new Date().toISOString()
            };

            // Immediately deduct from balance (hold funds)
            user.accountBalance -= (amount + fees);
            this.users.set(userId, user);

            this.pendingTransactions.set(transactionId, transaction);

            // Simulate ACH processing
            setTimeout(() => {
                this.processACHTransaction(transactionId);
            }, 15000);

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

    // Helper Methods
    validateTransaction(userId, accountId, amount, type) {
        const user = this.users.get(userId);
        if (!user) {
            return { valid: false, error: 'User not found' };
        }

        if (user.kycStatus !== 'verified') {
            return { valid: false, error: 'KYC verification required' };
        }

        const account = this.bankAccounts.get(accountId);
        if (!account || account.userId !== userId) {
            return { valid: false, error: 'Bank account not found' };
        }

        if (account.status !== 'verified') {
            return { valid: false, error: 'Bank account not verified' };
        }

        const limits = this.getTransactionLimitsForUser(userId);
        if (amount > limits[type].daily) {
            return { valid: false, error: 'Amount exceeds daily limit' };
        }

        return { valid: true };
    }

    encryptSensitiveData(data) {
        // In production, use proper encryption
        return Buffer.from(data).toString('base64');
    }

    getLastFourDigits(encryptedData) {
        // In production, decrypt and get last 4 digits
        const decrypted = Buffer.from(encryptedData, 'base64').toString();
        return '****' + decrypted.slice(-4);
    }

    calculateFees(method, amount) {
        const feeStructure = {
            'ach_deposit': 0, // Free
            'ach_withdrawal': 0, // Free
            'instant_deposit': Math.max(1.50, amount * 0.015), // 1.5% or $1.50 minimum
            'wire_deposit': 15.00,
            'wire_withdrawal': 25.00
        };
        return feeStructure[method] || 0;
    }

    calculateACHCompletion() {
        // ACH typically takes 1-3 business days
        const now = new Date();
        now.setDate(now.getDate() + 2);
        return now.toISOString();
    }

    // Transaction Processing
    async processACHTransaction(transactionId) {
        const transaction = this.pendingTransactions.get(transactionId);
        if (!transaction) return;

        // Simulate ACH processing success/failure (95% success rate)
        const success = Math.random() > 0.05;

        if (success) {
            transaction.status = 'completed';
            transaction.completedAt = new Date().toISOString();

            if (transaction.type === 'deposit') {
                const user = this.users.get(transaction.userId);
                user.accountBalance += transaction.amount - transaction.fees;
                this.users.set(transaction.userId, user);
            }
        } else {
            transaction.status = 'failed';
            transaction.failureReason = 'Bank declined transaction';

            // Refund withdrawal if it failed
            if (transaction.type === 'withdrawal') {
                const user = this.users.get(transaction.userId);
                user.accountBalance += transaction.amount + transaction.fees;
                this.users.set(transaction.userId, user);
            }
        }

        this.transactions.set(transactionId, transaction);
        this.pendingTransactions.delete(transactionId);

        console.log(`Transaction ${transactionId} ${transaction.status}`);
    }

    async processPendingTransactions() {
        for (const [transactionId, transaction] of this.pendingTransactions) {
            // Check if transaction should be processed
            const createdTime = new Date(transaction.createdAt);
            const now = new Date();
            const minutesElapsed = (now - createdTime) / (1000 * 60);

            if (minutesElapsed >= 1) { // Process after 1 minute for demo
                await this.processACHTransaction(transactionId);
            }
        }
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
        console.log(`KYC verification for ${userId}: ${user.kycStatus}`);
    }

    async initiateMicroDeposits(accountId) {
        const account = this.bankAccounts.get(accountId);
        if (!account) return;

        // Simulate micro-deposit verification
        account.microDeposits = [
            { amount: Math.floor(Math.random() * 99) + 1 }, // $0.01-$0.99
            { amount: Math.floor(Math.random() * 99) + 1 }
        ];
        account.status = 'micro_deposits_sent';

        this.bankAccounts.set(accountId, account);
        console.log(`Micro-deposits sent to account ${accountId}`);
    }

    async verifyBankAccount(req, res) {
        try {
            const { accountId } = req.params;
            const { deposit1, deposit2 } = req.body;

            const account = this.bankAccounts.get(accountId);
            if (!account) {
                return res.status(404).json({ success: false, error: 'Account not found' });
            }

            if (account.status !== 'micro_deposits_sent') {
                return res.status(400).json({
                    success: false,
                    error: 'Account not ready for verification'
                });
            }

            // For demo purposes, accept any reasonable amounts (1-99 cents)
            if (deposit1 >= 1 && deposit1 <= 99 && deposit2 >= 1 && deposit2 <= 99) {
                account.status = 'verified';
                account.verifiedAt = new Date().toISOString();
                this.bankAccounts.set(accountId, account);

                res.json({ success: true, message: 'Bank account verified successfully' });
            } else {
                res.status(400).json({
                    success: false,
                    error: 'Please enter valid micro-deposit amounts (1-99 cents)'
                });
            }
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
                .reduce((sum, t) => sum + t.amount - t.fees, 0);

            const pendingWithdrawals = Array.from(this.pendingTransactions.values())
                .filter(t => t.userId === userId && t.type === 'withdrawal' && t.status === 'pending')
                .reduce((sum, t) => sum + t.amount + t.fees, 0);

            res.json({
                success: true,
                data: {
                    availableBalance: user.accountBalance,
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

    getTransactionLimitsForUser(userId) {
        const user = this.users.get(userId);
        const baseLimit = user?.verificationLevel === 'full' ? 50000 : 10000;

        return {
            deposit: {
                daily: baseLimit,
                monthly: baseLimit * 10,
                perTransaction: baseLimit / 2
            },
            withdrawal: {
                daily: baseLimit * 0.8,
                monthly: baseLimit * 8,
                perTransaction: baseLimit * 0.4
            }
        };
    }

    async getTransactionLimits(req, res) {
        try {
            const { userId } = req.params;
            const limits = this.getTransactionLimitsForUser(userId);

            res.json({ success: true, data: limits });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async updateKYC(req, res) {
        try {
            const { userId } = req.params;
            const { kycData } = req.body;

            const user = this.users.get(userId);
            if (!user) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }

            // Update KYC information
            user.kycData = { ...user.kycData, ...kycData };
            user.kycStatus = 'pending';
            this.users.set(userId, user);

            // Simulate KYC processing
            setTimeout(() => {
                this.processKYCVerification(userId);
            }, 3000);

            res.json({
                success: true,
                message: 'KYC information updated, verification in progress'
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async removeBankAccount(req, res) {
        try {
            const { accountId } = req.params;

            const account = this.bankAccounts.get(accountId);
            if (!account) {
                return res.status(404).json({ success: false, error: 'Account not found' });
            }

            this.bankAccounts.delete(accountId);

            res.json({
                success: true,
                message: 'Bank account removed successfully'
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async initiateWireDeposit(req, res) {
        try {
            const { userId, amount, description } = req.body;

            const user = this.users.get(userId);
            if (!user || user.kycStatus !== 'verified') {
                return res.status(400).json({
                    success: false,
                    error: 'KYC verification required for wire transfers'
                });
            }

            const transactionId = uuidv4();
            const transaction = {
                id: transactionId,
                userId,
                type: 'deposit',
                method: 'wire',
                amount: parseFloat(amount),
                description,
                status: 'pending',
                fees: this.calculateFees('wire_deposit', amount),
                createdAt: new Date().toISOString(),
                estimatedCompletion: new Date().toISOString() // Same day
            };

            this.pendingTransactions.set(transactionId, transaction);

            // Simulate wire processing (faster than ACH)
            setTimeout(() => {
                this.processACHTransaction(transactionId);
            }, 5000);

            res.json({
                success: true,
                data: {
                    transactionId,
                    status: transaction.status,
                    fees: transaction.fees,
                    wireInstructions: {
                        bankName: 'NexusTradeAI Bank',
                        routingNumber: '123456789',
                        accountNumber: '9876543210',
                        reference: transactionId
                    }
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async initiateWireWithdrawal(req, res) {
        try {
            const { userId, amount, description, wireDetails } = req.body;

            const user = this.users.get(userId);
            if (!user || user.kycStatus !== 'verified') {
                return res.status(400).json({
                    success: false,
                    error: 'KYC verification required for wire transfers'
                });
            }

            if (user.accountBalance < amount) {
                return res.status(400).json({
                    success: false,
                    error: 'Insufficient funds'
                });
            }

            const transactionId = uuidv4();
            const fees = this.calculateFees('wire_withdrawal', amount);
            const transaction = {
                id: transactionId,
                userId,
                type: 'withdrawal',
                method: 'wire',
                amount: parseFloat(amount),
                description,
                status: 'pending',
                fees,
                wireDetails,
                createdAt: new Date().toISOString(),
                estimatedCompletion: new Date().toISOString() // Same day
            };

            // Immediately deduct from balance
            user.accountBalance -= (amount + fees);
            this.users.set(userId, user);

            this.pendingTransactions.set(transactionId, transaction);

            // Simulate wire processing
            setTimeout(() => {
                this.processACHTransaction(transactionId);
            }, 8000);

            res.json({
                success: true,
                data: {
                    transactionId,
                    status: transaction.status,
                    fees: transaction.fees,
                    newBalance: user.accountBalance
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async getTransactionStatus(req, res) {
        try {
            const { transactionId } = req.params;

            let transaction = this.transactions.get(transactionId) ||
                             this.pendingTransactions.get(transactionId);

            if (!transaction) {
                return res.status(404).json({ success: false, error: 'Transaction not found' });
            }

            res.json({ success: true, data: transaction });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async cancelTransaction(req, res) {
        try {
            const { transactionId } = req.params;

            const transaction = this.pendingTransactions.get(transactionId);
            if (!transaction) {
                return res.status(404).json({
                    success: false,
                    error: 'Transaction not found or cannot be cancelled'
                });
            }

            if (transaction.status !== 'pending') {
                return res.status(400).json({
                    success: false,
                    error: 'Only pending transactions can be cancelled'
                });
            }

            // Refund if it was a withdrawal
            if (transaction.type === 'withdrawal') {
                const user = this.users.get(transaction.userId);
                user.accountBalance += transaction.amount + transaction.fees;
                this.users.set(transaction.userId, user);
            }

            transaction.status = 'cancelled';
            transaction.cancelledAt = new Date().toISOString();

            this.transactions.set(transactionId, transaction);
            this.pendingTransactions.delete(transactionId);

            res.json({
                success: true,
                message: 'Transaction cancelled successfully'
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async generateComplianceReport(req, res) {
        try {
            const { startDate, endDate, userId } = req.body;

            let transactions = Array.from(this.transactions.values());

            if (userId) {
                transactions = transactions.filter(t => t.userId === userId);
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
                totalVolume: transactions.reduce((sum, t) => sum + t.amount, 0),
                depositCount: transactions.filter(t => t.type === 'deposit').length,
                withdrawalCount: transactions.filter(t => t.type === 'withdrawal').length,
                suspiciousActivity: transactions.filter(t => t.amount > 10000).length,
                generatedAt: new Date().toISOString()
            };

            res.json({ success: true, data: report });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async getSecurityAlerts(req, res) {
        try {
            const { userId } = req.params;

            // Mock security alerts
            const alerts = [
                {
                    id: uuidv4(),
                    type: 'large_transaction',
                    message: 'Large transaction detected',
                    severity: 'medium',
                    timestamp: new Date().toISOString()
                }
            ];

            res.json({ success: true, data: alerts });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async setupDemoUser(req, res) {
        try {
            const { userId } = req.params;
            const { balance = 1175767.40 } = req.body;

            const user = this.users.get(userId);
            if (!user) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }

            // Set demo balance
            user.accountBalance = balance;
            user.kycStatus = 'verified';
            user.verificationLevel = 'full';
            this.users.set(userId, user);

            // Create a demo transaction record
            const transactionId = uuidv4();
            const transaction = {
                id: transactionId,
                userId,
                type: 'deposit',
                method: 'demo_setup',
                amount: balance,
                currency: 'USD',
                fees: 0,
                status: 'completed',
                description: 'Demo account setup',
                createdAt: new Date().toISOString(),
                completedAt: new Date().toISOString()
            };

            this.transactions.set(transactionId, transaction);

            res.json({
                success: true,
                message: 'Demo user setup completed',
                data: {
                    userId,
                    balance: user.accountBalance,
                    transactionId
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

    start() {
        this.app.listen(this.port, () => {
            console.log(`🏦 Banking Service running on port ${this.port}`);
            console.log(`📊 Health check: http://localhost:${this.port}/api/health`);
        });
    }
}

// Start the banking service
const bankingService = new BankingService();
bankingService.start();

module.exports = BankingService;
