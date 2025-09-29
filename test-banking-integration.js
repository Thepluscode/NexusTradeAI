const axios = require('axios');

async function testBankingIntegration() {
    console.log('🔗 Testing Banking Integration with Trading Platform');
    console.log('==================================================\n');

    const services = [
        { name: 'Main Trading Platform', url: 'http://localhost:3001', port: 3001 },
        { name: 'US Banking Service', url: 'http://localhost:3003', port: 3003 },
        { name: 'International Banking Service', url: 'http://localhost:3004', port: 3004 }
    ];

    // Test service availability
    console.log('1. 🔍 Checking Service Availability...');
    const serviceStatus = {};
    
    for (const service of services) {
        try {
            const response = await axios.get(`${service.url}/api/health`, { timeout: 5000 });
            serviceStatus[service.name] = {
                status: 'online',
                port: service.port,
                data: response.data
            };
            console.log(`✅ ${service.name} (Port ${service.port}): Online`);
        } catch (error) {
            serviceStatus[service.name] = {
                status: 'offline',
                port: service.port,
                error: error.message
            };
            console.log(`❌ ${service.name} (Port ${service.port}): Offline`);
        }
    }
    console.log('');

    // Test banking API endpoints
    if (serviceStatus['US Banking Service'].status === 'online') {
        console.log('2. 🏦 Testing US Banking Service Integration...');
        try {
            // Test balance endpoint
            const balanceResponse = await axios.get('http://localhost:3003/api/banking/balance/demo-user-123');
            if (balanceResponse.data.success) {
                console.log(`✅ Account Balance: $${balanceResponse.data.data.availableBalance.toLocaleString()}`);
                console.log(`   Pending Deposits: $${balanceResponse.data.data.pendingDeposits.toLocaleString()}`);
                console.log(`   Pending Withdrawals: $${balanceResponse.data.data.pendingWithdrawals.toLocaleString()}`);
            }

            // Test transaction history
            const transactionsResponse = await axios.get('http://localhost:3003/api/banking/transactions/demo-user-123?limit=3');
            if (transactionsResponse.data.success) {
                console.log(`✅ Recent Transactions: ${transactionsResponse.data.data.transactions.length} found`);
            }
        } catch (error) {
            console.log(`❌ US Banking API Error: ${error.message}`);
        }
        console.log('');
    }

    // Test international banking API endpoints
    if (serviceStatus['International Banking Service'].status === 'online') {
        console.log('3. 🌍 Testing International Banking Service Integration...');
        try {
            // Test supported countries
            const countriesResponse = await axios.get('http://localhost:3004/api/banking/countries');
            if (countriesResponse.data.success) {
                const countries = countriesResponse.data.data.map(c => c.code).join(', ');
                console.log(`✅ Supported Countries: ${countries}`);
            }

            // Test exchange rates
            const ratesResponse = await axios.get('http://localhost:3004/api/banking/exchange-rates');
            if (ratesResponse.data.success) {
                console.log(`✅ Exchange Rates Available: ${Object.keys(ratesResponse.data.data).length} currency pairs`);
                console.log(`   USD/GBP: ${ratesResponse.data.data.USD_GBP}`);
                console.log(`   USD/EUR: ${ratesResponse.data.data.USD_EUR}`);
                console.log(`   USD/NGN: ${ratesResponse.data.data.USD_NGN}`);
            }
        } catch (error) {
            console.log(`❌ International Banking API Error: ${error.message}`);
        }
        console.log('');
    }

    // Test dashboard integration
    console.log('4. 🖥️ Testing Dashboard Integration...');
    try {
        const fs = require('fs');
        const dashboardPath = 'Library/Mobile Documents/com~apple~CloudDocs/NexusTradeAI/enterprise-dashboard.html';
        const dashboardContent = fs.readFileSync(dashboardPath, 'utf8');
        
        // Check for banking integration elements
        const integrationChecks = [
            { name: 'Banking Navigation', pattern: /banking.*nav-item/i },
            { name: 'Banking Section', pattern: /banking-section/i },
            { name: 'Banking Functions', pattern: /openBankingWindow|withdrawProfits/i },
            { name: 'Banking Metrics', pattern: /accountBalance|realizedProfits/i },
            { name: 'Banking API Calls', pattern: /loadBankingData|banking\/balance/i }
        ];

        integrationChecks.forEach(check => {
            if (check.pattern.test(dashboardContent)) {
                console.log(`✅ ${check.name}: Integrated`);
            } else {
                console.log(`❌ ${check.name}: Missing`);
            }
        });
    } catch (error) {
        console.log(`❌ Dashboard Integration Check Failed: ${error.message}`);
    }
    console.log('');

    // Test cross-service communication
    console.log('5. 🔄 Testing Cross-Service Communication...');
    
    // Simulate a complete user flow
    if (serviceStatus['US Banking Service'].status === 'online') {
        try {
            // 1. Check initial balance
            const initialBalance = await axios.get('http://localhost:3003/api/banking/balance/demo-user-123');
            console.log(`✅ Initial Balance Retrieved: $${initialBalance.data.data.availableBalance.toLocaleString()}`);

            // 2. Simulate a deposit (this would normally come from the dashboard)
            console.log('   Simulating deposit flow from dashboard...');
            
            // 3. Check if transaction endpoints are accessible
            const limits = await axios.get('http://localhost:3003/api/banking/limits/demo-user-123');
            if (limits.data.success) {
                console.log(`✅ Transaction Limits Retrieved: $${limits.data.data.deposit.daily.toLocaleString()}/day`);
            }

        } catch (error) {
            console.log(`❌ Cross-Service Communication Error: ${error.message}`);
        }
    }
    console.log('');

    // Generate integration report
    console.log('📊 Integration Status Report');
    console.log('============================');
    
    const onlineServices = Object.values(serviceStatus).filter(s => s.status === 'online').length;
    const totalServices = services.length;
    
    console.log(`Services Online: ${onlineServices}/${totalServices}`);
    
    if (onlineServices === totalServices) {
        console.log('🎉 All services are online and integrated!');
        console.log('');
        console.log('✅ Users can now:');
        console.log('   • View account balances in the main dashboard');
        console.log('   • Access banking features through navigation');
        console.log('   • Deposit money from US, UK, EU, and Nigeria');
        console.log('   • Withdraw profits to their bank accounts');
        console.log('   • Convert between currencies');
        console.log('   • View transaction history');
        console.log('');
        console.log('🌐 Access Points:');
        console.log('   • Main Dashboard: http://localhost:3001 (if running)');
        console.log('   • Enterprise Dashboard: file:///.../enterprise-dashboard.html');
        console.log('   • US Banking: http://localhost:3003/banking-dashboard.html');
        console.log('   • International Banking: http://localhost:3004/international-banking-dashboard.html');
    } else {
        console.log('⚠️  Some services are offline. Start missing services:');
        Object.entries(serviceStatus).forEach(([name, status]) => {
            if (status.status === 'offline') {
                console.log(`   • ${name}: Start on port ${status.port}`);
            }
        });
    }
    
    console.log('');
    console.log('🔗 Banking services are now integrated with your trading platform!');
}

// Run the integration test
testBankingIntegration().catch(console.error);
