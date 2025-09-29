// Simple test to debug the import issue
console.log('Testing imports...');

try {
  const Formatters = require('./libs/utils/formatters');
  console.log('Formatters imported:', typeof Formatters);
  console.log('Formatters.currency:', typeof Formatters.currency);
  
  const result = Formatters.currency(100000);
  console.log('Currency format result:', result);
} catch (error) {
  console.error('Error importing Formatters:', error.message);
}

try {
  const shared = require('./index');
  console.log('Shared library imported:', typeof shared);
  console.log('Shared.Formatters:', typeof shared.Formatters);
} catch (error) {
  console.error('Error importing shared library:', error.message);
}
