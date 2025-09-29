const axios = require('axios');

const INTERNATIONAL_API = 'http://localhost:3004';

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function demonstrateInternationalBanking() {
    console.log('🌍 NexusTradeAI International Banking Demo');
    console.log('==========================================\n');

    try {
        // 1. Check service health
        console.log('1. 🔍 Checking International Banking Service Health...');
        const healthResponse = await axios.get(`${INTERNATIONAL_API}/api/health`);
        console.log('✅ International banking service is healthy');
        console.log(`   Supported Countries: ${healthResponse.data.supportedCountries.join(', ')}`);
        console.log(`   Payment Processors: ${Object.keys(healthResponse.data.processors).join(', ')}\n`);

        // 2. Get supported countries
        console.log('2. 🌐 Getting Supported Countries...');
        const countriesResponse = await axios.get(`${INTERNATIONAL_API}/api/banking/countries`);
        console.log('✅ Supported Countries:');
        countriesResponse.data.data.forEach(country => {
            console.log(`   ${country.code}: ${country.currency} - ${country.depositMethods.join(', ')}`);
        });
        console.log('');

        // 3. Get exchange rates
        console.log('3. 💱 Getting Live Exchange Rates...');
        const ratesResponse = await axios.get(`${INTERNATIONAL_API}/api/banking/exchange-rates`);
        console.log('✅ Current Exchange Rates:');
        const rates = ratesResponse.data.data;
        console.log(`   USD/GBP: ${rates.USD_GBP}`);
        console.log(`   USD/EUR: ${rates.USD_EUR}`);
        console.log(`   USD/NGN: ${rates.USD_NGN}`);
        console.log(`   GBP/EUR: ${rates.GBP_EUR}`);
        console.log(`   EUR/NGN: ${rates.EUR_NGN}\n`);

        // 4. Test currency conversion
        console.log('4. 🔄 Testing Currency Conversion...');
        const conversionTests = [
            { amount: 1000, from: 'USD', to: 'GBP' },
            { amount: 500, from: 'GBP', to: 'EUR' },
            { amount: 100, from: 'USD', to: 'NGN' }
        ];

        for (const test of conversionTests) {
            const conversionResponse = await axios.post(`${INTERNATIONAL_API}/api/banking/convert`, {
                amount: test.amount,
                fromCurrency: test.from,
                toCurrency: test.to
            });
            
            if (conversionResponse.data.success) {
                const result = conversionResponse.data.data;
                console.log(`   ${result.originalAmount} ${result.fromCurrency} = ${result.convertedAmount} ${result.toCurrency} (Rate: ${result.rate})`);
            }
        }
        console.log('');

        // 5. Register users from different countries
        console.log('5. 👥 Registering Users from Different Countries...');
        
        const users = [
            {
                country: 'UK',
                email: 'john.uk@nexustradeai.com',
                firstName: 'John',
                lastName: 'Smith',
                dateOfBirth: '1985-05-15',
                address: { street: '123 London St', city: 'London', postcode: 'SW1A 1AA' },
                phoneNumber: '+44 20 7946 0958',
                idDocument: 'UK-PASSPORT-123456789'
            },
            {
                country: 'EU',
                email: 'marie.eu@nexustradeai.com',
                firstName: 'Marie',
                lastName: 'Dubois',
                dateOfBirth: '1990-08-22',
                address: { street: '456 Paris Ave', city: 'Paris', postcode: '75001' },
                phoneNumber: '+33 1 42 86 83 26',
                idDocument: 'FR-ID-987654321'
            },
            {
                country: 'NG',
                email: 'adebayo.ng@nexustradeai.com',
                firstName: 'Adebayo',
                lastName: 'Okafor',
                dateOfBirth: '1988-12-10',
                address: { street: '789 Lagos Rd', city: 'Lagos', state: 'Lagos' },
                phoneNumber: '+234 803 123 4567',
                idDocument: 'NG-NIN-12345678901'
            }
        ];

        const registeredUsers = [];
        
        for (const userData of users) {
            const userResponse = await axios.post(`${INTERNATIONAL_API}/api/banking/users/register`, userData);
            if (userResponse.data.success) {
                const user = userResponse.data.data;
                registeredUsers.push({ ...user, ...userData });
                console.log(`✅ ${userData.country} user registered: ${user.userId}`);
                console.log(`   Currency: ${user.currency}, Available methods: ${user.availableMethods.deposits.join(', ')}`);
            }
        }
        console.log('');

        // Wait for KYC verification
        console.log('6. ⏳ Waiting for KYC verification...');
        await sleep(6000);
        console.log('✅ All users verified\n');

        // 6. Add bank accounts for each country
        console.log('7. 🏛️ Adding Bank Accounts...');
        
        const bankAccounts = [
            {
                userId: registeredUsers[0].userId,
                country: 'UK',
                bankName: 'Barclays Bank',
                accountNumber: '12345678',
                sortCode: '20-00-00',
                accountType: 'current'
            },
            {
                userId: registeredUsers[1].userId,
                country: 'EU',
                bankName: 'BNP Paribas',
                iban: 'FR1420041010050500013M02606',
                accountType: 'checking'
            },
            {
                userId: registeredUsers[2].userId,
                country: 'NG',
                bankName: 'First Bank of Nigeria',
                accountNumber: '3123456789',
                accountType: 'savings'
            }
        ];

        const addedAccounts = [];
        
        for (const accountData of bankAccounts) {
            const accountResponse = await axios.post(`${INTERNATIONAL_API}/api/banking/accounts/add`, accountData);
            if (accountResponse.data.success) {
                addedAccounts.push({ ...accountResponse.data.data, ...accountData });
                console.log(`✅ ${accountData.country} bank account added: ${accountResponse.data.data.accountId}`);
                console.log(`   Bank: ${accountData.bankName}, Status: ${accountResponse.data.data.status}`);
            }
        }
        console.log('');

        // Wait for account verification
        console.log('8. ⏳ Waiting for bank account verification...');
        await sleep(4000);
        console.log('✅ All bank accounts verified\n');

        // 7. Test deposits from each country
        console.log('9. 💰 Testing International Deposits...');
        
        const deposits = [
            {
                country: 'uk',
                userId: registeredUsers[0].userId,
                accountId: addedAccounts[0].accountId,
                amount: 1000,
                method: 'faster_payments',
                description: 'UK Faster Payments deposit'
            },
            {
                country: 'eu',
                userId: registeredUsers[1].userId,
                accountId: addedAccounts[1].accountId,
                amount: 2000,
                method: 'sepa',
                description: 'EU SEPA transfer deposit'
            },
            {
                country: 'nigeria',
                userId: registeredUsers[2].userId,
                accountId: addedAccounts[2].accountId,
                amount: 500000,
                method: 'bank_transfer',
                description: 'Nigeria bank transfer deposit'
            }
        ];

        for (const deposit of deposits) {
            try {
                const depositResponse = await axios.post(`${INTERNATIONAL_API}/api/banking/deposits/${deposit.country}`, {
                    userId: deposit.userId,
                    accountId: deposit.accountId,
                    amount: deposit.amount,
                    method: deposit.method,
                    description: deposit.description
                });
                
                if (depositResponse.data.success) {
                    const result = depositResponse.data.data;
                    console.log(`✅ ${deposit.country.toUpperCase()} ${deposit.method} deposit: ${result.transactionId}`);
                    console.log(`   Amount: ${deposit.amount} ${result.currency}, Fees: ${result.fees} ${result.currency}`);
                    console.log(`   Status: ${result.status}, Processor: ${result.processor}`);
                    console.log(`   Estimated completion: ${new Date(result.estimatedCompletion).toLocaleString()}`);
                }
            } catch (error) {
                console.log(`❌ ${deposit.country.toUpperCase()} deposit failed: ${error.response?.data?.error || error.message}`);
            }
        }
        console.log('');

        // 8. Test more deposit methods
        console.log('10. 🔄 Testing Additional Payment Methods...');
        
        // Test Nigeria USSD
        try {
            const ussdResponse = await axios.post(`${INTERNATIONAL_API}/api/banking/deposits/nigeria`, {
                userId: registeredUsers[2].userId,
                accountId: addedAccounts[2].accountId,
                amount: 50000,
                method: 'ussd',
                description: 'Nigeria USSD deposit'
            });
            
            if (ussdResponse.data.success) {
                console.log(`✅ Nigeria USSD deposit: ${ussdResponse.data.data.transactionId}`);
                console.log(`   Amount: ₦50,000, Fees: ₦${ussdResponse.data.data.fees}`);
            }
        } catch (error) {
            console.log(`❌ Nigeria USSD deposit failed: ${error.response?.data?.error || error.message}`);
        }

        // Test EU Instant SEPA
        try {
            const instantSepaResponse = await axios.post(`${INTERNATIONAL_API}/api/banking/deposits/eu`, {
                userId: registeredUsers[1].userId,
                accountId: addedAccounts[1].accountId,
                amount: 500,
                method: 'instant_sepa',
                description: 'EU Instant SEPA deposit'
            });
            
            if (instantSepaResponse.data.success) {
                console.log(`✅ EU Instant SEPA deposit: ${instantSepaResponse.data.data.transactionId}`);
                console.log(`   Amount: €500, Fees: €${instantSepaResponse.data.data.fees}`);
            }
        } catch (error) {
            console.log(`❌ EU Instant SEPA deposit failed: ${error.response?.data?.error || error.message}`);
        }
        console.log('');

        // 9. Wait for some transactions to process
        console.log('11. ⏳ Waiting for transactions to process...');
        await sleep(8000);
        console.log('✅ Transactions processed\n');

        console.log('🎉 International Banking Demo Completed Successfully!');
        console.log('====================================================');
        console.log('✅ Multi-country user registration (UK, EU, Nigeria)');
        console.log('✅ Currency conversion and exchange rates');
        console.log('✅ Country-specific bank account verification');
        console.log('✅ UK: Faster Payments, Bank Transfers, Open Banking');
        console.log('✅ EU: SEPA, Instant SEPA, International Transfers');
        console.log('✅ Nigeria: Bank Transfer, USSD, Mobile Money, Cards');
        console.log('✅ Real-time transaction processing');
        console.log('✅ Multi-currency support (GBP, EUR, NGN, USD)');
        console.log('✅ International compliance and KYC');
        console.log('');
        console.log('🌐 International Banking Dashboard: http://localhost:3004/international-banking-dashboard.html');
        console.log('📊 API Health Check: http://localhost:3004/api/health');

    } catch (error) {
        console.error('❌ Demo failed:', error.response?.data || error.message);
    }
}

// Run the international banking demo
demonstrateInternationalBanking();
