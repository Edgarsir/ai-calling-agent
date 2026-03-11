require('dotenv').config();
const Groq = require('groq-sdk');

console.log('========================================');
console.log('   Testing Groq Connection');
console.log('========================================\n');

// Check if API key exists
if (!process.env.GROQ_API_KEY) {
  console.error('❌ GROQ_API_KEY not found in .env file!');
  console.error('   Please add: GROQ_API_KEY=your_key_here');
  process.exit(1);
}

console.log('✅ GROQ_API_KEY found');
console.log('   Key preview:', process.env.GROQ_API_KEY.substring(0, 20) + '...\n');

// Initialize Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

console.log('Testing Groq API...\n');

// Test 1: Simple English response
async function testEnglish() {
  console.log('Test 1: English Response');
  console.log('------------------------');
  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Say hello in one sentence.' }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
      max_tokens: 50
    });
    
    const response = completion.choices[0]?.message?.content;
    console.log('✅ Success!');
    console.log('   Response:', response);
    console.log('   Tokens used:', completion.usage?.total_tokens || 'N/A');
    console.log();
    return true;
  } catch (error) {
    console.error('❌ Failed!');
    console.error('   Error:', error.message);
    console.error('   Details:', error.response?.data || error);
    console.log();
    return false;
  }
}

// Test 2: Hindi response
async function testHindi() {
  console.log('Test 2: Hindi Response');
  console.log('------------------------');
  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a Hindi-speaking customer support agent.' },
        { role: 'user', content: 'नमस्ते, आप कौन हैं?' }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
      max_tokens: 100
    });
    
    const response = completion.choices[0]?.message?.content;
    console.log('✅ Success!');
    console.log('   Response:', response);
    console.log('   Tokens used:', completion.usage?.total_tokens || 'N/A');
    console.log();
    return true;
  } catch (error) {
    console.error('❌ Failed!');
    console.error('   Error:', error.message);
    console.error('   Details:', error.response?.data || error);
    console.log();
    return false;
  }
}

// Test 3: Streaming response
async function testStreaming() {
  console.log('Test 3: Streaming Response');
  console.log('------------------------');
  try {
    const stream = await groq.chat.completions.create({
      messages: [
        { role: 'user', content: 'Count from 1 to 5' }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
      max_tokens: 50,
      stream: true
    });
    
    console.log('✅ Streaming started...');
    process.stdout.write('   Response: ');
    
    let fullResponse = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      process.stdout.write(content);
      fullResponse += content;
    }
    
    console.log('\n   ✅ Streaming complete!');
    console.log();
    return true;
  } catch (error) {
    console.error('❌ Failed!');
    console.error('   Error:', error.message);
    console.error('   Details:', error.response?.data || error);
    console.log();
    return false;
  }
}

// Run all tests
async function runTests() {
  const test1 = await testEnglish();
  const test2 = await testHindi();
  const test3 = await testStreaming();
  
  console.log('========================================');
  console.log('   Test Results');
  console.log('========================================');
  console.log('English Response:', test1 ? '✅ PASS' : '❌ FAIL');
  console.log('Hindi Response:', test2 ? '✅ PASS' : '❌ FAIL');
  console.log('Streaming:', test3 ? '✅ PASS' : '❌ FAIL');
  console.log();
  
  if (test1 && test2 && test3) {
    console.log('🎉 All tests passed! Groq is working correctly.');
    console.log('   You can now deploy to Railway.');
  } else {
    console.log('⚠️  Some tests failed. Check your API key and try again.');
    console.log('   Make sure GROQ_API_KEY is valid and has credits.');
  }
}

runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
