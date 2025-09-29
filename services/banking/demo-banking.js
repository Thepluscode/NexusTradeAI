const axios = require('axios');

const BANKING_API = 'http://localhost:3003';
let DEMO_USER_ID = 'demo-user-123';

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function demonstrateBankingSystem() {
    console.log('🏦 NexusTradeAI Banking System Demo');
    console.log('=====================================\n');

    try {
        // 1. Check service health
        console.log('1. 🔍 Checking Banking Service Health...');
        const healthResponse = await axios.get(`${BANKING_API}/api/health`);
        console.log('✅ Banking service is healthy');
        console.log(`   Processors: ${Object.keys(healthResponse.data.processors).join(', ')}\n`);

        // 2. Register a demo user
        console.log('2. 👤 Registering Demo User...');
        const userResponse = await axios.post(`${BANKING_API}/api/banking/users/register`, {
            email: 'demo@nexustradeai.com',
            firstName: 'John',
            lastName: 'Trader',
            dateOfBirth: '1990-01-01',
            ssn: '123-45-6789',
            address: {
                street: '123 Trading St',
                city: 'New York',
                state: 'NY',
                zip: '10001'
            }
        });
        DEMO_USER_ID = userResponse.data.data.userId; // Use the actual user ID
        console.log(`✅ User registered with ID: ${DEMO_USER_ID}`);
        console.log(`   KYC Status: ${userResponse.data.data.kycStatus}\n`);

        // Wait for KYC verification
        console.log('3. ⏳ Waiting for KYC verification...');
        await sleep(6000);

        const userProfile = await axios.get(`${BANKING_API}/api/banking/users/${DEMO_USER_ID}`);
        console.log(`✅ KYC Status: ${userProfile.data.data.kycStatus}`);
        console.log(`   Verification Level: ${userProfile.data.data.verificationLevel}\n`);

        // 3. Add a bank account
        console.log('4. 🏛️ Adding Bank Account...');
        const bankAccountResponse = await axios.post(`${BANKING_API}/api/banking/accounts/add`, {
            userId: DEMO_USER_ID,
            bankName: 'Chase Bank',
            accountType: 'checking',
            routingNumber: '021000021',
            accountNumber: '1234567890'
        });
        const accountId = bankAccountResponse.data.data.accountId;
        console.log(`✅ Bank account added: ${accountId}`);
        console.log(`   Status: ${bankAccountResponse.data.data.status}\n`);

        // Wait for micro-deposits
        console.log('5. ⏳ Waiting for micro-deposits...');
        await sleep(3000);

        // Get the actual micro-deposit amounts first
        console.log('6. 🔍 Getting micro-deposit amounts...');
        const bankAccountsResponse = await axios.get(`${BANKING_API}/api/banking/accounts/${DEMO_USER_ID}`);
        const bankAccount = bankAccountsResponse.data.data.find(acc => acc.id === accountId);

        // For demo purposes, we'll simulate knowing the micro-deposit amounts
        // In a real app, the user would enter these amounts from their bank statement
        console.log('7. ✅ Verifying Bank Account...');
        await axios.post(`${BANKING_API}/api/banking/accounts/${accountId}/verify`, {
            deposit1: 50, // Simulated amounts - in reality these come from the bank
            deposit2: 75
        });
        console.log('✅ Bank account verified successfully\n');

        // 4. Check account balance
        console.log('8. 💰 Checking Account Balance...');
        const balanceResponse = await axios.get(`${BANKING_API}/api/banking/balance/${DEMO_USER_ID}`);
        console.log(`   Available Balance: $${balanceResponse.data.data.availableBalance.toLocaleString()}`);
        console.log(`   Pending Deposits: $${balanceResponse.data.data.pendingDeposits.toLocaleString()}`);
        console.log(`   Pending Withdrawals: $${balanceResponse.data.data.pendingWithdrawals.toLocaleString()}\n`);

        // 5. Make an instant deposit
        console.log('9. 💸 Making Instant Deposit ($5,000)...');
        const instantDepositResponse = await axios.post(`${BANKING_API}/api/banking/deposits/instant`, {
            userId: DEMO_USER_ID,
            accountId: accountId,
            amount: 5000,
            description: 'Initial trading capital'
        });
        console.log(`✅ Instant deposit completed: ${instantDepositResponse.data.data.transactionId}`);
        console.log(`   New Balance: $${instantDepositResponse.data.data.newBalance.toLocaleString()}`);
        console.log(`   Fees: $${instantDepositResponse.data.data.fees.toFixed(2)}\n`);

        // 6. Make an ACH deposit
        console.log('10. 🏦 Making ACH Deposit ($10,000)...');
        const achDepositResponse = await axios.post(`${BANKING_API}/api/banking/deposits/ach`, {
            userId: DEMO_USER_ID,
            accountId: accountId,
            amount: 10000,
            description: 'Additional trading funds'
        });
        console.log(`✅ ACH deposit initiated: ${achDepositResponse.data.data.transactionId}`);
        console.log(`   Status: ${achDepositResponse.data.data.status}`);
        console.log(`   Estimated Completion: ${new Date(achDepositResponse.data.data.estimatedCompletion).toLocaleDateString()}\n`);

        // 7. Make a withdrawal
        console.log('11. 💳 Making ACH Withdrawal ($1,000)...');
        const withdrawalResponse = await axios.post(`${BANKING_API}/api/banking/withdrawals/ach`, {
            userId: DEMO_USER_ID,
            accountId: accountId,
            amount: 1000,
            description: 'Profit withdrawal'
        });
        console.log(`✅ ACH withdrawal initiated: ${withdrawalResponse.data.data.transactionId}`);
        console.log(`   Status: ${withdrawalResponse.data.data.status}`);
        console.log(`   New Balance: $${withdrawalResponse.data.data.newBalance.toLocaleString()}\n`);

        // 8. Check transaction history
        console.log('12. 📊 Checking Transaction History...');
        const transactionsResponse = await axios.get(`${BANKING_API}/api/banking/transactions/${DEMO_USER_ID}?limit=5`);
        console.log(`✅ Found ${transactionsResponse.data.data.transactions.length} transactions:`);
        transactionsResponse.data.data.transactions.forEach((tx, index) => {
            const sign = tx.type === 'deposit' ? '+' : '-';
            console.log(`   ${index + 1}. ${tx.method.toUpperCase()} ${tx.type} ${sign}$${tx.amount.toLocaleString()} - ${tx.status}`);
        });
        console.log('');

        // 9. Check transaction limits
        console.log('13. 📋 Checking Transaction Limits...');
        const limitsResponse = await axios.get(`${BANKING_API}/api/banking/limits/${DEMO_USER_ID}`);
        console.log('✅ Transaction Limits:');
        console.log(`   Daily Deposit Limit: $${limitsResponse.data.data.deposit.daily.toLocaleString()}`);
        console.log(`   Daily Withdrawal Limit: $${limitsResponse.data.data.withdrawal.daily.toLocaleString()}`);
        console.log(`   Monthly Deposit Limit: $${limitsResponse.data.data.deposit.monthly.toLocaleString()}`);
        console.log(`   Monthly Withdrawal Limit: $${limitsResponse.data.data.withdrawal.monthly.toLocaleString()}\n`);

        // 10. Final balance check
        console.log('14. 💰 Final Account Balance...');
        const finalBalanceResponse = await axios.get(`${BANKING_API}/api/banking/balance/${DEMO_USER_ID}`);
        console.log(`✅ Final Balance: $${finalBalanceResponse.data.data.availableBalance.toLocaleString()}`);
        console.log(`   Pending Deposits: $${finalBalanceResponse.data.data.pendingDeposits.toLocaleString()}`);
        console.log(`   Pending Withdrawals: $${finalBalanceResponse.data.data.pendingWithdrawals.toLocaleString()}\n`);

        console.log('🎉 Banking System Demo Completed Successfully!');
        console.log('=====================================');
        console.log('✅ User Registration & KYC Verification');
        console.log('✅ Bank Account Addition & Verification');
        console.log('✅ Instant Deposits (with fees)');
        console.log('✅ ACH Deposits (free, delayed)');
        console.log('✅ ACH Withdrawals (free, delayed)');
        console.log('✅ Transaction History & Tracking');
        console.log('✅ Balance Management');
        console.log('✅ Transaction Limits & Compliance');
        console.log('');
        console.log('🌐 Banking Dashboard: http://localhost:3003/banking-dashboard.html');
        console.log('📊 API Health Check: http://localhost:3003/api/health');

    } catch (error) {
        console.error('❌ Demo failed:', error.response?.data || error.message);
    }
}

// Run the demo
demonstrateBankingSystem();
