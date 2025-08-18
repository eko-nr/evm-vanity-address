const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const { randomBytes } = require("crypto");
const fs = require("fs");
const os = require("os");

// Use native secp256k1 + js-sha3 for maximum performance
const secp256k1 = require("secp256k1");
const { keccak256 } = require("js-sha3");

function getFlagValue(flagName, defaultValue) {
  const arg = process.argv.find(a => a.startsWith(`--${flagName}=`));
  if (arg) {
    const val = arg.split("=")[1];
    return isNaN(val) ? defaultValue : parseInt(val, 10);
  }
  return defaultValue;
}

function calculateProbability(prefix, suffix) {
  const prefixProbability = Math.pow(16, prefix.length);
  const suffixProbability = suffix ? Math.pow(16, suffix.length) : 1;
  return prefixProbability * suffixProbability;
}

// Ultra-optimized single method using native secp256k1
function generateVanityAddress(privateKeyBuffer) {
  // Get uncompressed public key (65 bytes with 0x04 prefix)
  const publicKey = secp256k1.publicKeyCreate(privateKeyBuffer, false);
  
  // Remove 0x04 prefix and hash with Keccak-256
  const publicKeyBytes = publicKey.slice(1);
  const hash = keccak256.arrayBuffer(publicKeyBytes);
  
  // Last 20 bytes = address
  const addressBytes = new Uint8Array(hash).slice(-20);
  
  return {
    address: '0x' + Buffer.from(addressBytes).toString('hex'),
    privateKey: '0x' + privateKeyBuffer.toString('hex')
  };
}

// Pre-compile regex for faster matching
function createMatcher(prefix, suffix) {
  const prefixRegex = new RegExp(`^0x${prefix}`, 'i');
  const suffixRegex = suffix ? new RegExp(`${suffix}$`, 'i') : null;
  
  return (address) => {
    return prefixRegex.test(address) && (!suffixRegex || suffixRegex.test(address));
  };
}

if (isMainThread) {
  const prefix = (process.argv[2] || "00").toLowerCase();
  const suffix = (process.argv[3] || "dead").toLowerCase();

  const expectedTries = calculateProbability(prefix, suffix);
  const numWorkers = getFlagValue("maxWorker", os.cpus().length);
  const walletCount = getFlagValue("count", 1);

  console.log(`🚀 Ultra-Fast Vanity Generator (Native secp256k1)`);
  console.log(`   Library: secp256k1 (native) + js-sha3`);
  console.log(`   Prefix: ${prefix}`);
  console.log(`   Suffix: ${suffix}`);
  console.log(`   Expected tries: ~${expectedTries.toLocaleString()}`);
  console.log(`🖥  Using ${numWorkers} workers`);
  
  let foundCount = 0;
  const workers = [];
  const stats = {};
  const start = Date.now();

  for (let i = 0; i < numWorkers; i++) {
    const worker = new Worker(__filename, {
      workerData: { prefix, suffix, id: i }
    });
    workers.push(worker);

    worker.on("message", (msg) => {
      if (msg.type === "found") {
        foundCount++;
        console.log(`\n🎯 FOUND! Wallet #${foundCount}`);
        console.log(`Worker: ${msg.workerId}, Tries: ${msg.tries.toLocaleString()}`);
        console.log(`Time: ${msg.elapsed.toFixed(2)}s, Rate: ${msg.rate.toFixed(0)}/s`);
        console.log(`Address: ${msg.address}`);
        console.log(`Private: ${msg.privateKey}`);

        const output = `
🎯 Vanity Address #${foundCount}
Prefix: ${prefix}, Suffix: ${suffix}
Tries: ${msg.tries.toLocaleString()}
Time: ${msg.elapsed.toFixed(2)}s
Rate: ${msg.rate.toFixed(0)}/s
Address: ${msg.address}
Private: ${msg.privateKey}
------------------------
`;
        fs.appendFileSync("ultra-results.txt", output);
        console.log("💾 Saved to ultra-results.txt");

        if (foundCount >= walletCount) {
          console.log(`\n🏆 Complete! Found ${foundCount} vanity addresses.`);
          
          // Gracefully terminate workers
          workers.forEach(w => {
            w.postMessage({ type: "stop" });
          });
          
          // Give workers time to clean up, then exit
          setTimeout(() => {
            workers.forEach(w => w.terminate());
            process.exit(0);
          }, 100);
        }
      } else if (msg.type === "progress") {
        stats[msg.workerId] = msg;

        let totalTries = 0;
        let totalRate = 0;
        for (const w of Object.values(stats)) {
          totalTries += w.tries;
          totalRate += w.rate;
        }

        const elapsed = (Date.now() - start) / 1000;
        const etaSeconds = totalRate > 0 ? (expectedTries - totalTries) / totalRate : 0;
        
        const eta = etaSeconds < 60 ? `${etaSeconds.toFixed(0)}s` :
                   etaSeconds < 3600 ? `${(etaSeconds/60).toFixed(1)}m` :
                   `${(etaSeconds/3600).toFixed(1)}h`;

        process.stdout.write(
          `⚡ Tries: ${totalTries.toLocaleString()} | Rate: ${totalRate.toFixed(0)}/s | ETA: ${eta}     \r`
        );
      }
    });

    worker.on("error", (error) => {
      console.error(`Worker ${i} error:`, error);
    });
  }

  // Optimistic estimate with native libraries
  const estimatedRate = 25000 * numWorkers; // Native is fastest
  const estimatedTime = expectedTries / estimatedRate;
  console.log(`⏱️  Estimated time: ~${estimatedTime < 3600 ? (estimatedTime/60).toFixed(1) + 'm' : (estimatedTime/3600).toFixed(1) + 'h'}`);
  console.log(`🔥 Starting generation...\n`);

} else {
  // WORKER THREAD - Maximum optimization
  const { prefix, suffix, id } = workerData;
  let tries = 0;
  const start = Date.now();
  
  // Pre-compile matcher for this worker
  const isMatch = createMatcher(prefix, suffix);
  
  // Large batch size for fewer interruptions
  const BATCH_SIZE = 2000;
  
  // Pre-allocate buffer for reuse
  const privateKeyBuffer = Buffer.alloc(32);
  
  try {
    while (true) {
      // Check for stop message
      if (parentPort && parentPort.hasRef()) {
        // This is a simple check - in practice you'd need a more robust message system
      }
      
      // Process in large batches
      for (let batch = 0; batch < BATCH_SIZE; batch++) {
        // Generate random private key directly into buffer
        randomBytes(32).copy(privateKeyBuffer);
        
        // Skip invalid private keys (very rare but necessary for native lib)
        if (!secp256k1.privateKeyVerify(privateKeyBuffer)) {
          continue;
        }
        
        const wallet = generateVanityAddress(privateKeyBuffer);
        tries++;

        if (isMatch(wallet.address)) {
          const elapsed = (Date.now() - start) / 1000;
          const rate = tries / elapsed;

          parentPort.postMessage({
            type: "found",
            workerId: id,
            tries,
            elapsed,
            rate,
            address: wallet.address,
            privateKey: wallet.privateKey,
          });
          return;
        }
      }

      // Report progress less frequently
      if (tries % 10000 === 0) {
        const elapsed = (Date.now() - start) / 1000;
        const rate = tries / elapsed;
        parentPort.postMessage({
          type: "progress",
          workerId: id,
          tries,
          elapsed,
          rate,
        });
      }
    }
  } catch (error) {
    parentPort.postMessage({
      type: "error",
      workerId: id,
      error: error.message
    });
  }
}