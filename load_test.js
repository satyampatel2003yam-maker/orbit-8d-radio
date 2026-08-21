const http = require('http');

const CONCURRENT_USERS = 500;
const API_URL = 'http://localhost:3000';
let successCount = 0;
let failCount = 0;

async function simulateUser(id) {
  try {
    const clientId = `test-user-${id}`;
    
    // 1. Fetch live rotation status
    await fetch(`${API_URL}/api/live/night-bass`);
    
    // 2. Fetch listeners count
    const res = await fetch(`${API_URL}/api/listeners?clientId=${clientId}`);
    if (res.ok) {
      successCount++;
    } else {
      failCount++;
    }
  } catch (err) {
    failCount++;
  }
}

async function runTest() {
  console.log(`Starting load test with ${CONCURRENT_USERS} simulated users...`);
  const startTime = Date.now();
  
  const promises = [];
  for (let i = 0; i < CONCURRENT_USERS; i++) {
    promises.push(simulateUser(i));
  }
  
  await Promise.all(promises);
  
  const duration = Date.now() - startTime;
  console.log(`Test completed in ${duration}ms.`);
  console.log(`Successful requests: ${successCount}`);
  console.log(`Failed requests: ${failCount}`);
  
  // verify active listener count on server
  try {
    const res = await fetch(`${API_URL}/api/listeners`);
    const data = await res.json();
    console.log(`Server reports ${data.count} active listeners right now!`);
  } catch(e) {}
}

runTest();
