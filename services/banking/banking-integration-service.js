// Banking Integration Service
// Handles real money deposits, withdrawals, and account management

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.BANKING_DASHBOARD_PORT || 3012;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve static files from banking directory

// Mock banking data for demonstration (replace with real banking APIs)
let bankingData = {
    accounts: [
        {
            id: 'acc_001',
            accountNumber: '****1234',
            routingNumber: '021000021',
            bankName: 'Chase Bank',
            accountType: 'Checking',
            balance: 250000.00,
            availableBalance: 245000.00,
            isVerified: true,
            isPrimary: true,
            lastUpdated: new Date().toISOString()
        },
        {
            id: 'acc_002',
            accountNumber: '****5678',
            routingNumber: '026009593',
            bankName: 'Bank of America',
            accountType: 'Savings',
            balance: 500000.00,
            availableBalance: 500000.00,
            isVerified: true,
            isPrimary: false,
            lastUpdated: new Date().toISOString()
        }
    ],
    tradingAccount: {
        id: 'trading_001',
        balance: 825000000.00,
        availableCash: 750000000.00,
        buyingPower: 750000000.00,
        totalValue: 825000000.00,
        unrealizedPnL: 37500000.00,
        realizedPnL: 87500000.00,
        dayTradingBuyingPower: 750000000.00,
        isLive: true,
        accountType: 'Institutional',
        lastUpdated: new Date().toISOString()
    },
    transactions: [
        {
            id: 'txn_001',
            type: 'deposit',
            amount: 100000.00,
            fromAccount: 'acc_001',
            toAccount: 'trading_001',
            status: 'completed',
            timestamp: new Date(Date.now() - 86400000).toISOString(),
            description: 'Initial trading account funding'
        },
        {
            id: 'txn_002',
            type: 'withdrawal',
            amount: 50000.00,
            fromAccount: 'trading_001',
            toAccount: 'acc_001',
            status: 'completed',
            timestamp: new Date(Date.now() - 43200000).toISOString(),
            description: 'Profit withdrawal'
        }
    ]
};

// Banking API Endpoints

// Get all linked bank accounts
app.get('/api/banking/accounts', (req, res) => {
    res.json({
        success: true,
        data: bankingData.accounts,
        timestamp: new Date().toISOString()
    });
});

// Get trading account balance
app.get('/api/banking/trading-account', (req, res) => {
    res.json({
        success: true,
        data: bankingData.tradingAccount,
        timestamp: new Date().toISOString()
    });
});

// Deposit money from bank to trading account
app.post('/api/banking/deposit', (req, res) => {
    const { amount, fromAccountId, description } = req.body;
    
    // Validate deposit
    if (!amount || amount <= 0) {
        return res.status(400).json({
            success: false,
            error: 'Invalid deposit amount'
        });
    }
    
    if (amount > process.env.DAILY_DEPOSIT_LIMIT) {
        return res.status(400).json({
            success: false,
            error: `Deposit amount exceeds daily limit of $${process.env.DAILY_DEPOSIT_LIMIT.toLocaleString()}`
        });
    }
    
    // Find source account
    const sourceAccount = bankingData.accounts.find(acc => acc.id === fromAccountId);
    if (!sourceAccount) {
        return res.status(404).json({
            success: false,
            error: 'Source account not found'
        });
    }
    
    if (sourceAccount.availableBalance < amount) {
        return res.status(400).json({
            success: false,
            error: 'Insufficient funds in source account'
        });
    }
    
    // Process deposit
    const transactionId = `txn_${Date.now()}`;
    const transaction = {
        id: transactionId,
        type: 'deposit',
        amount: amount,
        fromAccount: fromAccountId,
        toAccount: 'trading_001',
        status: 'processing',
        timestamp: new Date().toISOString(),
        description: description || 'Trading account deposit',
        estimatedCompletion: new Date(Date.now() + 3600000).toISOString() // 1 hour
    };
    
    // Update balances
    sourceAccount.availableBalance -= amount;
    bankingData.tradingAccount.availableCash += amount;
    bankingData.tradingAccount.balance += amount;
    bankingData.tradingAccount.totalValue += amount;
    bankingData.tradingAccount.buyingPower += amount;
    
    // Add transaction
    bankingData.transactions.unshift(transaction);
    
    console.log(`💰 Deposit processed: $${amount.toLocaleString()} from ${sourceAccount.bankName}`);
    
    res.json({
        success: true,
        message: 'Deposit initiated successfully',
        data: {
            transaction: transaction,
            newTradingBalance: bankingData.tradingAccount.balance,
            newBankBalance: sourceAccount.availableBalance
        }
    });
});

// Withdraw money from trading account to bank
app.post('/api/banking/withdraw', (req, res) => {
    const { amount, toAccountId, description } = req.body;
    
    // Validate withdrawal
    if (!amount || amount <= 0) {
        return res.status(400).json({
            success: false,
            error: 'Invalid withdrawal amount'
        });
    }
    
    if (amount > process.env.DAILY_WITHDRAWAL_LIMIT) {
        return res.status(400).json({
            success: false,
            error: `Withdrawal amount exceeds daily limit of $${process.env.DAILY_WITHDRAWAL_LIMIT.toLocaleString()}`
        });
    }
    
    if (bankingData.tradingAccount.availableCash < amount) {
        return res.status(400).json({
            success: false,
            error: 'Insufficient available cash in trading account'
        });
    }
    
    // Find destination account
    const destAccount = bankingData.accounts.find(acc => acc.id === toAccountId);
    if (!destAccount) {
        return res.status(404).json({
            success: false,
            error: 'Destination account not found'
        });
    }
    
    // Process withdrawal
    const transactionId = `txn_${Date.now()}`;
    const transaction = {
        id: transactionId,
        type: 'withdrawal',
        amount: amount,
        fromAccount: 'trading_001',
        toAccount: toAccountId,
        status: 'processing',
        timestamp: new Date().toISOString(),
        description: description || 'Trading account withdrawal',
        estimatedCompletion: new Date(Date.now() + 7200000).toISOString() // 2 hours
    };
    
    // Update balances
    bankingData.tradingAccount.availableCash -= amount;
    bankingData.tradingAccount.balance -= amount;
    bankingData.tradingAccount.totalValue -= amount;
    destAccount.availableBalance += amount;
    destAccount.balance += amount;
    
    // Add transaction
    bankingData.transactions.unshift(transaction);
    
    console.log(`💸 Withdrawal processed: $${amount.toLocaleString()} to ${destAccount.bankName}`);
    
    res.json({
        success: true,
        message: 'Withdrawal initiated successfully',
        data: {
            transaction: transaction,
            newTradingBalance: bankingData.tradingAccount.balance,
            newBankBalance: destAccount.availableBalance
        }
    });
});

// Get transaction history
app.get('/api/banking/transactions', (req, res) => {
    const { limit = 50, type } = req.query;
    
    let transactions = bankingData.transactions;
    
    if (type) {
        transactions = transactions.filter(txn => txn.type === type);
    }
    
    transactions = transactions.slice(0, parseInt(limit));
    
    res.json({
        success: true,
        data: transactions,
        total: bankingData.transactions.length,
        timestamp: new Date().toISOString()
    });
});

// Link new bank account (Plaid integration simulation)
app.post('/api/banking/link-account', (req, res) => {
    const { bankName, accountType, routingNumber, accountNumber } = req.body;
    
    const newAccount = {
        id: `acc_${Date.now()}`,
        accountNumber: `****${accountNumber.slice(-4)}`,
        routingNumber: routingNumber,
        bankName: bankName,
        accountType: accountType,
        balance: Math.floor(Math.random() * 100000) + 10000, // Random balance for demo
        availableBalance: 0, // Needs verification
        isVerified: false,
        isPrimary: false,
        lastUpdated: new Date().toISOString(),
        verificationStatus: 'pending'
    };
    
    bankingData.accounts.push(newAccount);
    
    console.log(`🏦 New bank account linked: ${bankName} - ${accountType}`);
    
    res.json({
        success: true,
        message: 'Bank account linked successfully. Verification required.',
        data: newAccount
    });
});

// Health check
app.get('/api/banking/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'banking-integration-service',
        timestamp: new Date().toISOString(),
        features: {
            deposits: process.env.BANK_DEPOSIT_ENABLED === 'true',
            withdrawals: process.env.BANK_WITHDRAWAL_ENABLED === 'true',
            realTrading: process.env.REAL_MONEY_TRADING_ENABLED === 'true',
            multiAccount: process.env.MULTI_ACCOUNT_SUPPORT === 'true'
        }
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🏦 Banking Integration Service running on port ${PORT}`);
    console.log(`💰 Real money trading: ${process.env.REAL_MONEY_TRADING_ENABLED === 'true' ? 'ENABLED' : 'DISABLED'}`);
    console.log(`🏧 Bank deposits: ${process.env.BANK_DEPOSIT_ENABLED === 'true' ? 'ENABLED' : 'DISABLED'}`);
    console.log(`💸 Bank withdrawals: ${process.env.BANK_WITHDRAWAL_ENABLED === 'true' ? 'ENABLED' : 'DISABLED'}`);
    console.log(`📊 Banking dashboard: http://localhost:${PORT}/api/banking/health`);
});

module.exports = app;
